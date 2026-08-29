import type { ActiveGameLogV1, CompletedGameLogV1 } from '@/log/schema'
import { canonicalUtf8V1 } from '@/log/canonicalize'
import type { CollectionV2, PackStateV2, RewardLedgerV2, WalletV2 } from '@/economy/types'
import { createEmptyCollectionV2, createInitialPackStateV2, createInitialWalletV2 } from '@/economy/types'
import type { PackTransactionFixture } from '@/economy/packContract'

export const STORAGE_SCHEMA_VERSION_V2 = 2 as const
export const STORAGE_ROOT_V2_VERSION = 'm2-root-v1' as const
export const STORAGE_ROOT_V2_MAX_PACK_TRANSACTIONS = 256
export const STORAGE_ROOT_V2_MAX_FINALIZED_GAMES = 256

export type RawMigrationBytesV2 = {
  encoding: 'utf-8'
  bytes: number[]
  sha256: string
}

export type MigrationMetadataV2 = {
  sourceSchemaVersion: 1
  migratedAt: string
  sourceRaw: RawMigrationBytesV2 | null
  rewardPolicy: 'V1_IMPORT_ZERO' | 'V1_MIGRATION_ZERO'
}

export type FinalizeMetadataV2 = {
  gameId: string
  result: CompletedGameLogV1['result']
  eligible: boolean
  source: 'M2_LOCAL_FINALIZE' | 'V1_IMPORT' | 'V1_MIGRATION' | 'PRE_M2'
  finalizedAt: string
}

export type StorageRootV2 = {
  schemaVersion: typeof STORAGE_SCHEMA_VERSION_V2
  rootVersion: typeof STORAGE_ROOT_V2_VERSION
  revision: number
  activeGameLog: ActiveGameLogV1 | null
  completedGameLogs: CompletedGameLogV1[]
  tutorialCompleted: boolean
  wallet: WalletV2
  collection: CollectionV2
  packState: PackStateV2
  packTransactions: PackTransactionFixture[]
  rewardLedger: RewardLedgerV2
  finalizedGames: Record<string, FinalizeMetadataV2>
  migration: MigrationMetadataV2
}

export function createEmptyStorageRootV2(now = new Date(0).toISOString()): StorageRootV2 {
  return {
    schemaVersion: STORAGE_SCHEMA_VERSION_V2,
    rootVersion: STORAGE_ROOT_V2_VERSION,
    revision: 0,
    activeGameLog: null,
    completedGameLogs: [],
    tutorialCompleted: false,
    wallet: createInitialWalletV2(),
    collection: createEmptyCollectionV2(),
    packState: createInitialPackStateV2(),
    packTransactions: [],
    rewardLedger: {},
    finalizedGames: {},
    migration: {
      sourceSchemaVersion: 1,
      migratedAt: now,
      sourceRaw: null,
      rewardPolicy: 'V1_MIGRATION_ZERO',
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype
}

function assertInteger(value: unknown, code: string, minimum = 0): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) throw new Error(code)
}

function assertLogShape(value: unknown, code: string): void {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.gameId !== 'string' || value.gameId.length === 0 || !Array.isArray(value.batches)) {
    throw new Error(code)
  }
}

function assertCollection(value: unknown): asserts value is CollectionV2 {
  if (!isRecord(value) || !isRecord(value.ownedCount) || !isRecord(value.everOwnedCount)) throw new Error('V2_COLLECTION_INVALID')
  for (const counts of [value.ownedCount, value.everOwnedCount]) {
    for (const amount of Object.values(counts)) assertInteger(amount, 'V2_COLLECTION_COUNT_INVALID')
  }
}

function assertPackState(value: unknown): asserts value is PackStateV2 {
  if (!isRecord(value)) throw new Error('V2_PACK_STATE_INVALID')
  assertInteger(value.openedPacks, 'V2_PACK_STATE_INVALID')
  assertInteger(value.packsSinceLegendary, 'V2_PACK_STATE_INVALID')
  assertInteger(value.packsSinceEpic, 'V2_PACK_STATE_INVALID')
  if (typeof value.firstSetLegendarySeen !== 'boolean') throw new Error('V2_PACK_STATE_INVALID')
}

function assertWallet(value: unknown): asserts value is WalletV2 {
  if (!isRecord(value)) throw new Error('V2_WALLET_INVALID')
  assertInteger(value.gold, 'V2_WALLET_INVALID')
}

function assertMigration(value: unknown): asserts value is MigrationMetadataV2 {
  if (!isRecord(value) || value.sourceSchemaVersion !== 1 || typeof value.migratedAt !== 'string' || (value.rewardPolicy !== 'V1_IMPORT_ZERO' && value.rewardPolicy !== 'V1_MIGRATION_ZERO')) {
    throw new Error('V2_MIGRATION_INVALID')
  }
  if (value.sourceRaw !== null) {
    if (!isRecord(value.sourceRaw) || value.sourceRaw.encoding !== 'utf-8' || typeof value.sourceRaw.sha256 !== 'string' || !Array.isArray(value.sourceRaw.bytes)) {
      throw new Error('V2_MIGRATION_RAW_INVALID')
    }
    for (const byte of value.sourceRaw.bytes) {
      if (!Number.isInteger(byte) || byte < 0 || byte > 255) throw new Error('V2_MIGRATION_RAW_INVALID')
    }
  }
}

export function assertStorageRootV2(value: unknown): asserts value is StorageRootV2 {
  if (!isRecord(value) || value.schemaVersion !== STORAGE_SCHEMA_VERSION_V2 || value.rootVersion !== STORAGE_ROOT_V2_VERSION) throw new Error('V2_ROOT_SCHEMA_INVALID')
  assertInteger(value.revision, 'V2_ROOT_REVISION_INVALID')
  if (value.activeGameLog !== null) assertLogShape(value.activeGameLog, 'V2_ACTIVE_LOG_INVALID')
  if (!Array.isArray(value.completedGameLogs)) throw new Error('V2_COMPLETED_LOGS_INVALID')
  for (const log of value.completedGameLogs) assertLogShape(log, 'V2_COMPLETED_LOG_INVALID')
  if (typeof value.tutorialCompleted !== 'boolean') throw new Error('V2_TUTORIAL_INVALID')
  assertWallet(value.wallet)
  assertCollection(value.collection)
  assertPackState(value.packState)
  if (!Array.isArray(value.packTransactions) || value.packTransactions.length > STORAGE_ROOT_V2_MAX_PACK_TRANSACTIONS) throw new Error('V2_PACK_TRANSACTIONS_INVALID')
  if (!isRecord(value.rewardLedger)) throw new Error('V2_REWARD_LEDGER_INVALID')
  if (!isRecord(value.finalizedGames) || Object.keys(value.finalizedGames).length > STORAGE_ROOT_V2_MAX_FINALIZED_GAMES) throw new Error('V2_FINALIZED_GAMES_INVALID')
  for (const metadata of Object.values(value.finalizedGames)) {
    if (!isRecord(metadata) || typeof metadata.gameId !== 'string' || typeof metadata.result !== 'string' || typeof metadata.eligible !== 'boolean' || typeof metadata.source !== 'string' || typeof metadata.finalizedAt !== 'string') {
      throw new Error('V2_FINALIZED_GAME_INVALID')
    }
  }
  assertMigration(value.migration)
}

export function cloneStorageRootV2(root: StorageRootV2): StorageRootV2 {
  return structuredClone(root)
}

export function canonicalStorageRootV2Bytes(root: StorageRootV2): Uint8Array {
  assertStorageRootV2(root)
  return canonicalUtf8V1(root)
}
