import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const uiRoot = resolve(root, 'src/ui')
const forbidden = [
  "from '@/engine/state'",
  "from '@/log/",
  "from '@/storage/",
  'AuthoritativeSessionStateV1',
  'AnyGameLogV1',
  'ActiveGameLogV1',
  'CompletedGameLogV1',
]

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return filesUnder(path)
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : []
  })
}

const failures = []
for (const path of filesUnder(uiRoot)) {
  const source = readFileSync(path, 'utf8')
  for (const token of forbidden) {
    if (source.includes(token)) failures.push(`${path.slice(root.length + 1)} contains ${token}`)
  }
}

const directStoragePath = resolve(root, 'src/storage/browserStorage.ts')
for (const path of filesUnder(resolve(root, 'src'))) {
  if (path === directStoragePath || path.includes('.test.') || path.includes('/src/test/')) continue
  const source = readFileSync(path, 'utf8')
  if (/(?:\b(?:window|globalThis)\.(?:localStorage|sessionStorage|indexedDB)\b|\b(?:localStorage|sessionStorage|indexedDB)\s*[.[])/.test(source)) {
    failures.push(`${path.slice(root.length + 1)} accesses browser storage directly`)
  }
}

if (failures.length > 0) {
  console.error('projection/runtime boundary enforcement failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}
console.log('projection/runtime boundary enforcement: PASS')
