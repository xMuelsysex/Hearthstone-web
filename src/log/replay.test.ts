import legacyActiveLogFixture from './fixtures/legacy-249896-active-log.json' with { type: 'json' }
import { SHOWCASE_DECKS_V1 } from '@/cards/decks'
import { commandFromAction } from '@/engine/commands'
import { getLegalActions } from '@/engine/legalActions'
import { resolveCommand } from '@/engine/resolveCommand'
import { createGameState } from '@/engine/setup'
import { appendBatch, createActiveGameLog, withContentDigest } from '@/log/logBuilder'
import { resolveDependenciesForCardDataVersion } from '@/log/compatibility'
import { hashStateV1, normalizeStateForCardDataVersion } from '@/log/hash'
import { replayLog } from '@/log/replay'
import type { ActiveGameLogV1 } from '@/log/schema'

describe('authoritative log', () => {
  it('replays deck summons and legacy card-data hashes', async () => {
    const deck = SHOWCASE_DECKS_V1.find((candidate) => candidate.ownerClass === 'PALADIN')
    if (!deck) throw new Error('missing paladin deck')
    let state = createGameState({
      seed: 101,
      playerProfile: { heroId: deck.heroId, heroPowerId: deck.heroPowerId, deck: deck.cards },
      playerDeckTop: ['JAIL_516'],
    })
    for (const actorId of ['PLAYER', 'OPPONENT'] as const) {
      const action = getLegalActions(state, actorId).find((item) => item.type === 'CONFIRM_MULLIGAN')
      if (!action) throw new Error('missing mulligan')
      state = resolveCommand(state, commandFromAction(action, `mulligan-${actorId}`)).finalState
    }
    state.game.players.PLAYER.mana = { maximum: 10, current: 10, temporary: 0 }
    const log = await createActiveGameLog('game-deck-summon', '2026-09-03T00:00:00.000Z', state)
    const cardInstanceId = state.game.players.PLAYER.hand.find((id) => state.game.entities[String(id)]?.definitionId === 'JAIL_516')
    if (cardInstanceId === undefined) throw new Error('missing deck summon card')
    const action = getLegalActions(state, 'PLAYER').find((item) => item.type === 'PLAY_CARD' && item.cardInstanceId === cardInstanceId && item.targetEntityId === undefined)
    if (!action) throw new Error('missing deck summon action')
    const provisional = resolveCommand(state, commandFromAction(action, 'deck-summon'))
    const nextLog = await appendBatch(log, provisional, '2026-09-03T00:00:01.000Z')
    if (nextLog.status !== 'in_progress') throw new Error('unexpected completed log')
    expect(await replayLog(nextLog)).toEqual(provisional.finalState)

    const legacyVersion = '249896-zhCN-v1' as const
    const legacyEvents = await Promise.all(nextLog.batches[0]!.events.map(async (recorded, index) => ({
      ...recorded,
      postStateHash: await hashStateV1(provisional.events[index]!.postState, legacyVersion),
    })))
    const legacyLog = await withContentDigest({
      ...nextLog,
      cardDataVersion: legacyVersion,
      initialStateHash: await hashStateV1(nextLog.initialState, legacyVersion),
      batches: [{ ...nextLog.batches[0]!, events: legacyEvents, postBatchStateHash: legacyEvents.at(-1)!.postStateHash }],
      currentStateHash: legacyEvents.at(-1)!.postStateHash,
      contentDigest: '' as typeof nextLog.contentDigest,
    })
    expect(await replayLog(legacyLog)).toEqual(normalizeStateForCardDataVersion(provisional.finalState, legacyVersion))
  })

  it('replays and continues the historical 249896 active-log fixture', async () => {
    const legacyLog = legacyActiveLogFixture as unknown as ActiveGameLogV1
    const restored = await replayLog(legacyLog)
    expect(restored.game.phase).toBe('PLAY')
    expect(restored.game.turn).toBe(3)
    expect(restored.game.activePlayerId).toBe('PLAYER')
    expect(restored.game.pendingDecision).toBeNull()
    expect(Object.values(restored.game.entities).every((entity) => entity.summonedThisTurn === undefined && entity.attacksRemaining === undefined)).toBe(true)

    const endTurn = getLegalActions(restored, 'PLAYER').find((item) => item.type === 'END_TURN')
    if (!endTurn) throw new Error('missing legacy continuation')
    const continuation = resolveCommand(restored, commandFromAction(endTurn, 'legacy-continuation'), resolveDependenciesForCardDataVersion('249896-zhCN-v1'))
    const continuedLog = await appendBatch(legacyLog, continuation, '2026-08-30T12:00:03.000Z')
    if (continuedLog.status !== 'in_progress') throw new Error('unexpected completed continuation')
    expect(continuedLog.cardDataVersion).toBe('249896-zhCN-v1')
    expect(await replayLog(continuedLog)).toEqual(normalizeStateForCardDataVersion(continuation.finalState, '249896-zhCN-v1'))
  })

  it('hashes every event and rebuilds the committed state', async () => {
    let state = createGameState({ seed: 99 })
    let log = await createActiveGameLog('game-fixed', '2026-08-24T00:00:00.000Z', state)
    for (const actorId of ['PLAYER', 'OPPONENT'] as const) {
      const action = getLegalActions(state, actorId).find((item) => item.type === 'CONFIRM_MULLIGAN')
      if (!action) throw new Error('missing mulligan')
      const provisional = resolveCommand(state, commandFromAction(action, `command-${actorId}`))
      const nextLog = await appendBatch(log, provisional, '2026-08-24T00:00:01.000Z')
      if (nextLog.status !== 'in_progress') throw new Error('unexpected completed log')
      log = nextLog
      state = provisional.finalState
    }
    expect(log.batches.every((batch) => batch.postBatchStateHash === batch.events.at(-1)?.postStateHash)).toBe(true)
    expect(await replayLog(log)).toEqual(state)
  })
})
