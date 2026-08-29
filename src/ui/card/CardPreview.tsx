import { useState } from 'react'
import { getCardDefinition } from '@/cards/registry'
import type { CardDefinitionId } from '@/cards/types'

const PREVIEW_CARD_ID: CardDefinitionId = 'CS2_196'
const PREVIEW_CARD = getCardDefinition(PREVIEW_CARD_ID)

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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function ValueControl({ label, value, minimum, maximum, onChange }: { label: string; value: number; minimum: number; maximum: number; onChange: (next: number) => void }) {
  return (
    <div className="card-preview-control" role="group" aria-label={`${label}预览值`}>
      <span>{label}</span>
      <button type="button" aria-label={`${label}-1`} disabled={value <= minimum} onClick={() => onChange(clamp(value - 1, minimum, maximum))}>−</button>
      <strong>{value}</strong>
      <button type="button" aria-label={`${label}+1`} disabled={value >= maximum} onClick={() => onChange(clamp(value + 1, minimum, maximum))}>＋</button>
    </div>
  )
}

export function CardPreview() {
  const [cost, setCost] = useState(PREVIEW_CARD.cost)
  const [attack, setAttack] = useState(PREVIEW_CARD.attack)
  const [health, setHealth] = useState(PREVIEW_CARD.health)
  const raceText = PREVIEW_CARD.races.map((race) => RACE_LABELS[race] ?? race).join(' · ')
  const typeText = [CARD_TYPE_LABELS[PREVIEW_CARD.type] ?? PREVIEW_CARD.type, raceText].filter(Boolean).join(' · ')
  const rarityText = RARITY_LABELS[PREVIEW_CARD.rarity] ?? PREVIEW_CARD.rarity
  const effectText = PREVIEW_CARD.text.replaceAll(/<\/?b>/g, '')

  return (
    <main className="card-preview-page">
      <header className="card-preview-header">
        <div>
          <span className="card-preview-eyebrow">分层卡牌原型 · DESKTOP CARD STUDY</span>
          <h1>{PREVIEW_CARD.name}</h1>
          <p>原画、原始效果文字与费用/攻击/生命动态覆盖。</p>
        </div>
        <a className="card-preview-back" href="/">返回展示战</a>
      </header>
      <section className="card-preview-layout" aria-label="卡牌预览工作台">
        <div className="card-preview-stage">
          <article
            className="layered-card layered-card--mechanical"
            aria-label={`${PREVIEW_CARD.name}，费用 ${cost}，攻击 ${attack}，生命 ${health}/${PREVIEW_CARD.health}，效果 ${effectText}`}
            data-card-preview={PREVIEW_CARD.id}
            data-card-effect-source="original-art"
            data-card-cost-current={cost}
            data-card-attack-current={attack}
            data-card-value-current={health}
            data-card-value-max={PREVIEW_CARD.health}
          >
            <img className="layered-card-art-source" src={`/assets/cards/${PREVIEW_CARD.id}.png`} alt={`${PREVIEW_CARD.name}原画、卡框与原始效果文字`} draggable={false} />
            <span className="layered-card-cost" aria-label={`费用 ${cost}`}>{cost}</span>
            <span className="layered-card-stat layered-card-attack" aria-label={`攻击 ${attack}`}>{attack}</span>
            <span className={`layered-card-stat layered-card-health ${health < PREVIEW_CARD.health ? 'is-damaged' : ''}`} aria-label={`生命 ${health}`}>{health}</span>
          </article>
          <p className="card-preview-caption">真实素材：{PREVIEW_CARD.id} · {PREVIEW_CARD.set}</p>
        </div>
        <aside className="card-preview-panel" aria-label="动态数值预览控制">
          <div className="card-preview-panel-heading">
            <span>实时数据层</span>
            <strong>公开投影接入位</strong>
          </div>
          <p>原图效果文字保持原样，调整下方数值查看三处动态覆盖。</p>
          <div className="card-preview-controls">
            <ValueControl label="费用" value={cost} minimum={0} maximum={10} onChange={setCost} />
            <ValueControl label="攻击" value={attack} minimum={0} maximum={20} onChange={setAttack} />
            <ValueControl label="生命" value={health} minimum={0} maximum={20} onChange={setHealth} />
          </div>
          <dl className="card-preview-spec">
            <div><dt>卡牌效果</dt><dd>{effectText}</dd></div>
            <div><dt>类型</dt><dd>{typeText} · {rarityText}</dd></div>
            <div><dt>素材来源</dt><dd>本地官方卡图（原始效果保留）</dd></div>
          </dl>
        </aside>
      </section>
    </main>
  )
}
