import { CARD_DATA_VERSION } from '@/cards/data/cards.v1'
import { RULES_VERSION, type AuthoritativeSessionStateV1 } from '@/engine/state'
import { canonicalUtf8V1 } from '@/log/canonicalize'
import { SCENARIO_VERSION } from '@/scenarios/state'

export const LEGACY_CARD_DATA_VERSIONS = ['249896-zhCN-v1'] as const
export const SUPPORTED_CARD_DATA_VERSIONS = [CARD_DATA_VERSION, ...LEGACY_CARD_DATA_VERSIONS] as const
export type SupportedCardDataVersion = typeof SUPPORTED_CARD_DATA_VERSIONS[number]

export function isSupportedCardDataVersion(value: string): value is SupportedCardDataVersion {
  return (SUPPORTED_CARD_DATA_VERSIONS as readonly string[]).includes(value)
}

export function normalizeStateForCardDataVersion(state: AuthoritativeSessionStateV1, cardDataVersion: SupportedCardDataVersion): AuthoritativeSessionStateV1 {
  if (cardDataVersion !== LEGACY_CARD_DATA_VERSIONS[0]) return state
  const normalized = structuredClone(state)
  for (const entity of Object.values(normalized.game.entities)) {
    delete entity.cost
    delete entity.summonedThisTurn
    delete entity.attacksRemaining
    delete entity.frozen
    delete entity.immune
  }
  for (const player of Object.values(normalized.game.players)) {
    delete player.cardsPlayedThisTurn
    delete player.overloadLocked
  }
  return normalized
}

export type Sha256Hex = string & { readonly __sha256Hex: unique symbol }

export async function sha256Hex(bytes: Uint8Array): Promise<Sha256Hex> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('') as Sha256Hex
}

export async function hashCanonicalValue(value: unknown): Promise<Sha256Hex> {
  return sha256Hex(canonicalUtf8V1(value))
}

export async function hashStateV1(state: AuthoritativeSessionStateV1, cardDataVersion: SupportedCardDataVersion = CARD_DATA_VERSION): Promise<Sha256Hex> {
  return hashCanonicalValue({
    rulesVersion: RULES_VERSION,
    cardDataVersion,
    scenarioVersion: SCENARIO_VERSION,
    state: normalizeStateForCardDataVersion(state, cardDataVersion),
  })
}
