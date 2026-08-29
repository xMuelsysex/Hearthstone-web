import { canonicalUtf8V1 } from '@/log/canonicalize'
import { hashCanonicalValue, sha256Hex, type Sha256Hex } from '@/log/hash'
import { M2_REWARD_AMOUNT, openPack, hashPackFixture, type PackOpenResult } from '@/economy/packAlgorithm'
import { packTransactionPayload, type PackTransactionFixture } from '@/economy/packContract'
import type { ActiveGameLogV1, AnyGameLogV1, CompletedGameLogV1 } from '@/log/schema'
import { replayLog } from '@/log/replay'
import { buildStorageRootV2FromV1, migrationSourceSha256 } from '@/storage/migrationV2'
import { assertRootBudgetV2, fitCompletedLogs, LOG_BYTE_LIMIT } from '@/storage/byteBudget'
import { assertStorageRootV2, cloneStorageRootV2, createEmptyStorageRootV2, type FinalizeMetadataV2, type StorageRootV2 } from '@/storage/schemaV2'
import { STORAGE_KEY } from '@/storage/schema'
import { GameRepository } from '@/storage/repository'

export type RootTransactionErrorCode =
  | 'STALE_ROOT'
  | 'LOCK_UNAVAILABLE'
  | 'ROOT_SCHEMA_INVALID'
  | 'MIGRATION_FAILED'
  | 'PERSISTENCE_FAILED'
  | 'QUOTA_EXCEEDED'
  | 'WRITE_VERIFICATION_FAILED'
  | 'ACTIVE_GAME_CONFLICT'
  | 'GAME_ID_CONFLICT'
  | 'FINALIZE_ACTIVE_MISSING'
  | 'FINALIZE_LOG_INVALID'
  | 'REWARD_CONFLICT'
  | 'PACK_TRANSACTION_CONFLICT'
  | 'RAW_ARTIFACT_TOO_LARGE'

export class RootTransactionError extends Error {
  constructor(readonly code: RootTransactionErrorCode, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause })
    this.name = 'RootTransactionError'
  }
}

export interface RootLockProvider {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>
}

type RootMutationResult<T> = T | { readonly noWrite: true; readonly value: T }
type RootMutation<T> = (root: StorageRootV2) => RootMutationResult<T> | Promise<RootMutationResult<T>>

export type RootTransactionResult<T> = {
  root: StorageRootV2
  result: T
  digest: Sha256Hex
  wrote: boolean
}

export type MigrationRequest = {
  now?: string
  includeRaw?: boolean
}

export type FinalizeRequest = {
  log: CompletedGameLogV1
  now?: string
}

export type OpenPackRequest = {
  seed: number
  packSequence?: number
}

export type FinalizeResult = {
  metadata: FinalizeMetadataV2
  idempotent: boolean
}

export type PackCommitResult = {
  fixture: PackTransactionFixture
  idempotent: boolean
}

const processLockTails = new Map<string, Promise<void>>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype
}

function noWrite<T>(value: T): { readonly noWrite: true; readonly value: T } {
  return { noWrite: true, value }
}

function isNoWrite<T>(value: RootMutationResult<T>): value is { readonly noWrite: true; readonly value: T } {
  return typeof value === 'object' && value !== null && 'noWrite' in value && value.noWrite === true && 'value' in value
}

function isQuotaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as { name?: unknown; message?: unknown }
  return candidate.name === 'QuotaExceededError' || (typeof candidate.message === 'string' && candidate.message.includes('Quota exceeded'))
}

async function withProcessLock<T>(name: string, callback: () => Promise<T>): Promise<T> {
  const previous = processLockTails.get(name) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const tail = previous.then(() => gate)
  processLockTails.set(name, tail)
  await previous
  try {
    return await callback()
  } finally {
    release()
    if (processLockTails.get(name) === tail) processLockTails.delete(name)
  }
}

function defaultLockProvider(): RootLockProvider | null {
  if (typeof navigator === 'undefined' || !navigator.locks) return null
  return {
    request: <T>(name: string, callback: () => Promise<T>) => navigator.locks.request(name, { mode: 'exclusive' }, callback),
  }
}

function cloneLog<T extends AnyGameLogV1>(log: T): T {
  return structuredClone(log)
}

function canonicalBytesEqual(left: unknown, right: unknown): boolean {
  const leftBytes = canonicalUtf8V1(left)
  const rightBytes = canonicalUtf8V1(right)
  return leftBytes.length === rightBytes.length && leftBytes.every((byte, index) => byte === rightBytes[index])
}

