import { RULES_VERSION } from '@/engine/state'
import { canonicalizeV1 } from '@/log/canonicalize'
import { hashCanonicalValue, isSupportedCardDataVersion, sha256Hex } from '@/log/hash'
import type { AnyGameLogV1 } from '@/log/schema'
import { replayLog } from '@/log/replay'
import { assertStorageRootV2, createEmptyStorageRootV2, type RawMigrationBytesV2, type StorageRootV2 } from '@/storage/schemaV2'
import { SCENARIO_VERSION } from '@/scenarios/state'
import type { StorageRootV1 } from '@/storage/schema'

export const MIGRATION_RAW_BYTE_LIMIT = 1_048_576

type MigrationOptions = {
  now?: string
  includeRaw?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype
}

function asV1Root(value: unknown): StorageRootV1 {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.completedGameLogs)) throw new Error('MIGRATION_ROOT_SCHEMA_INVALID')
  if (value.activeGameLog !== null && !isRecord(value.activeGameLog)) throw new Error('MIGRATION_ACTIVE_LOG_INVALID')
  if (typeof value.tutorialCompleted !== 'boolean') throw new Error('MIGRATION_TUTORIAL_INVALID')
  return value as unknown as StorageRootV1
}

function assertLogMetadata(log: AnyGameLogV1): void {
  if (log.rulesVersion !== RULES_VERSION || !isSupportedCardDataVersion(log.cardDataVersion) || log.scenarioVersion !== SCENARIO_VERSION || log.rngAlgorithmVersion !== 'mulberry32-v1') {
    throw new Error('MIGRATION_UNSUPPORTED_VERSION')
  }
  if (typeof log.gameId !== 'string' || log.gameId.length === 0 || typeof log.createdAt !== 'string' || typeof log.updatedAt !== 'string') {
    throw new Error('MIGRATION_LOG_SCHEMA_INVALID')
  }
}

async function validateLog(log: AnyGameLogV1): Promise<void> {
  assertLogMetadata(log)
  await replayLog(log)
  const digestInput = { ...log } as AnyGameLogV1
  delete (digestInput as Partial<AnyGameLogV1>).contentDigest
  if (await hashCanonicalValue(digestInput) !== log.contentDigest) throw new Error('MIGRATION_CONTENT_DIGEST_MISMATCH')
}

async function rawMigrationBytes(raw: string): Promise<RawMigrationBytesV2> {
  const bytes = new TextEncoder().encode(raw)
  if (bytes.byteLength > MIGRATION_RAW_BYTE_LIMIT) throw new Error('MIGRATION_RAW_TOO_LARGE')
  return {
    encoding: 'utf-8',
    bytes: Array.from(bytes),
    sha256: await sha256Hex(bytes),
  }
}

export async function buildStorageRootV2FromV1(raw: string, options: MigrationOptions = {}): Promise<StorageRootV2> {
  const sourceBytes = await rawMigrationBytes(raw)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('MIGRATION_INVALID_JSON')
  }
  const source = asV1Root(parsed)
  if (source.activeGameLog) await validateLog(source.activeGameLog)
  for (const log of source.completedGameLogs) await validateLog(log)

  const root = createEmptyStorageRootV2(options.now ?? new Date().toISOString())
  root.activeGameLog = structuredClone(source.activeGameLog)
  root.completedGameLogs = structuredClone(source.completedGameLogs)
  root.tutorialCompleted = source.tutorialCompleted
  root.migration.sourceRaw = options.includeRaw === false ? null : sourceBytes
  for (const log of source.completedGameLogs) {
    root.finalizedGames[log.gameId] = {
      gameId: log.gameId,
      result: log.result,
      eligible: false,
      source: 'V1_MIGRATION',
      finalizedAt: log.completedAt,
    }
  }
  assertStorageRootV2(root)
  return root
}

export async function migrationSourceSha256(raw: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(raw))
}

export function canonicalMigrationBytes(root: StorageRootV2): Uint8Array {
  return new TextEncoder().encode(canonicalizeV1(root))
}
