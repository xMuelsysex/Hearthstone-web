import canonicalize from 'canonicalize'

export type CanonicalJsonValue = null | boolean | string | number | CanonicalJsonValue[] | { [key: string]: CanonicalJsonValue }

export function assertCanonicalJsonValue(value: unknown, path = '$'): asserts value is CanonicalJsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error(`NON_CANONICAL_NUMBER:${path}`)
    return
  }
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) throw new Error(`SPARSE_ARRAY:${path}`)
    value.forEach((item, index) => assertCanonicalJsonValue(item, `${path}[${index}]`))
    return
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) throw new Error(`UNDEFINED_VALUE:${path}.${key}`)
      assertCanonicalJsonValue(item, `${path}.${key}`)
    }
    return
  }
  throw new Error(`UNSUPPORTED_CANONICAL_VALUE:${path}`)
}

export function canonicalizeV1(value: unknown): string {
  assertCanonicalJsonValue(value)
  const result = canonicalize(value)
  if (result === undefined) throw new Error('CANONICALIZATION_FAILED')
  return result
}

export function canonicalUtf8V1(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalizeV1(value))
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}
