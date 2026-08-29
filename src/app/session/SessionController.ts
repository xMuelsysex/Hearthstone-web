import { commandFromAction, type GameCommand, type LegalActionDescriptor } from '@/engine/commands'
import { projectLegalActions, projectPlayerView, type PlayerViewModel } from '@/engine/projection'
import { resolveCommand } from '@/engine/resolveCommand'
import type { AuthoritativeSessionStateV1, PlayerId } from '@/engine/state'
import { appendBatch, createActiveGameLog } from '@/log/logBuilder'
import type { ActiveGameLogV1, AnyGameLogV1, CommandBatchV1 } from '@/log/schema'
import { replayLog } from '@/log/replay'
import { exportLog, validateAndImportLog, type ImportFileLike } from '@/log/validateImport'
import { GameRepository, MemoryStorageAdapter } from '@/storage/repository'
import { createEmptyStorageRoot, type StorageRootV1 } from '@/storage/schema'
import { assertStorageRootV2, type StorageRootV2 } from '@/storage/schemaV2'
import { RootTransactionCoordinator, RootTransactionError } from '@/storage/rootTransactionCoordinator'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function projectV1Root(root: StorageRootV2): StorageRootV1 {
  return {
    schemaVersion: 1,
    activeGameLog: structuredClone(root.activeGameLog),
    completedGameLogs: structuredClone(root.completedGameLogs),
    tutorialCompleted: root.tutorialCompleted,
  }
}

function readInitialRoots(repository: GameRepository): { root: StorageRootV1; rootV2: StorageRootV2 | null } {
  const raw = repository.loadRaw()
  if (raw === null) return { root: createEmptyStorageRoot(), rootV2: null }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('INVALID_STORAGE_ROOT')
  }
  if (!isRecord(parsed)) throw new Error('INVALID_STORAGE_ROOT')
  if (parsed.schemaVersion === 1) return { root: repository.loadRoot(), rootV2: null }
  if (parsed.schemaVersion === 2) {
    try {
      assertStorageRootV2(parsed)
    } catch {
      throw new Error('INVALID_STORAGE_ROOT')
    }
    const rootV2 = structuredClone(parsed)
    return { root: projectV1Root(rootV2), rootV2 }
  }
  throw new Error('INVALID_STORAGE_ROOT')
}

export type Clock = { now(): string }
export type IdSource = { gameId(): string }
export type ActorSnapshot = {
  view: PlayerViewModel
  legalActions: LegalActionDescriptor[]
}

export type SessionSnapshot = ActorSnapshot & {
  lastBatch: CommandBatchV1 | null
  busy: boolean
  error: string | null
}

export type LogImportSummary = {
  gameId: string
  status: AnyGameLogV1['status']
  idempotent: boolean
}

export class SessionControllerError extends Error {
  constructor(readonly code: 'PERSISTENCE_FAILED', cause: unknown) {
    super(code, { cause })
    this.name = 'SessionControllerError'
  }
}

function normalizePersistenceError(error: unknown): unknown {
  if (!(error instanceof RootTransactionError)) return error
  if (error.code === 'PERSISTENCE_FAILED' || error.code === 'QUOTA_EXCEEDED' || error.code === 'WRITE_VERIFICATION_FAILED') {
    return new SessionControllerError('PERSISTENCE_FAILED', error)
  }
  return error
}

export class SessionController {
  private root: StorageRootV1
  private rootV2: StorageRootV2 | null
  private readonly coordinator: RootTransactionCoordinator
  private state: AuthoritativeSessionStateV1 | null = null
  private log: AnyGameLogV1 | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private listeners = new Set<() => void>()
  private lastBatch: CommandBatchV1 | null = null
  private busy = false
  private error: string | null = null

  constructor(
    repository: GameRepository,
    private readonly clock: Clock = { now: () => new Date().toISOString() },
    private readonly ids: IdSource = { gameId: () => crypto.randomUUID() },
    private readonly viewerId: PlayerId = 'PLAYER',
  ) {
    const initial = readInitialRoots(repository)
    this.root = initial.root
    this.rootV2 = initial.rootV2
    this.coordinator = new RootTransactionCoordinator(repository, { now: () => this.clock.now() })
  }

  async restore(): Promise<boolean> {
    const persisted = await this.coordinator.load()
    this.setPersistedRoot(persisted)
    const active = persisted.activeGameLog
    if (!active) {
      this.state = null
      this.log = null
      this.lastBatch = null
      this.publish()
      return false
    }
    this.state = await replayLog(active)
    this.log = structuredClone(active)
    this.lastBatch = active.batches.at(-1) ?? null
    this.publish()
    return true
  }

  async start(initialState: AuthoritativeSessionStateV1): Promise<void> {
    const persisted = await this.coordinator.load()
    this.setPersistedRoot(persisted)
    if (persisted.activeGameLog) throw new Error('ACTIVE_GAME_CONFLICT')
    const createdAt = this.clock.now()
    const log = await createActiveGameLog(this.ids.gameId(), createdAt, initialState)
    try {
      const installed = await this.coordinator.installActive(log, persisted.revision)
      this.setPersistedRoot(installed.root)
    } catch (error) {
      throw normalizePersistenceError(error)
    }
    this.state = structuredClone(log.initialState)
    this.log = log
    this.lastBatch = null
    this.error = null
    this.publish()
  }

