import { getEntity, type AuthoritativeSessionStateV1, type EntityId, type GameStateV1 } from '@/engine/state'

export function combatAttackValue(game: GameStateV1, entityId: EntityId): number {
  const entity = getEntity(game, entityId)
  if (entity.type !== 'HERO') return entity.attack
  const weaponEntityId = game.players[entity.controllerId].weaponEntityId
  return entity.attack + (weaponEntityId === null ? 0 : getEntity(game, weaponEntityId).attack)
}

export function projectedCombatDeaths(state: AuthoritativeSessionStateV1, sourceEntityId: EntityId, targetEntityId: EntityId): EntityId[] {
  const source = getEntity(state.game, sourceEntityId)
  const target = getEntity(state.game, targetEntityId)
  const sourceAttack = combatAttackValue(state.game, source.id)
  const targetAttack = combatAttackValue(state.game, target.id)
  const deaths: EntityId[] = []

  if (wouldKill(target, sourceAttack, source.keywords.includes('POISONOUS'))) deaths.push(target.id)
  if (targetAttack > 0 && wouldKill(source, targetAttack, target.keywords.includes('POISONOUS'))) deaths.push(source.id)
  return deaths
}

function wouldKill(entity: ReturnType<typeof getEntity>, amount: number, poisonous: boolean): boolean {
  return entity.type === 'MINION' && amount > 0 && (entity.health <= amount || poisonous)
}
