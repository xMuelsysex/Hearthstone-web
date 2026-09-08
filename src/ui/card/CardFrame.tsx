import type { CSSProperties } from 'react'
import type { PublicEntityViewModel } from '@/engine/projection'
import { cardRuntimeValues } from '@/ui/card/cardRuntime'

type CardFrameProps = {
  entity: PublicEntityViewModel
  imagePath: string
  imageAlt?: string
  layer?: CardFrameLayer
}

type FrameKind = 'MINION' | 'SPELL' | 'WEAPON' | 'HERO'
export type CardFrameLayer = 'composite' | 'original' | 'cost-asset' | 'cost-number' | 'attack-asset' | 'attack-number' | 'value-asset' | 'value-number'
type Box = { x: number; y: number; width: number; height: number }
type DynamicLayer = { asset: string; box: Box; textBox: Box; coverAsset?: string }
type OriginalCardLayout = {
  cost: DynamicLayer
  attack?: DynamicLayer
  value?: DynamicLayer
}

const ORIGINAL_CARD_LAYOUTS: Record<FrameKind, OriginalCardLayout> = {
  MINION: {
    cost: {
      asset: '/assets/card-frames/materials/masks/minion-cost-mask.png',
      box: { x: 35, y: 82, width: 96, height: 105 },
      textBox: { x: 35, y: 82, width: 96, height: 105 },
    },
    attack: {
      asset: '/assets/card-frames/materials/common/attack.png',
      box: { x: 25, y: 565, width: 111, height: 123 },
      textBox: { x: 48, y: 584, width: 86, height: 108 },
    },
    value: {
      asset: '/assets/card-frames/materials/common/vitality.png',
      box: { x: 388, y: 570, width: 78, height: 118 },
      textBox: { x: 388, y: 584, width: 88, height: 108 },
    },
  },
  SPELL: {
    cost: {
      asset: '/assets/card-frames/materials/masks/spell-cost-mask.png',
      box: { x: 43, y: 82, width: 93, height: 105 },
      textBox: { x: 43, y: 82, width: 93, height: 105 },
    },
  },
  WEAPON: {
    cost: {
      asset: '/assets/card-frames/materials/cost/cost-crystal.png',
      box: { x: 39, y: 77, width: 102, height: 105 },
      textBox: { x: 39, y: 77, width: 102, height: 105 },
    },
    attack: {
      asset: '/assets/card-frames/materials/weapon/weapon-attack.png',
      coverAsset: '/assets/card-frames/materials/weapon/weapon-attack-cover.png',
      box: { x: 48, y: 587, width: 99, height: 97 },
      textBox: { x: 61, y: 584, width: 72, height: 103 },
    },
    value: {
      asset: '/assets/card-frames/materials/weapon/weapon-durability.png',
      coverAsset: '/assets/card-frames/materials/weapon/weapon-durability-cover.png',
      box: { x: 389, y: 584, width: 92, height: 103 },
      textBox: { x: 391, y: 584, width: 87, height: 103 },
    },
  },
  HERO: {
    cost: {
      asset: '/assets/card-frames/materials/masks/hero-cost-mask.png',
      box: { x: 53, y: 126, width: 94, height: 104 },
      textBox: { x: 53, y: 126, width: 94, height: 104 },
    },
    value: {
      asset: '/assets/card-frames/materials/common/armor.png',
      box: { x: 384, y: 591, width: 87, height: 108 },
      textBox: { x: 384, y: 591, width: 87, height: 108 },
    },
  },
}

function frameKind(type: string): FrameKind | null {
  return type === 'MINION' || type === 'SPELL' || type === 'WEAPON' || type === 'HERO' ? type : null
}

function percentage(value: number, base: number): string {
  return `${(value / base) * 100}%`
}

function boxStyle(box: Box): CSSProperties {
  return {
    top: percentage(box.y, 776),
    left: percentage(box.x, 512),
    width: percentage(box.width, 512),
    height: percentage(box.height, 776),
  }
}

function plainText(text: string): string {
  return text.replaceAll(/<br\s*\/?\s*>/gi, '\n').replaceAll(/<[^>]+>/g, '').replaceAll('$', '')
}

function statClass(value: number, base: number, max: number): string {
  if (value < max || max < base) return 'card-frame-stat--damaged'
  if (value > base || max > base) return 'card-frame-stat--buffed'
  return ''
}

