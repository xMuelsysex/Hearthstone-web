import type { LegalActionDescriptor } from '@/engine/commands'
import type { PlayerViewModel } from '@/engine/projection'

function cardId(view: PlayerViewModel, entityId: number): string | null {
  return [...view.self.hand, ...view.self.board, ...view.opponent.board].find((entity) => entity.id === entityId)?.definitionId ?? null
}

export function chooseShowcasePlayerDescriptor(view: PlayerViewModel, actions: readonly LegalActionDescriptor[]): LegalActionDescriptor {
  const mulligan = actions.find((action) => action.type === 'CONFIRM_MULLIGAN')
  if (mulligan) return mulligan
  const discover = actions.find((action) => action.type === 'SELECT_DISCOVER')
  if (discover) return discover
  if (view.activePlayerId !== 'PLAYER') throw new Error('PLAYER_ACTION_REQUESTED_OUT_OF_TURN')

  if (view.scenario.coverage.POISONOUS === null) {
    const poisonousId = view.self.board.find((entity) => entity.definitionId === 'DRG_066')?.id
    const durableTargetId = view.opponent.board.find((entity) => entity.health >= 2)?.id
    if (poisonousId !== undefined && durableTargetId !== undefined) {
      const attack = actions.find((action) => action.type === 'ATTACK' && action.attackSourceId === poisonousId && action.attackTargetId === durableTargetId)
      if (attack) return attack
    }
    const play = actions.find((action) => action.type === 'PLAY_CARD' && cardId(view, action.cardInstanceId) === 'DRG_066' && action.playMode === 'NORMAL')
    if (play) return play
  }

  if (view.scenario.coverage.DISCOVER === null) {
    const play = actions.find((action) => action.type === 'PLAY_CARD' && cardId(view, action.cardInstanceId) === 'BAR_541' && action.targetEntityId === view.opponent.hero.id)
    if (play) return play
  }

  const availableMana = view.self.mana.current + view.self.mana.temporary
  if (view.scenario.coverage.MANATHIRST === null && availableMana >= 8) {
    const play = actions.find((action) => action.type === 'PLAY_CARD' && cardId(view, action.cardInstanceId) === 'RLK_843' && action.targetEntityId === view.opponent.hero.id)
    if (play) return play
  }

  if (view.scenario.coverage.MAGNETIC === null) {
    const play = actions.find((action) => action.type === 'PLAY_CARD' && cardId(view, action.cardInstanceId) === 'BOT_563' && action.playMode === 'MAGNETIC')
    if (play) return play
  }

  const endTurn = actions.find((action) => action.type === 'END_TURN')
  if (!endTurn) throw new Error('SHOWCASE_PLAYER_HAS_NO_END_TURN')
  return endTurn
}
