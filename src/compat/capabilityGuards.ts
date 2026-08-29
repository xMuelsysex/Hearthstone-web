import {
  type CompatibilityEnvelopeV1,
  type CompatibilityMatrixRowV1,
} from '@/compat/compatibilityMatrix.v1'
import { CompatibilityGuardError, rowForEnvelope } from '@/compat/versionGuards'

function includesAll(allowed: readonly string[], values: readonly string[]): string | null {
  const set = new Set(allowed)
  return values.find((value) => !set.has(value)) ?? null
}

export function assertCapabilityEnvelope(envelope: CompatibilityEnvelopeV1): CompatibilityMatrixRowV1 {
  const row = rowForEnvelope(envelope)
  if (envelope.registryDigest !== row.registryDigest) {
    throw new CompatibilityGuardError('CAPABILITY_REGISTRY_MISMATCH', {
      expected: row.registryDigest,
      actual: envelope.registryDigest,
    })
  }
  const unknownCard = includesAll(row.capabilityRegistry.cardDefinitionIds, envelope.cardDefinitionIds)
  if (unknownCard) throw new CompatibilityGuardError('UNSUPPORTED_CAPABILITY', { kind: 'card', value: unknownCard })
  const unknownEffect = includesAll(row.capabilityRegistry.effectIds, envelope.effectIds)
  if (unknownEffect) throw new CompatibilityGuardError('UNSUPPORTED_CAPABILITY', { kind: 'effect', value: unknownEffect })
  const unknownCapability = includesAll(row.capabilityRegistry.capabilityIds, envelope.capabilities)
  if (unknownCapability) throw new CompatibilityGuardError('UNSUPPORTED_CAPABILITY', { kind: 'capability', value: unknownCapability })
  return row
}

export function validateCompatibilityEnvelope(value: unknown): CompatibilityMatrixRowV1 {
  if (typeof value !== 'object' || value === null) throw new CompatibilityGuardError('UNSUPPORTED_VERSION')
  const candidate = value as Partial<CompatibilityEnvelopeV1>
  if (candidate.format !== 'compatibility-envelope-v1' || !Array.isArray(candidate.cardDefinitionIds) || !Array.isArray(candidate.effectIds) || !Array.isArray(candidate.capabilities) || typeof candidate.registryDigest !== 'string' || !candidate.tuple || typeof candidate.tuple !== 'object' || typeof candidate.carrier !== 'string') {
    throw new CompatibilityGuardError('UNSUPPORTED_VERSION')
  }
  return assertCapabilityEnvelope(candidate as CompatibilityEnvelopeV1)
}

export function assertCompatibilityEnvelope(value: unknown): CompatibilityMatrixRowV1 {
  return validateCompatibilityEnvelope(value)
}
