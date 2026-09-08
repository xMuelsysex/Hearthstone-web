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
  return {
    definition,
    cost: entity.cost,
    valueLabel: weapon ? '耐久' : '生命',
    currentValue: weapon ? entity.durability : entity.health,
    maximumValue: weapon ? definition.durability : entity.maxHealth,
    baseValue: weapon ? definition.durability : definition.health,
    hasStats: definition.type === 'MINION' || weapon,
  }
}
