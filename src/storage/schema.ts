import type { ActiveGameLogV1, CompletedGameLogV1 } from '@/log/schema'

export const STORAGE_KEY = 'hearthstone-web:v1' as const
export const STORAGE_SCHEMA_VERSION = 1 as const

export type StorageRootV1 = {
  schemaVersion: typeof STORAGE_SCHEMA_VERSION
  activeGameLog: ActiveGameLogV1 | null
  completedGameLogs: CompletedGameLogV1[]
  tutorialCompleted: boolean
}

export function createEmptyStorageRoot(): StorageRootV1 {
  return { schemaVersion: STORAGE_SCHEMA_VERSION, activeGameLog: null, completedGameLogs: [], tutorialCompleted: false }
}
