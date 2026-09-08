import { useState } from 'react'
import { getCardDefinition } from '@/cards/registry'
import type { CardDefinitionId, CardDefinitionV1 } from '@/cards/types'
import { createCardPreviewRuntime, type CardPreviewRuntimeModel } from '@/scenarios/cardPreviewRuntime'
import type { PublicEntityViewModel } from '@/engine/projection'
import type { CardFrameLayer } from '@/ui/card/CardFrame'
import { CardFace } from '@/ui/card/CardFace'

const PREVIEW_CARD_ID: CardDefinitionId = 'CS2_196'
const PREVIEW_CARD = getCardDefinition(PREVIEW_CARD_ID)
const PREVIEW_WEAPON_CARD_ID: CardDefinitionId = 'CS2_082'
const PREVIEW_WEAPON_CARD = getCardDefinition(PREVIEW_WEAPON_CARD_ID)
const SAMPLE_CARD_IDS: CardDefinitionId[] = ['CS2_196', 'RLK_843', 'CS2_082', 'HERO_08']
const SAMPLE_CARDS = SAMPLE_CARD_IDS.map((id) => getCardDefinition(id))
const CARD_LAYERS: Array<{ key: CardFrameLayer; label: string; description: string }> = [
  { key: 'original', label: '官方底图', description: '卡框、原画、卡名、效果与烘焙数值' },
  { key: 'cost-asset', label: '费用遮罩', description: '费用数字区域的形状遮罩' },
  { key: 'cost-number', label: '费用数字', description: '引擎当前费用数字' },
  { key: 'attack-asset', label: '攻击遮罩', description: '攻击数字区域的形状遮罩' },
  { key: 'attack-number', label: '攻击数字', description: '引擎当前攻击数字' },
  { key: 'value-asset', label: '生命遮罩', description: '生命数字区域的形状遮罩' },
  { key: 'value-number', label: '生命数字', description: '引擎当前生命数字' },
  { key: 'composite', label: '最终合成', description: '所有图层叠加结果' },
]
const WEAPON_CARD_LAYERS = CARD_LAYERS.map((layer) => {
  if (layer.key === 'value-asset') return { ...layer, label: '耐久遮罩', description: '耐久数字区域的完整形状遮罩' }
  if (layer.key === 'value-number') return { ...layer, label: '耐久数字', description: '引擎当前耐久数字' }
  return layer
})

const CARD_TYPE_LABELS: Record<string, string> = {
  MINION: '随从',
  SPELL: '法术',
  WEAPON: '武器',
  HERO: '英雄',
  HERO_POWER: '英雄技能',
}

const RARITY_LABELS: Record<string, string> = {
  COMMON: '普通',
  FREE: '基础',
}

const RACE_LABELS: Record<string, string> = {
  MECHANICAL: '机械',
}

function cardAssetPath(card: CardDefinitionV1): string {
  const directory = card.type === 'HERO' ? 'heroes' : card.type === 'HERO_POWER' ? 'hero-powers' : 'cards'
  return `/assets/${directory}/${card.id}.png`
}

function sampleEntity(card: CardDefinitionV1, index: number): PublicEntityViewModel {
  const isWeapon = card.type === 'WEAPON'
  const health = card.type === 'HERO' ? card.health ?? 0 : isWeapon ? card.durability ?? 0 : card.health ?? 0
  return {
    id: -(index + 20),
    definitionId: card.id,
    cost: card.cost,
    name: card.name,
    assetPath: cardAssetPath(card),
    attack: card.attack ?? 0,
    health,
    maxHealth: health,
    armor: 0,
    durability: card.durability ?? 0,
    exhausted: false,
    keywords: [],
    controllerId: 'PLAYER',
  }
}

function cardTypeText(card: CardDefinitionV1): string {
  const raceText = card.races.map((race) => RACE_LABELS[race] ?? race).join(' · ')
  return [CARD_TYPE_LABELS[card.type] ?? card.type, raceText].filter(Boolean).join(' · ')
}

function cardValueText(card: CardDefinitionV1): string {
  if (card.type === 'MINION') return `${card.attack}/${card.health}`
  if (card.type === 'WEAPON') return `${card.attack}/${card.durability}`
  if (card.type === 'HERO') return `生命 ${card.health}`
  return ''
}