function isHistoryPrefix(active: ActiveGameLogV1, completed: CompletedGameLogV1): boolean {
  if (active.gameId !== completed.gameId || active.createdAt !== completed.createdAt) return false
  if (active.rulesVersion !== completed.rulesVersion || active.cardDataVersion !== completed.cardDataVersion || active.scenarioVersion !== completed.scenarioVersion || active.rngAlgorithmVersion !== completed.rngAlgorithmVersion) return false
  if (active.initialStateHash !== completed.initialStateHash || active.batches.length > completed.batches.length) return false
  if (!canonicalBytesEqual(active.initialState, completed.initialState)) return false
  for (let index = 0; index < active.batches.length; index += 1) {
    if (!canonicalBytesEqual(active.batches[index], completed.batches[index])) return false
  }
  const prefixEventCount = completed.batches.slice(0, active.batches.length).reduce((sum, batch) => sum + batch.events.length, 0)
  if (active.totalEventCount !== prefixEventCount) return false
  const prefixStateHash = active.batches.at(-1)?.postBatchStateHash ?? completed.initialStateHash
  return active.currentStateHash === prefixStateHash
}

function digestBytes(value: unknown): Uint8Array {
  return canonicalUtf8V1(value)
}

async function rootDigest(root: StorageRootV2): Promise<Sha256Hex> {
  return hashCanonicalValue(root)
}

function appendCompleted(root: StorageRootV2, log: CompletedGameLogV1): void {
  root.completedGameLogs = fitCompletedLogs([
    ...root.completedGameLogs.filter((item) => item.gameId !== log.gameId),
    cloneLog(log),
  ])
}

async function fixtureWithRevision(fixture: PackTransactionFixture, revision: number): Promise<PackTransactionFixture> {
  const payload = { ...packTransactionPayload(fixture), finalRevision: revision }
  const bytes = Array.from(canonicalUtf8V1(payload))
  const hash = await hashPackFixture({
    ...payload,
    canonicalTransactionBytes: bytes,
    canonicalTransactionHash: fixture.canonicalTransactionHash,
  })
  return {
    ...payload,
    canonicalTransactionBytes: bytes,
    canonicalTransactionHash: hash,
  }
}

export class RootTransactionCoordinator {
  private readonly lockProvider: RootLockProvider | null

  constructor(
    private readonly repository: GameRepository,
    options: { lockProvider?: RootLockProvider; now?: () => string } = {},
  ) {
    this.lockProvider = options.lockProvider ?? defaultLockProvider()
    this.now = options.now ?? (() => new Date().toISOString())
  }

  private readonly now: () => string

  async load(): Promise<StorageRootV2> {
    return (await this.readPersistedRoot(true)).root
  }

  async migrate(request: MigrationRequest = {}): Promise<RootTransactionResult<void>> {
    return this.runLocked(async () => {
      const raw = this.repository.loadRaw()
      if (raw === null) {
        const root = createEmptyStorageRootV2(request.now ?? this.now())
        return this.noWriteResult(root, undefined)
      }
      const parsed = this.parseRaw(raw)
      if (parsed.schemaVersion === 2) {
        assertStorageRootV2(parsed)
        return this.noWriteResult(structuredClone(parsed), undefined)
      }
      if (parsed.schemaVersion !== 1) throw new RootTransactionError('ROOT_SCHEMA_INVALID')
      let root: StorageRootV2
      try {
        root = await buildStorageRootV2FromV1(raw, {
          now: request.now ?? this.now(),
          includeRaw: request.includeRaw !== false,
        })
      } catch (error) {
        if (error instanceof Error && error.message === 'MIGRATION_RAW_TOO_LARGE') throw new RootTransactionError('RAW_ARTIFACT_TOO_LARGE', error)
        throw new RootTransactionError('MIGRATION_FAILED', error)
      }
      root.revision = 1
      return this.commitRoot(root, undefined, undefined)
    })
  }

  async transact<T>(expectedRevision: number | undefined, mutation: RootMutation<T>): Promise<RootTransactionResult<T>> {
    return this.runLocked(async () => {
      const persisted = await this.readPersistedRoot(true)
      if (expectedRevision !== undefined && persisted.root.revision !== expectedRevision) {
        throw new RootTransactionError('STALE_ROOT')
      }
      const candidate = cloneStorageRootV2(persisted.root)
      const mutationResult = await mutation(candidate)
      if (isNoWrite(mutationResult)) return this.noWriteResult(persisted.root, mutationResult.value)
      candidate.revision = persisted.root.revision + 1
      return this.commitRoot(candidate, mutationResult, persisted.root)
    })
  }

