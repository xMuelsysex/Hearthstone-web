import * as compat from '@/compat'
import {
  createCompatibilityEnvelope,
  CURRENT_COMPATIBILITY_TUPLE_V1,
  M3_COMPATIBILITY_ROW_V1,
} from '@/compat/compatibilityMatrix.v1'
import { assertCapabilityEnvelope, validateCompatibilityEnvelope } from '@/compat/capabilityGuards'
import { assertSupportedVersionTuple, guardVersionTuple } from '@/compat/versionGuards'

function unsupportedTuple() {
  return { ...CURRENT_COMPATIBILITY_TUPLE_V1, rulesVersion: 'future-rules-v9' }
}

describe('compatibility matrix', () => {
  it('accepts a supported tuple and exposes stable compatibility aliases', () => {
    const envelope = createCompatibilityEnvelope('REPLAY_ARTIFACT_V1', { frameCount: 2 })
    expect(validateCompatibilityEnvelope(envelope)).toBe(M3_COMPATIBILITY_ROW_V1)
    expect(assertCapabilityEnvelope(envelope)).toBe(M3_COMPATIBILITY_ROW_V1)
    expect(compat.COMPATIBILITY_MATRIX).toBe(compat.COMPATIBILITY_MATRIX_V1)
    expect(compat.CURRENT_COMPATIBILITY_TUPLE).toBe(compat.CURRENT_COMPATIBILITY_TUPLE_V1)
    expect(compat.M3_COMPATIBILITY).toBe(M3_COMPATIBILITY_ROW_V1)
  })

  it('fails closed for unsupported version tuples on every carrier path', () => {
    const tuple = unsupportedTuple()
    expect(guardVersionTuple(tuple, 'GAME_LOG_V1')).toEqual({ ok: false, code: 'UNSUPPORTED_VERSION' })
    expect(() => assertSupportedVersionTuple(tuple, 'GAME_LOG_V1')).toThrow('UNSUPPORTED_VERSION')

    const envelope = createCompatibilityEnvelope('REPLAY_ARTIFACT_V1', null, { tuple })
    expect(() => validateCompatibilityEnvelope(envelope)).toThrow('UNSUPPORTED_VERSION')
  })

  it('fails closed for registry and capability mismatches', () => {
    const envelope = createCompatibilityEnvelope('REPLAY_ARTIFACT_V1', null)
    expect(() => validateCompatibilityEnvelope({ ...envelope, registryDigest: '0'.repeat(64) })).toThrow('CAPABILITY_REGISTRY_MISMATCH')
    expect(() => validateCompatibilityEnvelope({ ...envelope, cardDefinitionIds: [...envelope.cardDefinitionIds, 'FUTURE_CARD'] })).toThrow('UNSUPPORTED_CAPABILITY')
    expect(() => validateCompatibilityEnvelope({ ...envelope, effectIds: [...envelope.effectIds, 'FUTURE_EFFECT'] })).toThrow('UNSUPPORTED_CAPABILITY')
    expect(() => validateCompatibilityEnvelope({ ...envelope, capabilities: [...envelope.capabilities, 'FUTURE_CAPABILITY'] })).toThrow('UNSUPPORTED_CAPABILITY')
  })
})