function CardSample({ card, index }: { card: CardDefinitionV1; index: number }) {
  const typeText = cardTypeText(card)
  const valueText = cardValueText(card)
  const entity = sampleEntity(card, index)
  return (
    <article
      className={`card-preview-sample card-preview-sample--${card.type.toLowerCase()}`}
      aria-label={`${card.name}，${typeText}`}
      data-card-sample={card.id}
      data-card-type={card.type}
    >
      <div className="card-preview-sample-frame">
        <CardFace entity={entity} cardFrame frameImagePath={cardAssetPath(card)} imageAlt={`${card.name}${typeText}官方原卡图与实时数值`} />
      </div>
      <div className="card-preview-sample-caption">
        <strong>{card.name}</strong>
        <span>{typeText}{valueText ? ` · ${valueText}` : ''}</span>
      </div>
    </article>
  )
}

type CardLayerBreakdownProps = {
  entity: PublicEntityViewModel
  frameImagePath: string
  title: string
  layers: Array<{ key: CardFrameLayer; label: string; description: string }>
}

function CardLayerBreakdown({ entity, frameImagePath, title, layers }: CardLayerBreakdownProps) {
  return (
    <section className="card-preview-layer-debug" aria-label={`${title}逐层诊断`}>
      <div className="card-preview-gallery-heading">
        <span>{title}</span>
        <strong>同一张卡的独立图层</strong>
      </div>
      <div className="card-preview-layer-grid">
        {layers.map(({ key, label, description }) => (
          <article className="card-preview-layer" key={key} aria-label={label} data-card-layer={key}>
            <div className="card-preview-layer-frame">
              <CardFace
                entity={entity}
                cardFrame
                cardLayer={key}
                frameImagePath={frameImagePath}
                imageAlt={`${entity.name}${label}`}
              />
            </div>
            <strong>{label}</strong>
            <span>{description}</span>
          </article>
        ))}
      </div>
    </section>
  )
}

function runtimeCardFromView(view: CardPreviewRuntimeModel['view']): PublicEntityViewModel {
  const card = view.self.board.find((entity) => entity.definitionId === 'CS2_196')
  if (!card) throw new Error('CARD_PREVIEW_RUNTIME_PROJECTION_MISSING')
  return card
}
function RuntimeCardView({ entity, mode }: { entity: PublicEntityViewModel; mode: 'hand' | 'board' | 'inspection' }) {
  const label = mode === 'hand' ? '手牌' : mode === 'board' ? '战场' : '悬停预览'
  return (
    <div className={`card-preview-runtime-view card-preview-runtime-view--${mode}`} data-runtime-card-view={mode}>
      <span>{label}</span>
      <div className="card-preview-runtime-card game-card">
        <CardFace entity={entity} cardFrame frameImagePath="/assets/cards/CS2_196.png" imageAlt={`${entity.name}${label}官方原卡图与实时数值`} />
      </div>
    </div>
  )
}