export function CardFrame({ entity, imagePath, imageAlt, layer = 'composite' }: CardFrameProps) {
  const values = cardRuntimeValues(entity)
  const kind = frameKind(values.definition.type)
  if (!kind) return null
  const layout = ORIGINAL_CARD_LAYOUTS[kind]
  const descriptionText = plainText(values.definition.text)
  const isHero = kind === 'HERO'
  const showAttack = values.definition.type === 'MINION' || values.definition.type === 'WEAPON' || (isHero && entity.attack > 0)
  const showValue = values.definition.type === 'MINION' || values.definition.type === 'WEAPON' || isHero
  const currentValue = isHero ? entity.health : values.currentValue
  const maximumValue = isHero ? entity.maxHealth : values.maximumValue
  const baseValue = isHero ? values.definition.health : values.baseValue
  const valueLabel = isHero ? '生命' : values.valueLabel
  const attackState = statClass(entity.attack, values.definition.attack, entity.attack)
  const valueState = statClass(currentValue, baseValue, maximumValue)
  const showOriginal = layer === 'composite' || layer === 'original'
  const showCostAsset = layer === 'composite' || layer === 'cost-asset'
  const showCostNumber = layer === 'composite' || layer === 'cost-number'
  const showAttackAsset = layer === 'composite' || layer === 'attack-asset'
  const showAttackNumber = layer === 'composite' || layer === 'attack-number'
  const showValueAsset = layer === 'composite' || layer === 'value-asset'
  const showValueNumber = layer === 'composite' || layer === 'value-number'

  return (
    <span
      className={`card-frame card-frame--${kind.toLowerCase()}`}
      data-card-frame-source="official-card-image"
      data-card-frame-type={kind}
      data-card-frame-base={imagePath}
      data-card-frame-art={imagePath}
      data-card-frame-layer={layer}
      data-card-fixed-content-source="official-card-image"
      data-card-fixed-content-text={descriptionText}
      data-card-cost-current={values.cost}
      data-card-attack-current={showAttack ? entity.attack : undefined}
      data-card-value-current={currentValue}
      data-card-value-max={maximumValue}
      data-card-value-label={valueLabel}
    >
      {showOriginal ? <img className="card-frame-original" src={imagePath} alt={imageAlt ?? `${entity.name}官方卡图，卡名和效果来自原卡图`} draggable={false} /> : null}
      {showCostAsset ? <img className="card-frame-dynamic-asset card-frame-cost-asset" src={layout.cost.asset} alt="" draggable={false} style={boxStyle(layout.cost.box)} /> : null}
      {showCostNumber ? <span className="card-frame-number card-frame-cost" style={boxStyle(layout.cost.textBox)} aria-label={`费用 ${values.cost}`}>{values.cost}</span> : null}
      {showValue && layout.value ? <>
        {showAttack && layout.attack && showAttackAsset && layout.attack.coverAsset ? <img className="card-frame-dynamic-asset card-frame-stat-cover card-frame-stat-cover--attack" src={layout.attack.coverAsset} alt="" draggable={false} style={boxStyle(layout.attack.box)} /> : null}
        {showAttack && layout.attack && showAttackAsset ? <img className="card-frame-dynamic-asset card-frame-stat-asset card-frame-stat-asset--attack" src={layout.attack.asset} alt="" draggable={false} style={boxStyle(layout.attack.box)} /> : null}
        {showAttack && layout.attack && showAttackNumber ? <span className={`card-frame-number card-frame-stat card-frame-attack ${attackState}`} style={boxStyle(layout.attack.textBox)} aria-label={`攻击 ${entity.attack}`}>{entity.attack}</span> : null}
        {showValueAsset && layout.value.coverAsset ? <img className="card-frame-dynamic-asset card-frame-stat-cover card-frame-stat-cover--value" src={layout.value.coverAsset} alt="" draggable={false} style={boxStyle(layout.value.box)} /> : null}
        {showValueAsset ? <img className="card-frame-dynamic-asset card-frame-stat-asset card-frame-stat-asset--value" src={layout.value.asset} alt="" draggable={false} style={boxStyle(layout.value.box)} /> : null}
        {showValueNumber ? <span className={`card-frame-number card-frame-stat card-frame-value ${valueState}`} style={boxStyle(layout.value.textBox)} aria-label={`${valueLabel} ${currentValue}/${maximumValue}`}>{currentValue}</span> : null}
      </> : null}
    </span>
  )
}
