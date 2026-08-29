import { RNG_ALGORITHM_VERSION, type RngStateV1 } from '@/engine/state'

export function createRng(seed: number): RngStateV1 {
  const normalized = seed >>> 0
  return { algorithm: RNG_ALGORITHM_VERSION, seed: normalized, state: normalized, cursor: 0 }
}

export function nextRandom(rng: RngStateV1): { value: number; rng: RngStateV1 } {
  const nextState = (rng.state + 0x6D2B79F5) >>> 0
  let value = nextState
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  const result = ((value ^ (value >>> 14)) >>> 0) / 4294967296
  return { value: result, rng: { ...rng, state: nextState, cursor: rng.cursor + 1 } }
}

export function shuffleWithRng<T>(items: readonly T[], initialRng: RngStateV1): { items: T[]; rng: RngStateV1 } {
  const shuffled = [...items]
  let rng = initialRng
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const random = nextRandom(rng)
    rng = random.rng
    const target = Math.floor(random.value * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[target] as T
    shuffled[target] = current as T
  }
  return { items: shuffled, rng }
}
