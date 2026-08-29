import { canonicalizeV1, utf8ByteLength } from '@/log/canonicalize'
import type { CompletedGameLogV1 } from '@/log/schema'
import type { StorageRootV1 } from '@/storage/schema'
import type { StorageRootV2 } from '@/storage/schemaV2'

export const LOG_BYTE_LIMIT = 1_048_576
export const COMPLETED_LOGS_BYTE_LIMIT = 3_145_728
export const ROOT_BYTE_LIMIT = 4_194_304
export const COMPLETED_LOG_COUNT_LIMIT = 20

export function canonicalBytes(value: unknown): number {
  return utf8ByteLength(canonicalizeV1(value))
}

export function fitCompletedLogs(logs: readonly CompletedGameLogV1[]): CompletedGameLogV1[] {
  const kept = [...logs].sort((left, right) => left.completedAt.localeCompare(right.completedAt))
  for (const log of kept) {
    if (canonicalBytes(log) > LOG_BYTE_LIMIT) throw new Error('LOG_BUDGET_EXCEEDED')
  }
  while (kept.length > COMPLETED_LOG_COUNT_LIMIT || canonicalBytes(kept) > COMPLETED_LOGS_BYTE_LIMIT) kept.shift()
  return kept
}

export function assertRootBudget(root: StorageRootV1): void {
  if (root.activeGameLog && canonicalBytes(root.activeGameLog) > LOG_BYTE_LIMIT) throw new Error('ACTIVE_LOG_BUDGET_EXCEEDED')
  if (root.completedGameLogs.length > COMPLETED_LOG_COUNT_LIMIT) throw new Error('COMPLETED_LOG_COUNT_EXCEEDED')
  if (root.completedGameLogs.some((log) => canonicalBytes(log) > LOG_BYTE_LIMIT)) throw new Error('COMPLETED_LOG_BUDGET_EXCEEDED')
  if (canonicalBytes(root.completedGameLogs) > COMPLETED_LOGS_BYTE_LIMIT) throw new Error('COMPLETED_LOGS_BUDGET_EXCEEDED')
  if (canonicalBytes(root) > ROOT_BYTE_LIMIT) throw new Error('STORAGE_ROOT_BUDGET_EXCEEDED')
}

export function assertRootBudgetV2(root: StorageRootV2): void {
  if (root.activeGameLog && canonicalBytes(root.activeGameLog) > LOG_BYTE_LIMIT) throw new Error('ACTIVE_LOG_BUDGET_EXCEEDED')
  if (root.completedGameLogs.length > COMPLETED_LOG_COUNT_LIMIT) throw new Error('COMPLETED_LOG_COUNT_EXCEEDED')
  if (root.completedGameLogs.some((log) => canonicalBytes(log) > LOG_BYTE_LIMIT)) throw new Error('COMPLETED_LOG_BUDGET_EXCEEDED')
  if (canonicalBytes(root.completedGameLogs) > COMPLETED_LOGS_BYTE_LIMIT) throw new Error('COMPLETED_LOGS_BYTE_LIMIT_EXCEEDED')
  if (root.packTransactions.some((transaction) => canonicalBytes(transaction) > LOG_BYTE_LIMIT)) throw new Error('PACK_TRANSACTION_BUDGET_EXCEEDED')
  if (canonicalBytes(root) > ROOT_BYTE_LIMIT) throw new Error('STORAGE_ROOT_BUDGET_EXCEEDED')
}
