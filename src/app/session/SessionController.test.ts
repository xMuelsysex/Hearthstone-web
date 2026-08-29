import { commandFromAction } from '@/engine/commands'
import { createGameState } from '@/engine/setup'
import { SessionController } from '@/app/session/SessionController'
import { GameRepository, MemoryStorageAdapter } from '@/storage/repository'

function fixtureController(storage = new MemoryStorageAdapter(), gameId = 'game-fixed') {
  let tick = 0
  return {
    storage,
    controller: new SessionController(new GameRepository(storage), { now: () => `2026-08-24T00:00:0${tick++}.000Z` }, { gameId: () => gameId }),
  }
}

describe('SessionController', () => {
  it('serializes accepted commands and restores the last persisted batch', async () => {
    const { storage, controller } = fixtureController()
    await controller.start(createGameState({ seed: 77 }))
    const playerMulligan = controller.snapshot()?.legalActions.find((item) => item.type === 'CONFIRM_MULLIGAN')
    if (!playerMulligan) throw new Error('missing mulligan')
    await controller.dispatchAction(playerMulligan)

    const restored = new SessionController(new GameRepository(storage))
    expect(await restored.restore()).toBe(true)
    expect(restored.snapshot()?.view.phase).toBe('MULLIGAN')
    expect(storage.writes).toBe(2)
  })

  it('keeps the previous authoritative state when persistence fails', async () => {
    const { storage, controller } = fixtureController()
    await controller.start(createGameState({ seed: 78 }))
    const before = controller.snapshot()
    const action = before?.legalActions.find((item) => item.type === 'CONFIRM_MULLIGAN')
    if (!action) throw new Error('missing mulligan')
    storage.failWrites = true
    await expect(controller.dispatchAction(action)).rejects.toThrow('PERSISTENCE_FAILED')
    expect(controller.snapshot()?.error).toBe('PERSISTENCE_FAILED')
    expect(controller.snapshot()?.view).toEqual(before?.view)
    expect(controller.getActiveLog()?.batches).toHaveLength(0)
    expect(controller.exportCurrentLog()).toContain('"status":"in_progress"')
  })

  it('finalizes terminal commands in one root write', async () => {
    const { storage, controller } = fixtureController()
    await controller.start(createGameState({ seed: 79 }))
    const concede = controller.snapshot()?.legalActions.find((item) => item.type === 'CONCEDE')
    if (!concede) throw new Error('missing concede')
    await controller.dispatchCommand(commandFromAction(concede, 'concede'))
    expect(controller.getRoot().activeGameLog).toBeNull()
    expect(controller.getRoot().completedGameLogs).toHaveLength(1)
    expect(storage.writes).toBe(2)
  })

  it('rejects a new game while an active log exists', async () => {
    const { controller } = fixtureController()
    await controller.start(createGameState({ seed: 80 }))
    await expect(controller.start(createGameState({ seed: 81 }))).rejects.toThrow('ACTIVE_GAME_CONFLICT')
    expect(controller.getActiveLog()?.gameId).toBe('game-fixed')
  })

  it('keeps the active session focused after importing a completed log', async () => {
    const completedFixture = fixtureController(new MemoryStorageAdapter(), 'completed-game')
    await completedFixture.controller.start(createGameState({ seed: 82 }))
    const completedConcede = completedFixture.controller.snapshot()?.legalActions.find((item) => item.type === 'CONCEDE')
    if (!completedConcede) throw new Error('missing completed concede')
    await completedFixture.controller.dispatchCommand(commandFromAction(completedConcede, 'complete'))
    const completedText = completedFixture.controller.exportCurrentLog()
    if (!completedText) throw new Error('missing completed log')

    const activeFixture = fixtureController(new MemoryStorageAdapter(), 'active-game')
    await activeFixture.controller.start(createGameState({ seed: 83 }))
    await activeFixture.controller.importLog({ size: new TextEncoder().encode(completedText).byteLength, text: async () => completedText })

    expect(activeFixture.controller.getActiveLog()?.gameId).toBe('active-game')
    expect(activeFixture.controller.getRoot().completedGameLogs.map((log) => log.gameId)).toContain('completed-game')
    expect(activeFixture.controller.snapshot()?.view.phase).toBe('MULLIGAN')
  })
})
