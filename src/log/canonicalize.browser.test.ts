import { describe, expect, it } from 'vitest'
import { canonicalizeV1 } from '@/log/canonicalize'
import { hashCanonicalValue } from '@/log/hash'

describe('browser canonical parity', () => {
  it('matches the locked Node vector', async () => {
    const vector = { z: '中文', a: [3, 2, 1], nested: { b: true, a: null } }
    expect(canonicalizeV1(vector)).toBe('{"a":[3,2,1],"nested":{"a":null,"b":true},"z":"中文"}')
    expect(await hashCanonicalValue(vector)).toBe('e0476cdceff3add0d1965316fed9be20fd3f069ccc2de6ba1b130e0692301e06')
  })
})
