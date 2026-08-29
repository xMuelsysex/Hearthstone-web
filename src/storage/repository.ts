import { canonicalizeV1 } from '@/log/canonicalize'
import type { ActiveGameLogV1, AnyGameLogV1, CompletedGameLogV1 } from '@/log/schema'
import { assertRootBudget, assertRootBudgetV2, fitCompletedLogs } from '@/storage/byteBudget'
import { assertStorageRootV2, createEmptyStorageRootV2, type StorageRootV2 } from '@/storage/schemaV2'
import { createEmptyStorageRoot, STORAGE_KEY, type StorageRootV1 } from '@/storage/schema'

export interface StorageAdapter {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export class MemoryStorageAdapter implements StorageAdapter {
  private readonly values = new Map<string, string>()
  failWrites = false
  writes = 0

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.writes += 1
    if (this.failWrites) throw new DOMException('Quota exceeded', 'QuotaExceededError')
    this.values.set(key, value)
  }
}

export class GameRepository {
  constructor(private readonly storage: StorageAdapter) {}

  loadRaw(): string | null {
    return this.storage.getItem(STORAGE_KEY)
  }

  loadRoot(): StorageRootV1 {
    const raw = this.loadRaw()
    if (raw === null) return createEmptyStorageRoot()
    const parsed = JSON.parse(raw) as StorageRootV1
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.completedGameLogs)) throw new Error('INVALID_STORAGE_ROOT')
    return parsed
  }

  loadRootV2(): StorageRootV2 {
    const raw = this.loadRaw()
    if (raw === null) return createEmptyStorageRootV2()
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error('INVALID_STORAGE_ROOT')
    }
    assertStorageRootV2(parsed)
    return structuredClone(parsed)
  }

  commitRoot(root: StorageRootV1): void {
    assertRootBudget(root)
    this.storage.setItem(STORAGE_KEY, canonicalizeV1(root))
  }

  commitRootV2(root: StorageRootV2): void {
    assertRootBudgetV2(root)
    this.storage.setItem(STORAGE_KEY, canonicalizeV1(root))
  }

  saveLog(root: StorageRootV1, log: AnyGameLogV1): StorageRootV1 {
    const next = structuredClone(root)
    if (log.status === 'in_progress') {
      next.activeGameLog = log
    } else {
      if (next.activeGameLog?.gameId === log.gameId) next.activeGameLog = null
      next.completedGameLogs = fitCompletedLogs([...next.completedGameLogs.filter((item) => item.gameId !== log.gameId), log])
    }
    this.commitRoot(next)
    return next
  }

  importCompleted(root: StorageRootV1, log: CompletedGameLogV1): StorageRootV1 {
    return this.saveLog(root, log)
  }

  installActive(_root: StorageRootV1, log: ActiveGameLogV1): StorageRootV1 {
    const persisted = this.loadRoot()
    if (persisted.activeGameLog && persisted.activeGameLog.gameId !== log.gameId) throw new Error('ACTIVE_GAME_CONFLICT')
    return this.saveLog(persisted, log)
  }

  setTutorialCompleted(root: StorageRootV1, tutorialCompleted: boolean): StorageRootV1 {
    const next = { ...structuredClone(root), tutorialCompleted }
    this.commitRoot(next)
    return next
  }
}