  async installActive(log: ActiveGameLogV1, expectedRevision?: number): Promise<RootTransactionResult<ActiveGameLogV1>> {
    return this.transact(expectedRevision, (root) => {
      if (root.activeGameLog && root.activeGameLog.gameId !== log.gameId) throw new RootTransactionError('ACTIVE_GAME_CONFLICT')
      root.activeGameLog = cloneLog(log)
      return cloneLog(log)
    })
  }

  async importCompleted(log: CompletedGameLogV1, expectedRevision?: number): Promise<RootTransactionResult<{ idempotent: boolean }>> {
    return this.transact<{ idempotent: boolean }>(expectedRevision, (root) => {
      const existing = [root.activeGameLog, ...root.completedGameLogs].find((item) => item?.gameId === log.gameId)
      if (existing) {
        if (existing.contentDigest !== log.contentDigest) throw new RootTransactionError('GAME_ID_CONFLICT')
        return noWrite({ idempotent: true })
      }
      if (root.activeGameLog?.gameId === log.gameId) root.activeGameLog = null
      appendCompleted(root, log)
      root.finalizedGames[log.gameId] = {
        gameId: log.gameId,
        result: log.result,
        eligible: false,
        source: 'V1_IMPORT',
        finalizedAt: log.completedAt,
      }
      return { idempotent: false }
    })
  }

  async finalize(request: FinalizeRequest, expectedRevision?: number): Promise<RootTransactionResult<FinalizeResult>> {
    const { log } = request
    try {
      await replayLog(log)
    } catch (error) {
      throw new RootTransactionError('FINALIZE_LOG_INVALID', error)
    }
    return this.transact<FinalizeResult>(expectedRevision, async (root) => {
      const existingMetadata = root.finalizedGames[log.gameId]
      if (existingMetadata) {
        if (existingMetadata.result !== log.result || existingMetadata.source !== 'M2_LOCAL_FINALIZE') {
          throw new RootTransactionError('REWARD_CONFLICT')
        }
        return noWrite({ metadata: structuredClone(existingMetadata), idempotent: true })
      }
      if (root.activeGameLog?.gameId !== log.gameId) throw new RootTransactionError('FINALIZE_ACTIVE_MISSING')
      if (!isHistoryPrefix(root.activeGameLog, log)) throw new RootTransactionError('GAME_ID_CONFLICT')
      if (root.rewardLedger[log.gameId]) throw new RootTransactionError('REWARD_CONFLICT')
      root.activeGameLog = null
      appendCompleted(root, log)
      const finalizedAt = request.now ?? this.now()
      const metadata: FinalizeMetadataV2 = {
        gameId: log.gameId,
        result: log.result,
        eligible: true,
        source: 'M2_LOCAL_FINALIZE',
        finalizedAt,
      }
      root.finalizedGames[log.gameId] = metadata
      root.rewardLedger[log.gameId] = {
        gameId: log.gameId,
        status: 'GRANTED',
        amount: M2_REWARD_AMOUNT,
        grantedAt: finalizedAt,
        source: 'M2_LOCAL_FINALIZE',
      }
      root.wallet = { gold: root.wallet.gold + M2_REWARD_AMOUNT }
      return { metadata, idempotent: false }
    })
  }

  async openPack(request: OpenPackRequest, expectedRevision?: number): Promise<RootTransactionResult<PackCommitResult>> {
    return this.transact<PackCommitResult>(expectedRevision, async (root) => {
      const packSequence = request.packSequence ?? root.packState.openedPacks + 1
      const existing = root.packTransactions.find((transaction) => transaction.packSequence === packSequence)
      if (existing) {
        if (existing.seed !== request.seed) throw new RootTransactionError('PACK_TRANSACTION_CONFLICT')
        return noWrite({ fixture: structuredClone(existing), idempotent: true })
      }
      const opened: PackOpenResult = await openPack({
        seed: request.seed,
        packSequence,
        collection: root.collection,
        packState: root.packState,
        wallet: root.wallet,
      })
      const finalRevision = root.revision + 1
      const fixture = await fixtureWithRevision(opened.fixture, finalRevision)
      root.collection = opened.collection
      root.packState = opened.packState
      root.wallet = opened.wallet
      root.packTransactions = [...root.packTransactions, fixture]
      return { fixture, idempotent: false }
    })
  }

