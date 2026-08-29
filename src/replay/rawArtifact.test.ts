import { CompatibilityGuardError } from '@/compat/versionGuards'
import { createCompatibilityEnvelope } from '@/compat/compatibilityMatrix.v1'
import { parseCompatibilityRawInput } from '@/compat/rawInput'
import { parseRawArtifact, type RawArtifactFileLike, type RawArtifactV1, RawArtifactError } from '@/replay/rawArtifact'

function fileFor(bytes: Uint8Array): RawArtifactFileLike {
  return {
    size: bytes.byteLength,
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  }
}

function attachedArtifact(error: unknown): RawArtifactV1 | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const candidate = error as { artifact?: RawArtifactV1 }
  return candidate.artifact
}

describe('raw replay artifacts', () => {
  it('retains exact bytes when UTF-8 JSON parsing fails', async () => {
    const bytes = Uint8Array.from([0x7b, 0xc3, 0x28, 0x7d])
    let caught: unknown
    try {
      await parseRawArtifact(fileFor(bytes))
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(RawArtifactError)
    expect(caught).toMatchObject({ code: 'RAW_INPUT_UNREADABLE' })
    expect(attachedArtifact(caught)?.toBytes()).toEqual(bytes)
  })

  it('retains exact bytes across compatibility JSON and capability failures', async () => {
    const invalidJson = Uint8Array.from(new TextEncoder().encode('{"format":'))
    let jsonError: unknown
    try {
      await parseCompatibilityRawInput(fileFor(invalidJson))
    } catch (error) {
      jsonError = error
    }
    expect(jsonError).toMatchObject({ code: 'IMPORT_INVALID_JSON' })
    expect(attachedArtifact(jsonError)?.toBytes()).toEqual(invalidJson)

    const envelope = createCompatibilityEnvelope('REPLAY_ARTIFACT_V1', { fixture: true })
    const unsupported = Uint8Array.from(new TextEncoder().encode(JSON.stringify({
      ...envelope,
      capabilities: [...envelope.capabilities, 'FUTURE_CAPABILITY'],
    })))
    let capabilityError: unknown
    try {
      await parseCompatibilityRawInput(fileFor(unsupported))
    } catch (error) {
      capabilityError = error
    }
    expect(capabilityError).toBeInstanceOf(CompatibilityGuardError)
    expect(capabilityError).toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' })
    expect(attachedArtifact(capabilityError)?.toBytes()).toEqual(unsupported)
  })
})
