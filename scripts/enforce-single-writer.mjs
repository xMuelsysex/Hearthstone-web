import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const controllerPath = resolve(root, 'src/app/session/SessionController.ts')
const source = readFileSync(controllerPath, 'utf8')
const failures = []

if (!source.includes('new RootTransactionCoordinator(repository')) {
  failures.push('SessionController must construct RootTransactionCoordinator at its persistence boundary')
}
for (const method of ['installActive', 'finalize', 'importCompleted', 'setTutorialCompleted']) {
  if (!new RegExp(`this\\.coordinator\\.${method}\\s*\\(`).test(source)) {
    failures.push(`SessionController must route ${method} through RootTransactionCoordinator`)
  }
}
for (const method of ['saveLog', 'installActive', 'importCompleted', 'setTutorialCompleted']) {
  if (new RegExp(`this\\.repository\\.${method}\\s*\\(`).test(source)) {
    failures.push(`SessionController directly calls repository.${method}`)
  }
}

if (failures.length > 0) {
  console.error('single-writer enforcement failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}
console.log('single-writer enforcement: PASS')
