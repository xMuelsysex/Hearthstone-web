import { commandFromAction } from '@/engine/commands'
import { getLegalActions } from '@/engine/legalActions'
import { resolveCommand } from '@/engine/resolveCommand'
import { createGameState } from '@/engine/setup'
import { appendBatch, createActiveGameLog } from '@/log/logBuilder'
import { exportLog, IMPORT_BYTE_LIMIT, validateAndImportLog } from '@/log/validateImport'
import { GameRepository, MemoryStorageAdapter } from '@/storage/repository'
import { createEmptyStorageRoot } from '@/storage/schema'

async function activeFixture() {
  const state = createGameState({ seed: 55 })
  let log = await createActiveGameLog('import-game', '2026-08-24T00:00:00.000Z', state)
  const action = getLegalActions(state, 'PLAYER').find((item) => item.type === 'CONFIRM_MULLIGAN')
  if (!action) throw new Error('missing mulligan')
  const provisional = resolveCommand(state, commandFromAction(action, 'import-command'))
  const appended = await appendBatch(log, provisional, '2026-08-24T00:00:01.000Z')
  if (appended.status !== 'in_progress') throw new Error('unexpected complete')
  log = appended
  return log
}

function fileOf(text: string, size = new TextEncoder().encode(text).byteLength) {
  let reads = 0
  return { file: { size, text: async () => { reads += 1; return text } }, reads: () => reads }
}

describe('log import', () => {
  it('rejects oversized files before reading', async () => {
    const source = fileOf('{}', IMPORT_BYTE_LIMIT + 1)
    await expect(validateAndImportLog(source.file, createEmptyStorageRoot(), new GameRepository(new MemoryStorageAdapter()))).rejects.toThrow('IMPORT_FILE_TOO_LARGE')
    expect(source.reads()).toBe(0)
  })

  it('reexecutes, hashes and installs an active log in one write', async () => {
    const log = await activeFixture()
    const text = exportLog(log)
    const storage = new MemoryStorageAdapter()
    const result = await validateAndImportLog(fileOf(text).file, createEmptyStorageRoot(), new GameRepository(storage))
    expect(result.root.activeGameLog?.gameId).toBe(log.gameId)
    expect(result.idempotent).toBe(false)
    expect(storage.writes).toBe(1)
  })

  it('treats the same digest as idempotent and rejects altered content', async () => {
    const log = await activeFixture()
    const root = { ...createEmptyStorageRoot(), activeGameLog: log }
    const repository = new GameRepository(new MemoryStorageAdapter())
    expect((await validateAndImportLog(fileOf(exportLog(log)).file, root, repository)).idempotent).toBe(true)
    const altered = { ...log, gameId: log.gameId, updatedAt: '2026-08-24T00:00:09.000Z' }
    await expect(validateAndImportLog(fileOf(JSON.stringify(altered)).file, root, repository)).rejects.toThrow('CONTENT_DIGEST_MISMATCH')
  })
})
