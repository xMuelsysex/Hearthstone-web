import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8')
const failures = []

const replayKernel = read('src/log/replay.ts')
const replayPlayer = read('src/replay/replay.ts')
if (!replayKernel.includes("from '@/engine/applyRecordedEvent'")) {
  failures.push('src/log/replay.ts must own the applyRecordedEvent replay kernel')
}
if (!replayPlayer.includes("replayLogFrames") || !replayPlayer.includes('projectReplayView')) {
  failures.push('src/replay/replay.ts must build frames from the shared replay kernel and privacy projection')
}

function replaySources(directory) {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return replaySources(`${directory}/${entry.name}`)
    if (!/\.(ts|tsx)$/.test(entry.name) || entry.name.includes('.test.')) return []
    return [`${directory}/${entry.name}`]
  })
}
for (const relativePath of replaySources('src/replay')) {
  const source = read(relativePath)
  if (source.includes('applyRecordedEvent')) failures.push(`${relativePath} bypasses src/log/replay.ts`) 
}

const matrix = read('src/compat/compatibilityMatrix.v1.ts')
const guards = read('src/compat/capabilityGuards.ts')
const rawInput = read('src/compat/rawInput.ts')
if (!matrix.includes('COMPATIBILITY_MATRIX_V1') || !matrix.includes('findCompatibilityRow')) {
  failures.push('M4 compatibility must use the static tuple-to-capability matrix')
}
if (!guards.includes('rowForEnvelope') || !guards.includes('assertCapabilityEnvelope')) {
  failures.push('M4 capability guards must validate the matrix row before capabilities')
}
if (!rawInput.includes('assertCompatibilityEnvelope')) {
  failures.push('M4 raw input must pass through the compatibility guard')
}

if (failures.length > 0) {
  console.error('replay/compatibility enforcement failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}
console.log('replay/compatibility enforcement: PASS')