  dispatchAction(action: LegalActionDescriptor, mulliganEntityIds: number[] = []): Promise<CommandBatchV1> {
    if (!this.log) return Promise.reject(new Error('NO_ACTIVE_SESSION'))
    const commandId = `${this.log.gameId}:${this.log.batches.length + 1}`
    return this.dispatchCommand(commandFromAction(action, commandId, mulliganEntityIds))
  }

  dispatchCommand(command: GameCommand): Promise<CommandBatchV1> {
    const job = this.queue.then(() => this.commitCommand(command))
    this.queue = job.catch(() => undefined)
    return job
  }

  private async commitCommand(command: GameCommand): Promise<CommandBatchV1> {
    if (!this.state || !this.log || this.log.status !== 'in_progress') throw new Error('NO_ACTIVE_SESSION')
    this.busy = true
    this.error = null
    this.publish()
    try {
      const provisional = resolveCommand(this.state, command)
      const nextLog = await appendBatch(this.log, provisional, this.clock.now())
      let committedRoot: StorageRootV2
      try {
        if (nextLog.status === 'completed') {
          const finalized = await this.coordinator.finalize(
            { log: nextLog, now: nextLog.completedAt },
            this.rootV2?.revision,
          )
          committedRoot = finalized.root
        } else {
          const installed = await this.coordinator.installActive(nextLog, this.rootV2?.revision)
          committedRoot = installed.root
        }
      } catch (cause) {
        throw normalizePersistenceError(cause)
      }
      const batch = nextLog.batches.at(-1)
      if (!batch) throw new Error('MISSING_COMMITTED_BATCH')
      this.setPersistedRoot(committedRoot)
      this.log = nextLog
      this.state = provisional.finalState
      this.lastBatch = batch
      return batch
    } catch (error) {
      this.error = error instanceof SessionControllerError ? error.code : error instanceof Error ? error.message : 'PERSISTENCE_FAILED'
      throw error
    } finally {
      this.busy = false
      this.publish()
    }
  }

  snapshot(): SessionSnapshot | null {
    const actor = this.snapshotForActor(this.viewerId)
    if (!actor) return null
    return {
      ...actor,
      lastBatch: this.lastBatch,
      busy: this.busy,
      error: this.error,
    }
  }

  snapshotForActor(actorId: PlayerId): ActorSnapshot | null {
    if (!this.state) return null
    return {
      view: projectPlayerView(this.state, actorId),
      legalActions: projectLegalActions(this.state, actorId),
    }
  }

  async importLog(file: ImportFileLike): Promise<LogImportSummary> {
    const persisted = await this.coordinator.load()
    this.setPersistedRoot(persisted)
    const validationRepository = new GameRepository(new MemoryStorageAdapter())
    const result = await validateAndImportLog(file, this.root, validationRepository)
    let committedRoot = persisted
    if (!result.idempotent) {
      if (result.log.status === 'completed') {
        committedRoot = (await this.coordinator.importCompleted(result.log, persisted.revision)).root
      } else {
        committedRoot = (await this.coordinator.installActive(result.log, persisted.revision)).root
      }
    }
    this.setPersistedRoot(committedRoot)
    const focusedLog = result.log.status === 'completed' && committedRoot.activeGameLog
      ? committedRoot.activeGameLog
      : result.log
    this.log = structuredClone(focusedLog)
    this.state = await replayLog(focusedLog)
    this.lastBatch = focusedLog.batches.at(-1) ?? null
    this.error = null
    this.publish()
    return { gameId: result.log.gameId, status: result.log.status, idempotent: result.idempotent }
  }

  exportCurrentLog(): string | null {
    const latest = this.log ?? this.root.activeGameLog ?? this.root.completedGameLogs.at(-1) ?? null
    return latest ? exportLog(latest) : null
  }

  async markTutorialCompleted(): Promise<void> {
    const result = await this.coordinator.setTutorialCompleted(true, this.rootV2?.revision)
    this.setPersistedRoot(result.root)
    this.error = null
    this.publish()
  }

  getActiveLog(): ActiveGameLogV1 | null {
    return this.root.activeGameLog ? structuredClone(this.root.activeGameLog) : null
  }

  getRoot(): StorageRootV1 {
    return structuredClone(this.root)
  }

  getDebugSnapshot(): {
    state: AuthoritativeSessionStateV1 | null
    log: AnyGameLogV1 | null
    lastBatch: CommandBatchV1 | null
  } {
    return structuredClone({ state: this.state, log: this.log, lastBatch: this.lastBatch })
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private setPersistedRoot(root: StorageRootV2): void {
    this.rootV2 = structuredClone(root)
    this.root = projectV1Root(this.rootV2)
  }

  private publish(): void {
    for (const listener of this.listeners) listener()
  }
}
