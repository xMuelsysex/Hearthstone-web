import {
  readRawArtifact,
  type RawArtifactFileLike,
  type RawArtifactV1,
} from '@/replay/rawArtifact'
import { assertCompatibilityEnvelope } from '@/compat/capabilityGuards'
import { CompatibilityGuardError } from '@/compat/versionGuards'
import type { CompatibilityMatrixRowV1 } from '@/compat/compatibilityMatrix.v1'

export class CompatibilityInputError extends Error {
  constructor(readonly code: 'IMPORT_INVALID_JSON', readonly artifact: RawArtifactV1) {
    super(code)
    this.name = 'CompatibilityInputError'
  }
}

export type ParsedCompatibilityInputV1 = {
  artifact: RawArtifactV1
  value: unknown
  row: CompatibilityMatrixRowV1
}

export async function readCompatibilityRawInput(file: RawArtifactFileLike): Promise<RawArtifactV1> {
  return readRawArtifact(file)
}

export async function parseCompatibilityRawInput(file: RawArtifactFileLike): Promise<ParsedCompatibilityInputV1> {
  const artifact = await readRawArtifact(file)
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(artifact.bytes))
  } catch {
    throw new CompatibilityInputError('IMPORT_INVALID_JSON', artifact)
  }
  try {
    const row = assertCompatibilityEnvelope(value)
    return { artifact, value, row }
  } catch (error) {
    if (error instanceof CompatibilityGuardError) throw new CompatibilityGuardError(error.code, error.details, artifact)
    throw error
  }
}