export function CardPreview() {
  const [runtime, setRuntime] = useState(createCardPreviewRuntime)
  const runtimeCard = runtimeCardFromView(runtime.view)
  const raceText = PREVIEW_CARD.races.map((race) => RACE_LABELS[race] ?? race).join(' · ')
  const typeText = [CARD_TYPE_LABELS[PREVIEW_CARD.type] ?? PREVIEW_CARD.type, raceText].filter(Boolean).join(' · ')
  const rarityText = RARITY_LABELS[PREVIEW_CARD.rarity] ?? PREVIEW_CARD.rarity
  const effectText = PREVIEW_CARD.text.replaceAll(/<\/?b>/g, '')
  const damaged = runtimeCard.health < runtimeCard.maxHealth
  const weaponEntity = sampleEntity(PREVIEW_WEAPON_CARD, 2)

  function attackRuntimeCard(): void {
    setRuntime((current) => current.attack())
  }

  function resetRuntimeCard(): void {
    setRuntime(createCardPreviewRuntime())
  }

  return (
    <main className="card-preview-page">
      <header className="card-preview-header">
        <div>
          <span className="card-preview-eyebrow">分层卡牌原型 · DESKTOP CARD STUDY</span>
          <h1>官方卡面样板</h1>
          <p>先比较随从、法术、武器与英雄四种栅格框卡面。</p>
        </div>
        <a className="card-preview-back" href="/">返回展示战</a>
      </header>
      <section className="card-preview-layout" aria-label="卡牌预览工作台">
        <div className="card-preview-stage">
          <section className="card-preview-gallery" aria-label="不同类型卡牌样板">
            <div className="card-preview-gallery-heading">
              <span>样板卡面</span>
              <strong>官方原卡图 · 实时数值</strong>
            </div>
            <div className="card-preview-gallery-grid">
              {SAMPLE_CARDS.map((card, index) => <CardSample key={card.id} card={card} index={index} />)}
            </div>
          </section>
          <article
            className="layered-card layered-card--mechanical"
            aria-label={`${runtimeCard.name}，费用 ${runtimeCard.cost}，攻击 ${runtimeCard.attack}，生命 ${runtimeCard.health}/${runtimeCard.maxHealth}，效果 ${effectText}`}
            data-card-preview={runtimeCard.definitionId}
            data-card-effect-source="official-card-image"
            data-card-cost-current={runtimeCard.cost}
            data-card-attack-current={runtimeCard.attack}
            data-card-value-current={runtimeCard.health}
            data-card-value-max={runtimeCard.maxHealth}
            data-runtime-card-state={`${runtimeCard.attack}/${runtimeCard.health}`}
          >
            <CardFace entity={runtimeCard} cardFrame frameImagePath="/assets/cards/CS2_196.png" imageAlt={`${runtimeCard.name}官方原卡图与实时数值`} />
          </article>
          <CardLayerBreakdown entity={runtimeCard} frameImagePath="/assets/cards/CS2_196.png" title="随从牌" layers={CARD_LAYERS} />
          <CardLayerBreakdown entity={weaponEntity} frameImagePath="/assets/cards/CS2_082.png" title="武器牌" layers={WEAPON_CARD_LAYERS} />
          <p className="card-preview-caption">引擎实体：{runtimeCard.definitionId} · 当前生命 {runtimeCard.health}/{runtimeCard.maxHealth}</p>
          <section className="card-preview-runtime-views" aria-label="同一实体的三种实时视图">
            <div className="card-preview-gallery-heading">
              <span>同一实体</span>
              <strong>手牌 · 战场 · 悬停预览</strong>
            </div>
            <div className="card-preview-runtime-view-grid">
              <RuntimeCardView entity={runtimeCard} mode="hand" />
              <RuntimeCardView entity={runtimeCard} mode="board" />
              <RuntimeCardView entity={runtimeCard} mode="inspection" />
            </div>
          </section>
        </div>
        <aside className="card-preview-panel" aria-label="动态数值预览控制">
          <div className="card-preview-panel-heading">
            <span>引擎状态层</span>
            <strong>真实攻击命令</strong>
          </div>
          <p>按钮会让一个真实的 1/1 随从攻击剃刀猎手，数值经过引擎结算和公开投影后同步到三处官方原卡图。</p>
          <div className="card-preview-runtime-state" data-runtime-card-state={`${runtimeCard.attack}/${runtimeCard.health}`}>
            <span>当前公开投影</span>
            <strong>攻击 {runtimeCard.attack} · 生命 {runtimeCard.health}/{runtimeCard.maxHealth}</strong>
          </div>
          <div className="card-preview-controls">
            <button type="button" aria-label="让1/1随从攻击剃刀猎手" disabled={damaged} onClick={attackRuntimeCard}>让 1/1 随从攻击剃刀猎手</button>
            <button type="button" aria-label="重置引擎样板" onClick={resetRuntimeCard}>重置引擎样板</button>
          </div>
          <dl className="card-preview-spec">
            <div><dt>卡牌效果</dt><dd>{effectText}</dd></div>
            <div><dt>类型</dt><dd>{typeText} · {rarityText}</dd></div>
            <div><dt>素材来源</dt><dd>HearthstoneJSON 官方卡图 + 实时数值层</dd></div>
          </dl>
        </aside>
      </section>
    </main>
  )
}
