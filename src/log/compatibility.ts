import { LEGACY_CARD_DATA_VERSIONS, type SupportedCardDataVersion } from '@/log/hash'
import type { ResolveDependencies } from '@/engine/resolveCommand'

export const LEGACY_249896_DISCOVER_POOL = ['AT_001', 'AT_002', 'AT_004', 'AT_005', 'BAR_541', 'CS2_023', 'CS2_029', 'RLK_843'] as const

export function resolveDependenciesForCardDataVersion(cardDataVersion: SupportedCardDataVersion): ResolveDependencies {
  if (cardDataVersion !== LEGACY_CARD_DATA_VERSIONS[0]) return {}
  return { discoverPool: LEGACY_249896_DISCOVER_POOL, legacyCardDataVersion: true }
}
