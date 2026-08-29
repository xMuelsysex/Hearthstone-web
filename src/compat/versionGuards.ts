import {
  COMPATIBILITY_MATRIX_V1,
  findCompatibilityRow,
  type CompatibilityCarrierV1,
  type CompatibilityEnvelopeV1,
  type CompatibilityMatrixRowV1,
  type CompatibilityTupleV1,
} from '@/compat/compatibilityMatrix.v1'
import type { RawArtifactV1 } from '@/replay/rawArtifact'

export type CompatibilityGuardCode = 'UNSUPPORTED_VERSION' | 'CAPABILITY_REGISTRY_MISMATCH' | 'UNSUPPORTED_CAPABILITY'

export class CompatibilityGuardError extends Error {
  constructor(
    readonly code: CompatibilityGuardCode,
    readonly details?: Record<string, unknown>,
    readonly artifact?: RawArtifactV1,
  ) {
    super(code)
    this.name = 'CompatibilityGuardError'
  }
}

export function assertSupportedVersionTuple(tuple: CompatibilityTupleV1, carrier: CompatibilityCarrierV1): CompatibilityMatrixRowV1 {
  const row = findCompatibilityRow(tuple, carrier)
  if (!row) throw new CompatibilityGuardError('UNSUPPORTED_VERSION', { tuple, carrier })
  return row
}

export function guardVersionTuple(tuple: CompatibilityTupleV1, carrier: CompatibilityCarrierV1):
  | { ok: true; row: CompatibilityMatrixRowV1 }
  | { ok: false; code: 'UNSUPPORTED_VERSION' } {
  const row = findCompatibilityRow(tuple, carrier)
  return row ? { ok: true, row } : { ok: false, code: 'UNSUPPORTED_VERSION' }
}

export function rowForEnvelope(envelope: Pick<CompatibilityEnvelopeV1, 'tuple' | 'carrier'>): CompatibilityMatrixRowV1 {
  return assertSupportedVersionTuple(envelope.tuple, envelope.carrier)
}

export function supportedCompatibilityTuples(): readonly CompatibilityTupleV1[] {
  return COMPATIBILITY_MATRIX_V1.map((row) => row.tuple)
}