  async grantReward(gameId: string, expectedRevision?: number): Promise<RootTransactionResult<{ idempotent: boolean }>> {
    return this.transact<{ idempotent: boolean }>(expectedRevision, (root) => {
      const finalized = root.finalizedGames[gameId]
      if (!finalized || !finalized.eligible || finalized.source !== 'M2_LOCAL_FINALIZE') throw new RootTransactionError('REWARD_CONFLICT')
      if (root.rewardLedger[gameId]) return noWrite({ idempotent: true })
      const grantedAt = this.now()
      root.rewardLedger[gameId] = {
        gameId,
        status: 'GRANTED',
        amount: M2_REWARD_AMOUNT,
        grantedAt,
        source: 'M2_LOCAL_FINALIZE',
      }
      root.wallet = { gold: root.wallet.gold + M2_REWARD_AMOUNT }
      return { idempotent: false }
    })
  }

  async setTutorialCompleted(value: boolean, expectedRevision?: number): Promise<RootTransactionResult<boolean>> {
    return this.transact(expectedRevision, (root) => {
      if (root.tutorialCompleted === value) return noWrite(value)
      root.tutorialCompleted = value
      return value
    })
  }

  private async runLocked<T>(callback: () => Promise<T>): Promise<T> {
    if (this.lockProvider) return this.lockProvider.request(STORAGE_KEY, callback)
    return withProcessLock(STORAGE_KEY, callback)
  }

  private parseRaw(raw: string): Record<string, unknown> {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      throw new RootTransactionError('ROOT_SCHEMA_INVALID', error)
    }
    if (!isRecord(parsed)) throw new RootTransactionError('ROOT_SCHEMA_INVALID')
    return parsed
  }

  private async readPersistedRoot(includeRaw: boolean): Promise<{ root: StorageRootV2; source: 'EMPTY' | 'V1' | 'V2' }> {
    const raw = this.repository.loadRaw()
    if (raw === null) return { root: createEmptyStorageRootV2(this.now()), source: 'EMPTY' }
    const parsed = this.parseRaw(raw)
    if (parsed.schemaVersion === 2) {
      try {
        assertStorageRootV2(parsed)
      } catch (error) {
        throw new RootTransactionError('ROOT_SCHEMA_INVALID', error)
      }
      return { root: structuredClone(parsed), source: 'V2' }
    }
    if (parsed.schemaVersion !== 1) throw new RootTransactionError('ROOT_SCHEMA_INVALID')
    try {
      const root = await buildStorageRootV2FromV1(raw, { now: this.now(), includeRaw })
      return { root, source: 'V1' }
    } catch (error) {
      throw new RootTransactionError('MIGRATION_FAILED', error)
    }
  }

  private async noWriteResult<T>(root: StorageRootV2, result: T): Promise<RootTransactionResult<T>> {
    return { root, result, digest: await rootDigest(root), wrote: false }
  }

  private async commitRoot<T>(candidate: StorageRootV2, result: T, previous: StorageRootV2 | undefined): Promise<RootTransactionResult<T>> {
    try {
      assertStorageRootV2(candidate)
      assertRootBudgetV2(candidate)
    } catch (error) {
      throw new RootTransactionError('ROOT_SCHEMA_INVALID', error)
    }
    const bytes = digestBytes(candidate)
    if (bytes.byteLength > LOG_BYTE_LIMIT * 4) throw new RootTransactionError('ROOT_SCHEMA_INVALID')
    const serialized = new TextDecoder().decode(bytes)
    const expectedDigest = await sha256Hex(bytes)
    try {
      this.repository.commitRootV2(candidate)
    } catch (error) {
      throw new RootTransactionError(isQuotaError(error) ? 'QUOTA_EXCEEDED' : 'PERSISTENCE_FAILED', error)
    }
    const persistedRaw = this.repository.loadRaw()
    if (persistedRaw !== serialized) throw new RootTransactionError('WRITE_VERIFICATION_FAILED')
    const persistedDigest = await migrationSourceSha256(persistedRaw)
    if (persistedDigest !== expectedDigest) throw new RootTransactionError('WRITE_VERIFICATION_FAILED')
    let persisted: StorageRootV2
    try {
      persisted = this.repository.loadRootV2()
    } catch (error) {
      throw new RootTransactionError('WRITE_VERIFICATION_FAILED', error)
    }
    if (persisted.revision !== candidate.revision) throw new RootTransactionError('WRITE_VERIFICATION_FAILED')
    if (previous && persisted.revision !== previous.revision + 1) throw new RootTransactionError('WRITE_VERIFICATION_FAILED')
    return { root: persisted, result, digest: expectedDigest, wrote: true }
  }
}
