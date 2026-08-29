import { CARD_DATA_VERSION, CARD_SOURCE } from '@/cards/data/cards.v1'
import { CARD_DEFINITIONS_V1 } from '@/cards/registry'
import type { EffectExecutorId, Keyword } from '@/cards/types'
import { RNG_ALGORITHM_VERSION, RULES_VERSION } from '@/engine/state'
import { SCENARIO_VERSION } from '@/scenarios/state'

export type CompatibilityCarrierV1 = 'GAME_LOG_V1' | 'STORAGE_ROOT_V2' | 'REPLAY_ARTIFACT_V1'

export type CompatibilityTupleV1 = {
  rulesVersion: string
  cardDataVersion: string
  scenarioVersion: string
  rngAlgorithmVersion: string
}

export type CompatibilityCapabilityRegistryV1 = {
  cardDefinitionIds: readonly string[]
  effectIds: readonly string[]
  capabilityIds: readonly string[]
}

export type CompatibilityMatrixRowV1 = {
  id: 'M1_GAME_LOG_V1' | 'M2_STORAGE_ROOT_V2' | 'M3_REPLAY_ARTIFACT_V1'
  carrier: CompatibilityCarrierV1
  tuple: CompatibilityTupleV1
  registryDigest: string
  storageRootVersion?: 'm2-root-v1'
  capabilityRegistry: CompatibilityCapabilityRegistryV1
}

export type CompatibilityEnvelopeV1 = {
  format: 'compatibility-envelope-v1'
  carrier: CompatibilityCarrierV1
  tuple: CompatibilityTupleV1
  registryDigest: string
  cardDefinitionIds: string[]
  effectIds: string[]
  capabilities: string[]
  payload?: unknown
}

const cardDefinitionIds = Object.freeze(Object.keys(CARD_DEFINITIONS_V1).sort())
const effectIds = Object.freeze([...new Set(Object.values(CARD_DEFINITIONS_V1).map((card) => card.effect))].sort()) as readonly EffectExecutorId[]
const capabilityIds = Object.freeze([
  ...new Set<string>([
    ...Object.values(CARD_DEFINITIONS_V1).flatMap((card) => card.keywords as Keyword[]),
    ...effectIds,
  ]),
].sort())

export const LOCAL_CARD_REGISTRY_DIGEST_V1 = CARD_SOURCE.sourceSha256

export const CURRENT_COMPATIBILITY_TUPLE_V1: CompatibilityTupleV1 = Object.freeze({
  rulesVersion: RULES_VERSION,
  cardDataVersion: CARD_DATA_VERSION,
  scenarioVersion: SCENARIO_VERSION,
  rngAlgorithmVersion: RNG_ALGORITHM_VERSION,
})

export const FROZEN_CAPABILITY_REGISTRY_V1: CompatibilityCapabilityRegistryV1 = Object.freeze({
  cardDefinitionIds,
  effectIds,
  capabilityIds,
})

function row(
  id: CompatibilityMatrixRowV1['id'],
  carrier: CompatibilityCarrierV1,
  storageRootVersion?: 'm2-root-v1',
): CompatibilityMatrixRowV1 {
  const value: CompatibilityMatrixRowV1 = {
    id,
    carrier,
    tuple: CURRENT_COMPATIBILITY_TUPLE_V1,
    registryDigest: LOCAL_CARD_REGISTRY_DIGEST_V1,
    capabilityRegistry: FROZEN_CAPABILITY_REGISTRY_V1,
  }
  if (storageRootVersion !== undefined) value.storageRootVersion = storageRootVersion
  return Object.freeze(value)
}

export const COMPATIBILITY_MATRIX_V1: readonly CompatibilityMatrixRowV1[] = Object.freeze([
  row('M1_GAME_LOG_V1', 'GAME_LOG_V1'),
  row('M2_STORAGE_ROOT_V2', 'STORAGE_ROOT_V2', 'm2-root-v1'),
  row('M3_REPLAY_ARTIFACT_V1', 'REPLAY_ARTIFACT_V1'),
])

export const M1_COMPATIBILITY_ROW_V1 = COMPATIBILITY_MATRIX_V1[0] as CompatibilityMatrixRowV1
export const M2_COMPATIBILITY_ROW_V1 = COMPATIBILITY_MATRIX_V1[1] as CompatibilityMatrixRowV1
export const M3_COMPATIBILITY_ROW_V1 = COMPATIBILITY_MATRIX_V1[2] as CompatibilityMatrixRowV1

export function sameCompatibilityTuple(left: CompatibilityTupleV1, right: CompatibilityTupleV1): boolean {
  return left.rulesVersion === right.rulesVersion
    && left.cardDataVersion === right.cardDataVersion
    && left.scenarioVersion === right.scenarioVersion
    && left.rngAlgorithmVersion === right.rngAlgorithmVersion
}

export function findCompatibilityRow(tuple: CompatibilityTupleV1, carrier: CompatibilityCarrierV1): CompatibilityMatrixRowV1 | null {
  return COMPATIBILITY_MATRIX_V1.find((candidate) => candidate.carrier === carrier && sameCompatibilityTuple(candidate.tuple, tuple)) ?? null
}

export function createCompatibilityEnvelope(
  carrier: CompatibilityCarrierV1,
  payload: unknown,
  overrides: Partial<Pick<CompatibilityEnvelopeV1, 'tuple' | 'registryDigest' | 'cardDefinitionIds' | 'effectIds' | 'capabilities'>> = {},
): CompatibilityEnvelopeV1 {
  const rowValue = findCompatibilityRow(CURRENT_COMPATIBILITY_TUPLE_V1, carrier)
  if (!rowValue) throw new Error('UNSUPPORTED_VERSION')
  return {
    format: 'compatibility-envelope-v1',
    carrier,
    tuple: overrides.tuple ?? rowValue.tuple,
    registryDigest: overrides.registryDigest ?? rowValue.registryDigest,
    cardDefinitionIds: overrides.cardDefinitionIds ?? [...rowValue.capabilityRegistry.cardDefinitionIds],
    effectIds: overrides.effectIds ?? [...rowValue.capabilityRegistry.effectIds],
    capabilities: overrides.capabilities ?? [...rowValue.capabilityRegistry.capabilityIds],
    payload,
  }
}
