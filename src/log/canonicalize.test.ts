import { canonicalizeV1, canonicalUtf8V1 } from '@/log/canonicalize'
import { hashCanonicalValue, sha256Hex } from '@/log/hash'

const VECTOR = { z: '中文', a: [3, 2, 1], nested: { b: true, a: null } }

describe('canonical log primitives', () => {
  it('uses stable RFC 8785 bytes and SHA-256', async () => {
    expect(canonicalizeV1(VECTOR)).toBe('{"a":[3,2,1],"nested":{"a":null,"b":true},"z":"中文"}')
    expect([...canonicalUtf8V1(VECTOR)]).toEqual([...new TextEncoder().encode('{"a":[3,2,1],"nested":{"a":null,"b":true},"z":"中文"}')])
    expect(await hashCanonicalValue(VECTOR)).toBe('e0476cdceff3add0d1965316fed9be20fd3f069ccc2de6ba1b130e0692301e06')
    expect(await sha256Hex(new Uint8Array())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('rejects non-authoritative JSON values', () => {
    expect(() => canonicalizeV1({ value: undefined })).toThrow('UNDEFINED_VALUE')
    expect(() => canonicalizeV1(new Map())).toThrow('UNSUPPORTED_CANONICAL_VALUE')
    expect(() => canonicalizeV1({ value: 1.5 })).toThrow('NON_CANONICAL_NUMBER')
  })
})
