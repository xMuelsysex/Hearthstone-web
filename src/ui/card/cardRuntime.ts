import { getCardDefinition } from '@/cards/registry'
import type { PublicEntityViewModel } from '@/engine/projection'

export function artAssetPath(entity: PublicEntityViewModel): string {
  if (entity.assetPath.startsWith('/assets/cards/')) return `/assets/card-art/${entity.definitionId}.png`
  if (entity.assetPath.startsWith('/assets/heroes/')) return `/assets/hero-art/${entity.definitionId}.png`
  if (entity.assetPath.startsWith('/assets/hero-powers/')) return `/assets/hero-power-art/${entity.definitionId}.png`
  return entity.assetPath
}

export function cardRuntimeValues(entity: PublicEntityViewModel) {
  const definition = getCardDefinition(entity.definitionId)
  const weapon = definition.type === 'WEAPON'
  const location = definition.type === 'LOCATION'
  const usesDurability = weapon || location
  return {
    definition,
    cost: entity.cost,
    valueLabel: usesDurability ? '耐久' : '生命',
    currentValue: usesDurability ? entity.durability : entity.health,
    maximumValue: usesDurability ? definition.durability : entity.maxHealth,
    baseValue: usesDurability ? definition.durability : definition.health,
    hasStats: definition.type === 'MINION' || usesDurability,
  }
}
