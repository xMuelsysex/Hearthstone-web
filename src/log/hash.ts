import { CARD_DATA_VERSION } from '@/cards/data/cards.v1'
import { RULES_VERSION, type AuthoritativeSessionStateV1 } from '@/engine/state'
import { canonicalUtf8V1 } from '@/log/canonicalize'
import { SCENARIO_VERSION } from '@/scenarios/state'

export type Sha256Hex = string & { readonly __sha256Hex: unique symbol }

export async function sha256Hex(bytes: Uint8Array): Promise<Sha256Hex> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('') as Sha256Hex
}

export async function hashCanonicalValue(value: unknown): Promise<Sha256Hex> {
  return sha256Hex(canonicalUtf8V1(value))
}

export async function hashStateV1(state: AuthoritativeSessionStateV1): Promise<Sha256Hex> {
  return hashCanonicalValue({
    rulesVersion: RULES_VERSION,
    cardDataVersion: CARD_DATA_VERSION,
    scenarioVersion: SCENARIO_VERSION,
    state,
  })
}
