import { useEffect, useMemo, useRef, useState, type AnimationEvent as ReactAnimationEvent, type CSSProperties, type FocusEvent as ReactFocusEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { getCardDefinition } from '@/cards/registry'
import type { CardDefinitionId } from '@/cards/types'
import { usePlayerSession, type LegalActionDescriptor, type PlayerViewModel, type PublicEntityViewModel } from '@/app/context/playerSession'

const KEYWORD_LABELS: Record<string, string> = {
  MANATHIRST: '法力渴求',
  POISONOUS: '剧毒',
  ELUSIVE: '扰魔',
  DISCOVER: '发现',
  MAGNETIC: '磁力',
  TAUNT: '嘲讽',
  DEATHRATTLE: '亡语',
  CHARGE: '冲锋',
  RUSH: '突袭',
  DIVINE_SHIELD: '圣盾',
  WINDFURY: '风怒',
}

const EVENT_LABELS: Record<string, string> = {
  CARD_PLAYED: '打出卡牌',
  CARD_ADDED: '获得卡牌',
  ATTACK_DECLARED: '发起攻击',
  DAMAGE_BATCH_APPLIED: '伤害结算',
  MINION_DEATH_BATCH: '随从死亡',
  MANATHIRST_BONUS_APPLIED: '法力渴求触发',
  DISCOVER_OFFERED: '发现选项出现',
  DISCOVER_RESOLVED: '发现完成',
  MAGNETIC_MERGED: '磁力合体',
  KEYWORD_COVERED: '关键词演示完成',
  TURN_STARTED: '新回合开始',
  GAME_CONCEDED: '旅店老板认输',
  GAME_ENDED: '对局结束',
  MINION_SUMMONED: '召唤随从',
  MINION_BUFFED: '随从强化',
  MINION_KEYWORD_GRANTED: '获得关键词',
  WEAPON_CREATED_AND_EQUIPPED: '装备武器',
  HERO_HEALTH_SET: '英雄生命变化',
  HERO_POWER_REFRESHED: '英雄技能复原',
}

const KEYWORD_DESCRIPTIONS: Record<string, string> = {
  MANATHIRST: '拥有指定法力值时获得额外效果。',
  POISONOUS: '对随从造成伤害后立即消灭它。',
  ELUSIVE: '无法成为敌方法术或英雄技能的目标。',
  DISCOVER: '从三个选项中选择一张牌。',
  MAGNETIC: '将机械牌贴到左侧机械随从上。',
  TAUNT: '敌人必须优先攻击具有嘲讽的随从。',
  DEATHRATTLE: '死亡时触发额外效果。',
  CHARGE: '召唤当回合即可攻击英雄。',
  RUSH: '召唤当回合即可攻击随从。',
  DIVINE_SHIELD: '抵挡一次伤害。',
  WINDFURY: '每个回合可以攻击两次。',
}

const INSPECTION_TOOLTIP_ID = 'card-keyword-tooltip'

type DragPayload =
  | { kind: 'HAND_CARD'; entityId: number }
  | { kind: 'BOARD_ENTITY'; entityId: number }
  | { kind: 'HERO'; entityId: number }
  | { kind: 'HERO_POWER'; entityId: number }
  | { kind: 'DISCOVER_CHOICE'; decisionId: string; choiceDefinitionId: CardDefinitionId }

type DropTarget =
  | { type: 'entity'; entityId: number }
  | { type: 'zone'; zone: 'self-board' | 'opponent-board' | 'discover' | 'mulligan' }

type DragState = DragPayload & {
  pointerId: number
  startX: number
  startY: number
  sourceX: number
  sourceY: number
  x: number
  y: number
  moved: boolean
  handExited: boolean
}

type PlayCardAction = Extract<LegalActionDescriptor, { type: 'PLAY_CARD' }>
type DropZone = Extract<DropTarget, { type: 'zone' }>['zone']

type DragPreviewEntity = PublicEntityViewModel

type TutorialHighlight = { role: 'source' | 'target' | 'excluded' | 'choice' }

type InspectionMode = 'hand' | 'board'

type InspectionSource = {
  sourceKey: string
  entity: PublicEntityViewModel
  mode: InspectionMode
  x: number
  y: number
}

type InspectionBinding = {
  sourceKey: string
  tooltipId: string
  active: boolean
  onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerLeave: () => void
  onFocus: (event: ReactFocusEvent<HTMLElement>) => void
  onBlur: () => void
}

function inspectionAttributes(inspection: InspectionBinding | undefined, hasKeywords: boolean) {
  if (!inspection) return {}
  return {
    'data-inspection-key': inspection.sourceKey,
    onPointerEnter: inspection.onPointerEnter,
    onPointerMove: inspection.onPointerMove,
    onPointerLeave: inspection.onPointerLeave,
    onFocus: inspection.onFocus,
    onBlur: inspection.onBlur,
    'aria-describedby': inspection.active && hasKeywords ? inspection.tooltipId : undefined,
  }
}

function tutorialAttributes(highlight: TutorialHighlight | undefined) {
  return highlight ? { 'data-tutorial-highlight': 'true', 'data-tutorial-role': highlight.role } : {}
}

function elementAtPoint(clientX: number, clientY: number): Element | null {
  return typeof document.elementFromPoint === 'function' ? document.elementFromPoint(clientX, clientY) : null
}

function readDropTarget(element: Element | null): DropTarget | null {
  const target = element?.closest('[data-drop-target]')
  const value = target?.getAttribute('data-drop-target')
  if (!value) return null
  if (value.startsWith('entity:')) {
    const entityId = Number(value.slice('entity:'.length))
    return Number.isInteger(entityId) ? { type: 'entity', entityId } : null
  }
  if (value.startsWith('zone:')) {
    const zone = value.slice('zone:'.length)
    if (zone === 'self-board' || zone === 'opponent-board' || zone === 'discover' || zone === 'mulligan') return { type: 'zone', zone }
  }
  return null
}

function choiceEntity(choiceDefinitionId: CardDefinitionId, index: number): DragPreviewEntity {
  const card = getCardDefinition(choiceDefinitionId)
  return {
    id: -(index + 1),
    definitionId: choiceDefinitionId,
    name: card.name,
    assetPath: `/assets/cards/${card.id}.png`,
    attack: card.attack,
    health: card.type === 'WEAPON' ? card.durability : card.health,
    maxHealth: card.type === 'WEAPON' ? card.durability : card.health,
    armor: 0,
    durability: card.durability,
    exhausted: false,
    keywords: [...card.keywords],
    controllerId: 'PLAYER',
  }
}

function fanStyle(index: number, count: number): CSSProperties {
  const midpoint = (count - 1) / 2
  const normalized = midpoint === 0 ? 0 : (index - midpoint) / midpoint
  return {
    '--fan-angle': `${normalized * 11}deg`,
    '--fan-lift': `${Math.abs(normalized) * 14}px`,
    '--fan-order': index,
  } as CSSProperties
}

function isEntityDropTarget(target: DropTarget | null, entityId: number): boolean {
  return target?.type === 'entity' && target.entityId === entityId
}

function isZoneDropTarget(target: DropTarget | null, zone: DropZone): boolean {
  return target?.type === 'zone' && target.zone === zone
}

function isDragPreviewOutsideHand(x: number, y: number, entityId: number): boolean {
  const hand = document.querySelector<HTMLElement>('.player-hand')
  if (!hand) return false
  const source = Array.from(hand.querySelectorAll<HTMLElement>('[data-entity-id]')).find((element) => element.getAttribute('data-entity-id') === String(entityId))
  const rect = source?.getBoundingClientRect() ?? hand.getBoundingClientRect()
  return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom
}

type Point = { x: number; y: number }

function dropTargetPoint(target: DropTarget | null): Point | null {
  if (!target) return null
  const selector = target.type === 'entity'
    ? `[data-drop-target="entity:${target.entityId}"]`
    : `[data-drop-target="zone:${target.zone}"]`
  const element = document.querySelector<HTMLElement>(selector)
  if (!element) return null
  const rect = element.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

function curvedArrowPath(start: Point, end: Point): string {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const distance = Math.hypot(dx, dy)
  if (distance < 1) return `M ${start.x} ${start.y} L ${end.x} ${end.y}`
  const bend = Math.min(110, Math.max(28, distance * 0.16))
  const control = {
    x: start.x + dx * 0.5 - (dy / distance) * bend,
    y: start.y + dy * 0.5 + (dx / distance) * bend,
  }
  return `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`
}

function placementIndexForPointer(pointerX: number): number {
  const entities = [...document.querySelectorAll<HTMLElement>('.player-board [data-drop-target^="entity:"]')]
  const index = entities.findIndex((element) => {
    const rect = element.getBoundingClientRect()
    return pointerX < rect.left + rect.width / 2
  })
  return index < 0 ? entities.length : index
}

function choosePlacementAction(actions: LegalActionDescriptor[], pointerX: number): PlayCardAction | null {
  const candidates = actions.filter((action): action is PlayCardAction => action.type === 'PLAY_CARD' && action.playMode === 'NORMAL' && action.targetEntityId === undefined)
  if (candidates.length === 0) return null
  const placementIndex = placementIndexForPointer(pointerX)
  return candidates.find((action) => action.placementIndex === placementIndex) ?? candidates[0] ?? null
}

function actionForDrop(payload: DragPayload, target: DropTarget | null, pointerX: number, actions: LegalActionDescriptor[], view: PlayerViewModel): LegalActionDescriptor | null {
  if (!target) return null
  if (payload.kind === 'DISCOVER_CHOICE') {
    if (!isZoneDropTarget(target, 'discover')) return null
    return actions.find((action) => action.type === 'SELECT_DISCOVER' && action.decisionId === payload.decisionId && action.discoverChoiceId === payload.choiceDefinitionId) ?? null
  }
  if (payload.kind === 'HAND_CARD') {
    if (isZoneDropTarget(target, 'mulligan')) return null
    const plays = actions.filter((action): action is PlayCardAction => action.type === 'PLAY_CARD' && action.cardInstanceId === payload.entityId)
    if (target.type === 'entity') {
      return plays.find((action) => action.targetEntityId === target.entityId)
        ?? (view.self.board.some((entity) => entity.id === target.entityId) ? choosePlacementAction(plays, pointerX) : null)
    }
    return target.zone === 'self-board' || target.zone === 'opponent-board' ? choosePlacementAction(plays, pointerX) : null
  }
  if (payload.kind === 'BOARD_ENTITY' || payload.kind === 'HERO') {
    if (target.type !== 'entity') return null
    return actions.find((action) => action.type === 'ATTACK' && action.attackSourceId === payload.entityId && action.attackTargetId === target.entityId) ?? null
  }
  if (payload.kind === 'HERO_POWER') {
    if (target.type === 'entity') {
      return actions.find((action) => action.type === 'USE_HERO_POWER' && action.targetEntityId === target.entityId)
        ?? actions.find((action) => action.type === 'USE_HERO_POWER' && action.targetEntityId === undefined) ?? null
    }
    return actions.find((action) => action.type === 'USE_HERO_POWER' && action.targetEntityId === undefined) ?? null
  }
  return null
}

function actionForKeyboard(payload: DragPayload, actions: LegalActionDescriptor[]): LegalActionDescriptor | null {
  if (payload.kind === 'DISCOVER_CHOICE') return actions.find((action) => action.type === 'SELECT_DISCOVER' && action.decisionId === payload.decisionId && action.discoverChoiceId === payload.choiceDefinitionId) ?? null
  if (payload.kind === 'HAND_CARD') return actions.find((action) => action.type === 'PLAY_CARD' && action.cardInstanceId === payload.entityId && action.playMode === 'MAGNETIC')
    ?? actions.find((action) => action.type === 'PLAY_CARD' && action.cardInstanceId === payload.entityId)
    ?? null
  if (payload.kind === 'BOARD_ENTITY' || payload.kind === 'HERO') return actions.find((action) => action.type === 'ATTACK' && action.attackSourceId === payload.entityId) ?? null
  return actions.find((action) => action.type === 'USE_HERO_POWER') ?? null
}

function AssetImage({ src, alt, className, fallbackSrc }: { src: string; alt: string; className?: string; fallbackSrc?: string }) {
  const [fallbackAttemptedFor, setFallbackAttemptedFor] = useState<string | null>(null)
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const showingFallback = fallbackSrc !== undefined && fallbackAttemptedFor === src
  if (failedSource === src) return <span className={`asset-fallback ${className ?? ''}`} role="img" aria-label={`${alt}素材加载失败`}>素材加载失败</span>
  const imageSrc = showingFallback ? fallbackSrc : src
  return <img src={imageSrc} alt={alt} className={className} draggable={false} onError={() => {
    if (!showingFallback && fallbackSrc) {
      setFallbackAttemptedFor(src)
      return
    }
    setFailedSource(src)
  }} />
}

function artAssetPath(entity: PublicEntityViewModel): string {
  if (entity.assetPath.startsWith('/assets/cards/')) return `/assets/card-art/${entity.definitionId}.png`
  if (entity.assetPath.startsWith('/assets/heroes/')) return `/assets/hero-art/${entity.definitionId}.png`
  if (entity.assetPath.startsWith('/assets/hero-powers/')) return `/assets/hero-power-art/${entity.definitionId}.png`
  return entity.assetPath
}

function cardRuntimeValues(entity: PublicEntityViewModel) {
  const definition = getCardDefinition(entity.definitionId)
  const weapon = definition.type === 'WEAPON'
  return {
    definition,
    valueLabel: weapon ? '耐久' : '生命',
    currentValue: weapon ? entity.durability : entity.health,
    maximumValue: weapon ? definition.durability : entity.maxHealth,
    baseValue: weapon ? definition.durability : definition.health,
    hasStats: definition.type === 'MINION' || weapon,
  }
}

function cardEffectIsReady(entity: PublicEntityViewModel, playable: boolean): boolean {
  if (!playable) return false
  const definition = getCardDefinition(entity.definitionId)
  const immediateEffect = definition.effect !== 'NONE' && !definition.effect.startsWith('DEATHRATTLE_')
  const actionKeyword = definition.keywords.some((keyword) => keyword === 'DISCOVER' || keyword === 'MAGNETIC' || keyword === 'MANATHIRST')
  return immediateEffect || actionKeyword
}

function InspectionLayer({ source }: { source: InspectionSource }) {
  const { entity } = source
  const keywordText = entity.keywords.map((keyword) => `${KEYWORD_LABELS[keyword] ?? keyword}：${KEYWORD_DESCRIPTIONS[keyword] ?? '该关键词的公开规则说明。'}`).join('；')
  const values = cardRuntimeValues(entity)
  const largeCardPreview = source.mode === 'board' && (
    values.definition.type === 'MINION' || values.definition.type === 'HERO' || values.definition.type === 'HERO_POWER'
  )
  const battlefieldCardPreview = source.mode === 'board' && values.definition.type === 'MINION'
  const valueSummary = values.definition.type === 'HERO'
    ? `生命 ${entity.health}/${entity.maxHealth}`
    : values.hasStats
      ? `攻击 ${entity.attack} · ${values.valueLabel} ${values.currentValue}/${values.maximumValue}`
      : `费用 ${values.definition.cost}`
  const positionStyle = source.mode === 'hand' ? { left: `${source.x}px`, top: `${source.y}px` } : undefined
  return (
    <div
      className={`inspection-layer ${source.mode === 'hand' ? 'hand-hover-preview' : ''} ${largeCardPreview ? 'large-card-preview' : ''} ${battlefieldCardPreview ? 'battlefield-card-preview' : ''}`}
      style={positionStyle}
      data-inspection-overlay
      data-inspection-mode={source.mode}
      data-inspection-entity-id={entity.id}
      data-inspection-definition-id={entity.definitionId}
      data-inspection-presentation={largeCardPreview ? 'card-only' : undefined}
    >
      {source.mode === 'hand' ? (
        <div className="hand-hover-card game-card" aria-label={`公开预览：${entity.name}`}>
          <CardFace entity={entity} imageAlt={`${entity.name}公开预览`} />
        </div>
      ) : (
        <div className={`inspection-card ${largeCardPreview ? 'inspection-card--pure' : ''}`} aria-label={`公开预览：${entity.name}`}>
          <div
            className={`inspection-card-art game-card compact ${battlefieldCardPreview ? 'battlefield-inspection-card' : largeCardPreview ? `large-inspection-card large-inspection-card--${values.definition.type.toLowerCase()}` : ''}`}
            data-card-definition-id={entity.definitionId}
            data-entity-id={entity.id}
            data-card-cost-current={values.definition.cost}
            data-card-attack-current={values.hasStats ? entity.attack : undefined}
            data-card-value-current={values.hasStats ? values.currentValue : undefined}
            data-card-value-max={values.hasStats ? values.maximumValue : undefined}
            data-card-value-label={values.hasStats ? values.valueLabel : undefined}
          >
            <CardFace entity={entity} imageAlt={`${entity.name}公开预览`} />
          </div>
          {largeCardPreview ? null : <div className="inspection-card-copy">
            <strong>{entity.name}</strong>
            <span>{valueSummary}</span>
            {values.definition.type === 'HERO' && entity.attack > 0 ? <span>攻击 {entity.attack}</span> : null}
            {entity.armor > 0 ? <span>护甲 {entity.armor}</span> : null}
            {entity.durability > 0 && values.valueLabel !== '耐久' ? <span>耐久 {entity.durability}</span> : null}
            {entity.keywords.length > 0 ? <span>{entity.keywords.map((keyword) => KEYWORD_LABELS[keyword] ?? keyword).join(' · ')}</span> : null}
          </div>}
        </div>
      )}
      {entity.keywords.length > 0 && !largeCardPreview ? <div id={INSPECTION_TOOLTIP_ID} role="tooltip" className="keyword-tooltip">{keywordText}</div> : null}
    </div>
  )
}

type CardFaceProps = {
  entity: PublicEntityViewModel
  imageAlt?: string
  battlefield?: boolean
}

function CardFace({ entity, imageAlt, battlefield = false }: CardFaceProps) {
  const values = cardRuntimeValues(entity)
  const attackState = entity.attack > values.definition.attack ? 'buffed' : entity.attack < values.definition.attack ? 'debuffed' : 'base'
  const valueState = values.currentValue < values.maximumValue
    ? 'damaged'
    : values.maximumValue > values.baseValue
      ? 'buffed'
      : values.maximumValue < values.baseValue
        ? 'debuffed'
        : 'base'
  return (
    <>
      {battlefield ? <span className="battlefield-art-window"><AssetImage src={artAssetPath(entity)} fallbackSrc={entity.assetPath} alt={imageAlt ?? `${entity.name}原画`} className="battlefield-card-art" /></span> : <AssetImage src={entity.assetPath} alt={imageAlt ?? `${entity.name}卡图`} />}
      {!battlefield && values.definition.type !== 'HERO' ? <span className="card-cost layered-card-cost" aria-label={`费用 ${values.definition.cost}`} data-card-cost-current={values.definition.cost}>{values.definition.cost}</span> : null}
      {values.hasStats ? <span
        className="card-stats"
        aria-label={`攻击 ${entity.attack}，${values.valueLabel} ${values.currentValue}/${values.maximumValue}`}
        data-card-attack-current={entity.attack}
        data-card-value-current={values.currentValue}
        data-card-value-max={values.maximumValue}
        data-card-value-label={values.valueLabel}
      >
        <span className={`card-stat layered-card-stat layered-card-attack card-attack card-stat--${attackState}`}>{entity.attack}</span>
        <span className={`card-stat layered-card-stat layered-card-health card-health card-stat--${valueState}`}>{values.currentValue}</span>
      </span> : null}
    </>
  )
}

type CardProps = {
  entity: PublicEntityViewModel
  compact?: boolean
  selected?: boolean
  onToggle?: () => void
  onPointerDown?: ((event: ReactPointerEvent<HTMLElement>) => void) | undefined
  onActivate?: (() => void) | undefined
  dropTargetId?: number
  dropTargetClassName?: string
  battlefield?: boolean
  style?: CSSProperties
  inspection?: InspectionBinding | undefined
  tutorialHighlight?: TutorialHighlight | undefined
  playable?: boolean
  attackable?: boolean
  effectReady?: boolean
  projectedDeath?: boolean
}

function Card({ entity, compact = false, selected = false, onToggle, onPointerDown, onActivate, dropTargetId, dropTargetClassName = '', battlefield = false, style, inspection, tutorialHighlight, playable = false, attackable = false, effectReady = false, projectedDeath = false }: CardProps) {
  const values = cardRuntimeValues(entity)
  const baseAccessibleLabel = values.hasStats
    ? `${entity.name}，攻击 ${entity.attack}，${values.valueLabel} ${values.currentValue}/${values.maximumValue}`
    : values.definition.type === 'HERO'
      ? `${entity.name}英雄，生命 ${entity.health}/${entity.maxHealth}`
      : `${entity.name}，费用 ${values.definition.cost}`
  const cardStatusLabels = [
    playable ? '可使用' : null,
    attackable ? '可攻击' : null,
    effectReady ? '特效可触发' : null,
    projectedDeath ? '攻击后预计死亡' : null,
  ].filter((label): label is string => label !== null)
  const accessibleLabel = cardStatusLabels.length > 0 ? `${baseAccessibleLabel}，${cardStatusLabels.join('，')}` : baseAccessibleLabel
  const content = <>
    <CardFace entity={entity} battlefield={battlefield} />
    {projectedDeath ? <span className="projected-death-marker" role="img" aria-label="预告：攻击后预计死亡" data-predicted-death="true">☠</span> : null}
  </>
  const className = `game-card ${battlefield ? 'battlefield-card' : ''} ${compact ? 'compact' : ''} ${selected ? 'selected' : ''} ${entity.exhausted ? 'exhausted' : ''} ${onPointerDown ? 'drag-source' : ''} ${playable ? 'card-playable' : ''} ${attackable ? 'card-attackable' : ''} ${effectReady ? 'card-effect-ready' : ''} ${projectedDeath ? 'card-projected-death' : ''} ${dropTargetClassName}`
  const commonProps = {
    'data-drop-target': dropTargetId === undefined ? undefined : `entity:${dropTargetId}`,
    'data-card-definition-id': entity.definitionId,
    'data-entity-id': entity.id,
    'data-card-cost-current': values.definition.cost,
    'data-card-attack-current': values.hasStats ? entity.attack : undefined,
    'data-card-value-current': values.hasStats ? values.currentValue : undefined,
    'data-card-value-max': values.hasStats ? values.maximumValue : undefined,
    'data-card-value-label': values.hasStats ? values.valueLabel : undefined,
    'data-card-playable': playable ? 'true' : undefined,
    'data-card-attackable': attackable ? 'true' : undefined,
    'data-card-effect-ready': effectReady ? 'true' : undefined,
    'data-predicted-death': projectedDeath ? 'true' : undefined,
    onPointerDown,
    style,
  }
  const publicInspectionProps = inspectionAttributes(inspection, entity.keywords.length > 0)
  const highlightProps = tutorialAttributes(tutorialHighlight)
  if (onToggle) {
    return <button type="button" className={`${className} selectable`} aria-pressed={selected} onClick={onToggle} {...commonProps} {...publicInspectionProps} {...highlightProps}>{content}</button>
  }
  if (onPointerDown || onActivate) {
    return <div
      role="button"
      tabIndex={0}
      className={className}
      aria-label={accessibleLabel}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onActivate?.()
        }
      }}
      {...commonProps}
      {...publicInspectionProps}
      {...highlightProps}
    >{content}</div>
  }
  return <article className={className} tabIndex={0} aria-label={accessibleLabel} {...commonProps} {...publicInspectionProps} {...highlightProps}>{content}</article>
}

type ManaTrayProps = {
  mana: PlayerViewModel['self']['mana']
  owner: 'self' | 'opponent'
}

function ManaTray({ mana, owner }: ManaTrayProps) {
  const permanentCount = Math.max(0, Math.floor(mana.maximum))
  const availablePermanentCount = Math.max(0, Math.min(permanentCount, Math.floor(mana.current)))
  const temporaryCount = Math.max(0, Math.floor(mana.temporary))
  return (
    <div
      className={`resource-pills mana-tray mana-crystal ${mana.current + mana.temporary > 0 ? 'mana-crystal--ready' : ''}`}
      role="group"
      aria-label={`法力 ${mana.current}/${mana.maximum}，临时 ${mana.temporary}`}
      data-mana-owner={owner}
      data-mana-current={mana.current}
      data-mana-max={mana.maximum}
      data-mana-temporary={mana.temporary}
    >
      <strong className="mana-crystal-value" aria-live="polite">{mana.current}/{mana.maximum}</strong>
      <div className="mana-crystal-list" aria-hidden="true">
        {Array.from({ length: permanentCount }, (_, index) => {
          const filled = index < availablePermanentCount
          return <span key={`permanent-${index + 1}`} className={`mana-crystal-gem ${filled ? 'mana-crystal-gem--filled' : 'mana-crystal-gem--empty'}`} data-mana-slot={index + 1} data-mana-kind="permanent" data-mana-state={filled ? 'filled' : 'empty'}><span className="mana-crystal-gem-shine" /></span>
        })}
        {Array.from({ length: temporaryCount }, (_, index) => <span key={`temporary-${index + 1}`} className="mana-crystal-gem mana-crystal-gem--temporary" data-mana-slot={permanentCount + index + 1} data-mana-kind="temporary" data-mana-state="temporary"><span className="mana-crystal-gem-shine" /></span>)}
      </div>
      {temporaryCount > 0 ? <small className="mana-crystal-temporary">+{temporaryCount}</small> : null}
    </div>
  )
}

type HeroProps = {
  entity: PublicEntityViewModel
  heroPower: PublicEntityViewModel
  weapon: PublicEntityViewModel | null
  label: string
  mana: PlayerViewModel['self']['mana']
  onEntityPointerDown?: ((event: ReactPointerEvent<HTMLElement>) => void) | undefined
  onEntityActivate?: (() => void) | undefined
  onHeroPowerPointerDown?: ((event: ReactPointerEvent<HTMLElement>) => void) | undefined
  onHeroPowerActivate?: (() => void) | undefined
  entityDropTargetClassName?: string
  heroPowerDropTargetClassName?: string
  heroPowerDisabled?: boolean
  inspection?: InspectionBinding | undefined
  weaponInspection?: InspectionBinding | undefined
  heroPowerInspection?: InspectionBinding | undefined
  tutorialHighlight?: TutorialHighlight | undefined
  heroPowerTutorialHighlight?: TutorialHighlight | undefined
}

function healthPercent(entity: PublicEntityViewModel): number {
  const maximum = Math.max(1, entity.maxHealth)
  return Math.round(Math.max(0, Math.min(1, entity.health / maximum)) * 100)
}

function Hero({ entity, heroPower, weapon, label, mana, onEntityPointerDown, onEntityActivate, onHeroPowerPointerDown, onHeroPowerActivate, entityDropTargetClassName = '', heroPowerDropTargetClassName = '', heroPowerDisabled, inspection, weaponInspection, heroPowerInspection, tutorialHighlight, heroPowerTutorialHighlight }: HeroProps) {
  const currentHealth = Math.max(0, entity.health)
  const currentAttack = Math.max(0, entity.attack + (weapon?.attack ?? 0))
  const heroPowerDefinition = getCardDefinition(heroPower.definitionId)
  const weaponDefinition = weapon ? getCardDefinition(weapon.definitionId) : null
  const healthWidth = healthPercent(entity)
  const heroPowerInteractive = onHeroPowerPointerDown !== undefined || onHeroPowerActivate !== undefined
  const resolvedHeroPowerDisabled = heroPowerDisabled ?? !heroPowerInteractive
  return (
    <section className={`hero-strip hero-${entity.controllerId.toLowerCase()}`} aria-label={label} data-hero-class={getCardDefinition(entity.definitionId).cardClass} data-health-current={currentHealth} data-health-max={entity.maxHealth} data-hero-attack-current={currentAttack} data-armor={entity.armor} data-mana-current={mana.current} data-mana-max={mana.maximum} data-mana-temporary={mana.temporary}>
      <div className="hero-core">
        <div
          className={`hero-portrait ${onEntityPointerDown ? 'drag-source' : ''} ${entityDropTargetClassName}`}
        data-drop-target={`entity:${entity.id}`}
        data-card-definition-id={entity.definitionId}
        data-entity-id={entity.id}
        onPointerDown={onEntityPointerDown}
        role={onEntityPointerDown || onEntityActivate ? 'button' : 'img'}
        tabIndex={0}
        onKeyDown={onEntityActivate ? (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onEntityActivate()
          }
        } : undefined}
        aria-label={`${label}英雄 ${entity.name}，攻击 ${currentAttack}，生命 ${currentHealth}/${entity.maxHealth}${entity.armor > 0 ? `，护甲 ${entity.armor}` : ''}`}
        {...inspectionAttributes(inspection, entity.keywords.length > 0)}
        {...tutorialAttributes(tutorialHighlight)}
      >
        <span className="hero-art-window">
          <AssetImage src={artAssetPath(entity)} fallbackSrc={entity.assetPath} alt={`${label}英雄 ${entity.name}`} className="hero-art" />
        </span>
          <span className="hero-health-badge" aria-live="polite">{currentHealth}</span>
          {currentAttack > 0 ? <span className={`hero-attack-badge ${entity.attack > 0 ? 'hero-attack-badge--temporary' : ''}`} aria-label={`攻击 ${currentAttack}`} data-hero-attack-current={currentAttack}>{currentAttack}</span> : null}
          {entity.armor > 0 ? <span className="hero-armor-badge" aria-label={`护甲 ${entity.armor}`} data-hero-armor-current={entity.armor}>{entity.armor}</span> : null}
        </div>
        <div className="hero-details">
        <strong>{label}<small>{entity.name}</small></strong>
        <div className="hero-health-row">
          <span className="health-caption">生命 {currentHealth} / {entity.maxHealth}{entity.armor > 0 ? ` · ${entity.armor} 护甲` : ''}</span>
          <span className="health-track" aria-hidden="true"><span className="health-fill" data-health-fill={healthWidth} style={{ width: `${healthWidth}%` }} /></span>
        </div>
      </div>
      {weapon ? <div className="weapon-slot" tabIndex={0} aria-label={`${label}武器 ${weapon.name}，攻击 ${weapon.attack}，耐久 ${weapon.durability}`} data-card-definition-id={weapon.definitionId} data-entity-id={weapon.id} data-card-cost-current={weaponDefinition?.cost} data-card-attack-current={weapon.attack} data-card-value-current={weapon.durability} data-card-value-max={weaponDefinition?.durability} data-card-value-label="耐久" {...inspectionAttributes(weaponInspection, weapon.keywords.length > 0)}>
        <span className="weapon-art-window">
          <AssetImage src={weapon.assetPath} alt={`${weapon.name}武器卡图`} className="weapon-art" />
          <span className="weapon-stat weapon-attack" aria-hidden="true">{weapon.attack}</span>
          <span className="weapon-stat weapon-durability" aria-hidden="true">{weapon.durability}</span>
        </span>
        <span className="weapon-name">{weapon.name}</span>
      </div> : null}
      <button
        type="button"
        className={`hero-power-slot ${onHeroPowerPointerDown ? 'drag-source' : ''} ${heroPowerDropTargetClassName}`}
        data-card-definition-id={heroPower.definitionId}
        data-entity-id={heroPower.id}
        data-card-cost-current={heroPowerDefinition.cost}
        onPointerDown={onHeroPowerPointerDown}
        onClick={onHeroPowerActivate}
        disabled={resolvedHeroPowerDisabled}
        aria-label={`英雄技能 ${heroPower.name}，费用 ${heroPowerDefinition.cost}`}
        onKeyDown={onHeroPowerActivate ? (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onHeroPowerActivate()
          }
        } : undefined}
        {...inspectionAttributes(heroPowerInspection, heroPower.keywords.length > 0)}
        {...tutorialAttributes(heroPowerTutorialHighlight)}
      >
        <span className="hero-power-art-window">
          <AssetImage src={artAssetPath(heroPower)} fallbackSrc={heroPower.assetPath} alt={`英雄技能 ${heroPower.name}`} className="hero-power-art" />
          <span className="hero-power-cost" aria-hidden="true" data-card-cost-current={heroPowerDefinition.cost}>{heroPowerDefinition.cost}</span>
        </span>
        <span>{heroPower.name}</span>
        </button>
      </div>
    </section>
  )
}

type DeckTrackerProps = {
  owner: 'self' | 'opponent'
  label: string
  handCount: number
  deckCount: number
}

function DeckTracker({ owner, label, handCount, deckCount }: DeckTrackerProps) {
  const state = deckCount > 0 ? 'has-cards' : 'empty'
  return (
    <div
      className={`deck-tracker deck-tracker--${owner} deck-tracker--${state}`}
      role="group"
      tabIndex={0}
      aria-label={`${label}牌库，牌库 ${deckCount} 张，手牌 ${handCount} 张`}
      data-deck-owner={owner}
      data-deck-state={state}
      data-deck-count={deckCount}
      data-hand-count={handCount}
    >
      <span className="deck-pile" aria-hidden="true">
        <AssetImage src="/assets/card-back/in-a-dark-wood.png" alt={`${label}牌库牌背`} className="deck-pile-art" />
        <span className="deck-count">{deckCount}</span>
      </span>
      <span className="deck-copy"><strong>{label}</strong><small>{state === 'has-cards' ? '牌库' : '空牌库'}</small></span>
      <span className="deck-tooltip" aria-hidden="true">手牌 {handCount} · 牌库 {deckCount}</span>
    </div>
  )
}

export function GameBoard() {
  const session = usePlayerSession()
  const [mulliganIds, setMulliganIds] = useState<number[]>([])
  const [skipAnimations, setSkipAnimations] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [completedAnimationKey, setCompletedAnimationKey] = useState('')
  const [drag, setDrag] = useState<DragState | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [hoverInspection, setHoverInspection] = useState<InspectionSource | null>(null)
  const [focusInspection, setFocusInspection] = useState<InspectionSource | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const suppressClickRef = useRef(false)
  const mulligan = session.legalActions.find((action) => action.type === 'CONFIRM_MULLIGAN')
  const normalActions = session.legalActions.filter((action) => action.type !== 'CONFIRM_MULLIGAN' && action.type !== 'CONCEDE')
  const concede = session.legalActions.find((action) => action.type === 'CONCEDE')
  const recentEvents = useMemo(() => session.lastEventTypes.filter((type) => EVENT_LABELS[type]).slice(-5), [session.lastEventTypes])

  const animating = session.lastEventKey !== '' && !skipAnimations && completedAnimationKey !== session.lastEventKey
  const interactionLocked = session.busy || animating
  const discoverActions = session.legalActions.filter((action): action is Extract<LegalActionDescriptor, { type: 'SELECT_DISCOVER' }> => action.type === 'SELECT_DISCOVER')
  const discoverChoiceIds = discoverActions.map((action) => action.discoverChoiceId)
  const discoverDecisionId = discoverActions[0]?.decisionId
  const dragEntity = drag?.kind === 'HAND_CARD'
    ? session.view.self.hand.find((entity) => entity.id === drag.entityId)
    : drag?.kind === 'BOARD_ENTITY'
      ? session.view.self.board.find((entity) => entity.id === drag.entityId)
      : drag?.kind === 'HERO'
        ? session.view.self.hero
        : drag?.kind === 'HERO_POWER'
          ? session.view.self.heroPower
          : drag?.kind === 'DISCOVER_CHOICE'
            ? choiceEntity(drag.choiceDefinitionId, Math.max(0, discoverChoiceIds.indexOf(drag.choiceDefinitionId)))
            : undefined
  const activeDropAction = drag ? actionForDrop(drag, dropTarget, drag.x, session.legalActions, session.view) : null
  const discoverDialogRef = useRef<HTMLDialogElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const settingsDialogRef = useRef<HTMLDialogElement>(null)
  const settingsPreviouslyFocusedRef = useRef<HTMLElement | null>(null)
  const dialogLifecycleRef = useRef<'closed' | 'open'>('closed')
  const discoverOpen = discoverChoiceIds.length > 0 && discoverDecisionId !== undefined
  const inspectedEntity = focusInspection ?? hoverInspection

  function clearInspection(): void {
    setHoverInspection(null)
    setFocusInspection(null)
  }

  function inspectionFor(entity: PublicEntityViewModel, sourceKey = `entity:${entity.id}`): InspectionBinding {
    const mode: InspectionMode = sourceKey.startsWith('choice:') || !session.view.self.hand.some((handEntity) => handEntity.id === entity.id) ? 'board' : 'hand'
    const sourceAt = (x: number, y: number): InspectionSource => ({ sourceKey, entity, mode, x, y })
    return {
      sourceKey,
      tooltipId: INSPECTION_TOOLTIP_ID,
      active: inspectedEntity?.sourceKey === sourceKey,
      onPointerEnter: (event) => setHoverInspection(sourceAt(event.clientX, event.clientY)),
      onPointerMove: (event) => setHoverInspection((current) => current?.sourceKey === sourceKey ? sourceAt(event.clientX, event.clientY) : current),
      onPointerLeave: () => setHoverInspection((current) => current?.sourceKey === sourceKey ? null : current),
      onFocus: (event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        setFocusInspection(sourceAt(rect.left + rect.width / 2, rect.top + rect.height / 2))
      },
      onBlur: () => setFocusInspection((current) => current?.sourceKey === sourceKey ? null : current),
    }
  }

  function assignDiscoverDialogRef(dialog: HTMLDialogElement | null): void {
    if (dialog) discoverDialogRef.current = dialog
  }

  function handleDiscoverClose(): void {
    dialogLifecycleRef.current = 'closed'
  }

  useEffect(() => {
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || discoverOpen || settingsOpen) return
      event.preventDefault()
      settingsPreviouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setSettingsOpen(true)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [discoverOpen, settingsOpen])

  useEffect(() => {
    const dialog = settingsDialogRef.current
    if (!settingsOpen) {
      if (dialog?.open) dialog.close()
      const previouslyFocused = settingsPreviouslyFocusedRef.current
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
      settingsPreviouslyFocusedRef.current = null
      return
    }
    if (!dialog) return
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    }
    dialog.querySelector<HTMLElement>('button:not([disabled])')?.focus()
  }, [settingsOpen])

  useEffect(() => {
    if (discoverOpen) {
      if (previouslyFocusedRef.current === null) {
        previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      }
      return
    }
    const dialog = discoverDialogRef.current
    if (dialog?.open) dialog.close()
    dialogLifecycleRef.current = 'closed'
    const previouslyFocused = previouslyFocusedRef.current
    if (previouslyFocused?.isConnected) previouslyFocused.focus()
    previouslyFocusedRef.current = null
  }, [discoverOpen])

  useEffect(() => {
    if (!discoverOpen) return
    const dialog = discoverDialogRef.current
    if (!dialog) return
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    }
    dialogLifecycleRef.current = 'open'
    dialog.querySelector<HTMLElement>('button:not([disabled]), [role="button"], [tabindex]:not([tabindex="-1"])')?.focus()
  }, [discoverOpen])

  useEffect(() => {
    if (!drag) return
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return
      const nextTarget = readDropTarget(elementAtPoint(event.clientX, event.clientY))
      setDrag((current) => current && current.pointerId === event.pointerId ? {
        ...current,
        x: event.clientX,
        y: event.clientY,
        moved: current.moved || Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > 6,
        handExited: current.kind === 'HAND_CARD' ? isDragPreviewOutsideHand(event.clientX, event.clientY, current.entityId) : current.handExited,
      } : current)
      setDropTarget(nextTarget)
    }
    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return
      const target = readDropTarget(elementAtPoint(event.clientX, event.clientY))
      const action = actionForDrop(drag, target, event.clientX, session.legalActions, session.view)
      const moved = drag.moved || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6
      const shouldActivate = moved && action !== null
      const isMulliganDrop = moved && drag.kind === 'HAND_CARD' && isZoneDropTarget(target, 'mulligan') && mulligan?.selectableEntityIds.includes(drag.entityId) === true
      suppressClickRef.current = moved
      setDrag(null)
      setDropTarget(null)
      if (isMulliganDrop) setMulliganIds((current) => current.includes(drag.entityId) ? current : [...current, drag.entityId])
      else if (shouldActivate && action) {
        setHoverInspection(null)
        setFocusInspection(null)
        void session.dispatchAction(action)
      }
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [drag, mulligan, session])

  async function dispatch(action: LegalActionDescriptor, selected = mulliganIds) {
    clearInspection()
    await session.dispatchAction(action, action.type === 'CONFIRM_MULLIGAN' ? selected : [])
    if (action.type === 'CONFIRM_MULLIGAN') setMulliganIds([])
  }

  function startDrag(payload: DragPayload, event: ReactPointerEvent<HTMLElement>): void {
    if (interactionLocked) return
    clearInspection()
    if (payload.kind === 'HAND_CARD' && !session.legalActions.some((action) => action.type === 'PLAY_CARD' && action.cardInstanceId === payload.entityId)) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const sourceRect = event.currentTarget.getBoundingClientRect()
    event.preventDefault()
    suppressClickRef.current = false
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setDrag({
      ...payload,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      sourceX: sourceRect.left + sourceRect.width / 2,
      sourceY: sourceRect.top + sourceRect.height / 2,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      handExited: false,
    })
    setDropTarget(readDropTarget(elementAtPoint(event.clientX, event.clientY)))
  }

  function activateFromKeyboard(payload: DragPayload): void {
    const action = actionForKeyboard(payload, session.legalActions)
    if (action) void dispatch(action)
  }

  function activateFromClick(payload: DragPayload): void {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    activateFromKeyboard(payload)
  }

  function toggleMulligan(id: number) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    setMulliganIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  function containDiscoverFocus(event: KeyboardEvent<HTMLDialogElement>): void {
    if (event.key !== 'Tab') return
    const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), [role="button"], [tabindex]:not([tabindex="-1"])')]
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusable[0]
    const last = focusable.at(-1)
    if (!first || !last) return
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const selfLabel = session.view.viewerId === 'PLAYER' ? '你' : '旅店老板（教程操作者）'
  const opponentLabel = session.view.viewerId === 'PLAYER' ? '旅店老板' : '你'
  const endTurn = normalActions.find((action) => action.type === 'END_TURN')
  function handPayload(entity: PublicEntityViewModel): DragPayload | null {
    const selectable = mulligan?.selectableEntityIds.includes(entity.id) === true
    const playable = session.legalActions.some((action) => action.type === 'PLAY_CARD' && action.cardInstanceId === entity.id)
    return selectable || playable ? { kind: 'HAND_CARD', entityId: entity.id } : null
  }

  function entityTargetClass(entityId: number): string {
    return isEntityDropTarget(dropTarget, entityId) && activeDropAction ? 'drop-target-active' : ''
  }

  function zoneTargetClass(zone: DropZone): string {
    const mulliganDrop = zone === 'mulligan' && drag?.kind === 'HAND_CARD' && mulligan?.selectableEntityIds.includes(drag.entityId) === true
    const boardZone = zone === 'self-board' || zone === 'opponent-board'
    const entityInZone = dropTarget?.type === 'entity' && (
      zone === 'self-board'
        ? session.view.self.board.some((entity) => entity.id === dropTarget.entityId)
        : zone === 'opponent-board'
          ? session.view.opponent.board.some((entity) => entity.id === dropTarget.entityId)
          : false
    )
    const zoneHovered = isZoneDropTarget(dropTarget, zone) || entityInZone
    return zoneHovered && (activeDropAction || (boardZone && drag?.kind === 'HAND_CARD') || mulliganDrop) ? 'drop-target-active' : ''
  }

  function boardEntityPayload(entity: PublicEntityViewModel): DragPayload | null {
    return session.legalActions.some((action) => action.type === 'ATTACK' && action.attackSourceId === entity.id)
      ? { kind: 'BOARD_ENTITY', entityId: entity.id }
      : null
  }

  const selfHeroCanAttack = session.legalActions.some((action) => action.type === 'ATTACK' && action.attackSourceId === session.view.self.hero.id)
  const selfHeroPowerCanActivate = session.legalActions.some((action) => action.type === 'USE_HERO_POWER')
  const dragPreviewStyle = drag ? {
    left: `${drag.x}px`,
    top: `${drag.y}px`,
  } : undefined
  const tutorial = session.tutorial
  const visibleEntities = [
    session.view.self.hero,
    session.view.self.heroPower,
    ...(session.view.self.weapon ? [session.view.self.weapon] : []),
    ...session.view.self.hand,
    ...session.view.self.board,
    session.view.opponent.hero,
    session.view.opponent.heroPower,
    ...(session.view.opponent.weapon ? [session.view.opponent.weapon] : []),
    ...session.view.opponent.board,
  ]
  const publicEntityForId = (entityId: number): PublicEntityViewModel | undefined => visibleEntities.find((entity) => entity.id === entityId)
  const currentInspectionSource = inspectedEntity
    ? (() => {
      const entity = publicEntityForId(inspectedEntity.entity.id) ?? (inspectedEntity.sourceKey.startsWith('choice:') ? inspectedEntity.entity : null)
      return entity ? { ...inspectedEntity, entity } : null
    })()
    : null
  const playActions = session.legalActions.filter((action): action is PlayCardAction => action.type === 'PLAY_CARD')
  const attackActions = session.legalActions.filter((action): action is Extract<LegalActionDescriptor, { type: 'ATTACK' }> => action.type === 'ATTACK')
  const activeAttackAction = activeDropAction?.type === 'ATTACK'
    && activeDropAction.attackTargetId !== activeDropAction.attackSourceId
    ? activeDropAction
    : null
  const projectedDeathEntityIds = new Set(activeAttackAction?.projectedDeathEntityIds ?? [])
  const cardDefinitionForAction = (action: PlayCardAction): string | undefined => publicEntityForId(action.cardInstanceId)?.definitionId
  const targetingSpell = drag?.kind === 'HAND_CARD'
    && drag.handExited
    && dragEntity !== undefined
    && getCardDefinition(dragEntity.definitionId).type === 'SPELL'
    && playActions.some((action) => action.cardInstanceId === drag.entityId && action.targetEntityId !== undefined)
  const targetingAttack = (drag?.kind === 'BOARD_ENTITY' || drag?.kind === 'HERO')
    && attackActions.some((action) => action.attackSourceId === drag.entityId)
  const targetingHeroPower = drag?.kind === 'HERO_POWER'
    && session.legalActions.some((action) => action.type === 'USE_HERO_POWER' && action.targetEntityId !== undefined)
  const arrowKind = targetingSpell ? 'spell' : targetingHeroPower ? 'hero-power' : targetingAttack ? 'attack' : null
  const arrowStart = drag && arrowKind ? { x: drag.sourceX, y: drag.sourceY } : null
  const arrowEnd = drag && arrowKind ? dropTargetPoint(dropTarget) ?? { x: drag.x, y: drag.y } : null
  const targetArrow = arrowKind && arrowStart && arrowEnd ? { kind: arrowKind, start: arrowStart, end: arrowEnd } : null
  const arrowViewport = typeof window === 'undefined' ? { width: 0, height: 0 } : { width: window.innerWidth, height: window.innerHeight }
  const tutorialHighlightFor = (entity: PublicEntityViewModel): TutorialHighlight | undefined => {
    if (!tutorial) return undefined
    if (tutorial.stepId === 'MANATHIRST') {
      const manathirstAction = playActions.find((action) => cardDefinitionForAction(action) === 'RLK_843' && action.targetEntityId === session.view.opponent.hero.id)
      if (manathirstAction?.cardInstanceId === entity.id) return { role: 'source' }
      return entity.id === session.view.opponent.hero.id && manathirstAction ? { role: 'target' } : undefined
    }
    if (tutorial.stepId === 'POISONOUS') {
      const poisonousAction = attackActions.find((action) => action.attackTargetId === session.view.opponent.board.find((target) => target.definitionId === 'CS2_119')?.id && publicEntityForId(action.attackSourceId)?.definitionId === 'DRG_066')
      if (poisonousAction?.attackSourceId === entity.id) return { role: 'source' }
      return poisonousAction?.attackTargetId === entity.id ? { role: 'target' } : undefined
    }
    if (tutorial.stepId === 'ELUSIVE') {
      const elusiveAction = playActions.find((action) => cardDefinitionForAction(action) === 'BT_233' && action.evidence?.excluded.some((entry) => entry.entityId === entity.id))
      if (elusiveAction) return { role: 'excluded' }
      return entity.definitionId === 'BT_233' && playActions.some((action) => action.cardInstanceId === entity.id && action.evidence?.excluded.some((entry) => entry.reason === 'ELUSIVE'))
        ? { role: 'source' }
        : undefined
    }
    if (tutorial.stepId === 'DISCOVER') {
      const discoverAction = playActions.find((action) => cardDefinitionForAction(action) === 'BAR_541' && action.targetEntityId === session.view.opponent.hero.id)
      if (!discoverOpen && discoverAction?.cardInstanceId === entity.id) return { role: 'source' }
      return !discoverOpen && entity.id === session.view.opponent.hero.id && discoverAction ? { role: 'target' } : undefined
    }
    const magneticAction = playActions.find((action) => action.playMode === 'MAGNETIC' && action.targetEntityId === session.view.self.board.find((target) => target.definitionId === 'BOT_309')?.id && cardDefinitionForAction(action) === 'BOT_563')
    if (magneticAction?.cardInstanceId === entity.id) return { role: 'source' }
    return magneticAction?.targetEntityId === entity.id ? { role: 'target' } : undefined
  }

  function handleSettleAnimationEnd(event: ReactAnimationEvent<HTMLSpanElement>): void {
    if (event.animationName !== 'settle-pulse' || event.target !== event.currentTarget) return
    if (session.lastEventKey !== event.currentTarget.getAttribute('data-event-key')) return
    setCompletedAnimationKey(session.lastEventKey)
  }

  return (
    <main className="game-shell" data-session-mode={session.mode}>
      <header className="game-toolbar">
        <button type="button" className="secondary" onClick={session.exitToMenu}>主菜单</button>
        <div className="turn-badge">回合 {session.view.turn} · {session.view.activePlayerId === session.view.viewerId ? `${selfLabel}行动` : `${opponentLabel}行动`}</div>
        <button type="button" className="secondary" onClick={session.exportLog} disabled={session.mode === 'tutorial'}>导出日志</button>
        <button type="button" className="secondary" onClick={() => { setSkipAnimations(true); setCompletedAnimationKey(session.lastEventKey) }}>跳过动画</button>
      </header>

      {tutorial ? (
        <section
          className="tutorial-coach"
          aria-labelledby="tutorial-title"
          data-tutorial-step={tutorial.stepId}
          data-tutorial-complete={tutorial.complete ? 'true' : 'false'}
        >
          <div className="coach-kicker"><span>新手引导</span><strong>第 {tutorial.stepNumber} / {tutorial.totalSteps} 步</strong></div>
          <h1 id="tutorial-title">{tutorial.title}</h1>
          <p>{tutorial.instruction}</p>
          <p className="coach-state">{tutorial.complete ? '动作完成，点击继续下一步。' : '跟随战场上的高亮区域完成当前动作。'}</p>
          <div className="coach-progress" aria-label="教程进度">
            {Array.from({ length: tutorial.totalSteps }, (_, index) => <span key={index} className={index + 1 === tutorial.stepNumber ? 'current' : index + 1 < tutorial.stepNumber ? 'complete' : ''} aria-label={`第 ${index + 1} 步`} />)}
          </div>
          <div className="coach-actions">
            <button type="button" onClick={() => void session.startShowcase()}>跳过教程并开始对局</button>
            <button type="button" className="secondary" onClick={session.skipTutorial}>跳过教程</button>
            <button type="button" className="secondary" onClick={session.resetTutorialStep}>重置本步</button>
            {tutorial.complete ? <button type="button" onClick={session.nextTutorialStep}>{tutorial.stepNumber === tutorial.totalSteps ? '完成教程' : '下一步'}</button> : null}
          </div>
        </section>
      ) : null}

      <section
        className="hearth-board"
        data-animation-state={animating ? 'running' : 'complete'}
        data-event-key={session.lastEventKey}
      >
        <div className="battlefield-decor" aria-hidden="true" />
        <div className="battlefield-layout">
          <section className="battle-lane opponent-lane" aria-label="对手区域">
            <div className="opponent-hand" aria-label={`对手手牌 ${session.view.opponent.hand.length} 张`} data-hand-count={session.view.opponent.hand.length}>
              {session.view.opponent.hand.map((card, index) => <div key={card.id} className="opponent-hand-card" data-hidden-card="true" style={fanStyle(index, session.view.opponent.hand.length)}><AssetImage src="/assets/card-back/in-a-dark-wood.png" alt="对手隐藏手牌" /></div>)}
              <ManaTray owner="opponent" mana={session.view.opponent.mana} />
            </div>
            <Hero
              entity={session.view.opponent.hero}
              heroPower={session.view.opponent.heroPower}
              weapon={session.view.opponent.weapon}
              label={opponentLabel}
              mana={session.view.opponent.mana}
              entityDropTargetClassName={entityTargetClass(session.view.opponent.hero.id)}
              inspection={inspectionFor(session.view.opponent.hero)}
              weaponInspection={session.view.opponent.weapon ? inspectionFor(session.view.opponent.weapon) : undefined}
              heroPowerInspection={inspectionFor(session.view.opponent.heroPower)}
              tutorialHighlight={tutorialHighlightFor(session.view.opponent.hero)}
            />
            <div className={`board-row opponent-board ${zoneTargetClass('opponent-board')}`} aria-label="对手战场" data-drop-target="zone:opponent-board">
              {session.view.opponent.board.length === 0 ? <span className="empty-zone">对手战场为空</span> : session.view.opponent.board.map((entity) => <Card key={entity.id} entity={entity} compact battlefield dropTargetId={entity.id} dropTargetClassName={entityTargetClass(entity.id)} projectedDeath={projectedDeathEntityIds.has(entity.id)} inspection={inspectionFor(entity)} tutorialHighlight={tutorialHighlightFor(entity)} />)}
            </div>
          </section>
          <div className="board-divider"><span>THE WITCHWOOD</span></div>
          <section className="battle-lane player-lane" aria-label="你的区域">
            <div className="player-side">
              <div className={`board-row player-board ${zoneTargetClass('self-board')}`} aria-label="你的战场" data-drop-target="zone:self-board">
                {session.view.self.board.length === 0 ? <span className="empty-zone">你的战场为空</span> : session.view.self.board.map((entity) => {
                  const attackable = attackActions.some((action) => action.attackSourceId === entity.id)
                  const payload = boardEntityPayload(entity)
                  return <Card key={entity.id} entity={entity} compact battlefield dropTargetId={entity.id} dropTargetClassName={entityTargetClass(entity.id)} attackable={attackable} projectedDeath={projectedDeathEntityIds.has(entity.id)} onPointerDown={payload ? (event) => startDrag(payload, event) : undefined} onActivate={payload ? () => activateFromKeyboard(payload) : undefined} inspection={inspectionFor(entity)} tutorialHighlight={tutorialHighlightFor(entity)} />
                })}
              </div>
              <Hero
                entity={session.view.self.hero}
                heroPower={session.view.self.heroPower}
                weapon={session.view.self.weapon}
                label={selfLabel}
                mana={session.view.self.mana}
                onEntityPointerDown={selfHeroCanAttack ? (event) => startDrag({ kind: 'HERO', entityId: session.view.self.hero.id }, event) : undefined}
                onEntityActivate={selfHeroCanAttack ? () => activateFromKeyboard({ kind: 'HERO', entityId: session.view.self.hero.id }) : undefined}
                onHeroPowerPointerDown={selfHeroPowerCanActivate ? (event) => startDrag({ kind: 'HERO_POWER', entityId: session.view.self.heroPower.id }, event) : undefined}
                onHeroPowerActivate={selfHeroPowerCanActivate ? () => activateFromClick({ kind: 'HERO_POWER', entityId: session.view.self.heroPower.id }) : undefined}
                heroPowerDisabled={!selfHeroPowerCanActivate || interactionLocked}
                entityDropTargetClassName={entityTargetClass(session.view.self.hero.id)}
                heroPowerDropTargetClassName={entityTargetClass(session.view.self.heroPower.id)}
                inspection={inspectionFor(session.view.self.hero)}
                weaponInspection={session.view.self.weapon ? inspectionFor(session.view.self.weapon) : undefined}
                heroPowerInspection={inspectionFor(session.view.self.heroPower)}
                tutorialHighlight={tutorialHighlightFor(session.view.self.hero)}
                heroPowerTutorialHighlight={tutorialHighlightFor(session.view.self.heroPower)}
              />
              <div
                className={`player-hand ${zoneTargetClass('mulligan')}`}
                aria-label="你的手牌"
                data-drop-target="zone:mulligan"
                data-available-mana={session.view.self.mana.current + session.view.self.mana.temporary}
                data-hand-count={session.view.self.hand.length}
              >
                {session.view.self.hand.map((entity, index) => {
                  const hiddenWhileDragging = drag?.kind === 'HAND_CARD' && drag.entityId === entity.id && drag.handExited
                  const selectable = mulligan?.selectableEntityIds.includes(entity.id) === true
                  const playable = playActions.some((action) => action.cardInstanceId === entity.id)
                  const effectReady = cardEffectIsReady(entity, playable)
                  const payload = handPayload(entity)
                  return <Card
                    key={entity.id}
                    entity={entity}
                    style={hiddenWhileDragging ? { ...fanStyle(index, session.view.self.hand.length), visibility: 'hidden' } : fanStyle(index, session.view.self.hand.length)}
                    selected={mulliganIds.includes(entity.id)}
                    onPointerDown={payload ? (event) => startDrag(payload, event) : undefined}
                    onActivate={payload ? () => activateFromKeyboard(payload) : undefined}
                    inspection={inspectionFor(entity)}
                    tutorialHighlight={tutorialHighlightFor(entity)}
                    playable={playable}
                    effectReady={effectReady}
                    {...(selectable ? { onToggle: () => toggleMulligan(entity.id) } : {})}
                  />
                })}
                <ManaTray owner="self" mana={session.view.self.mana} />
              </div>
            </div>
          </section>
          <aside className="action-panel scene-control" aria-label="回合控制">
            <section className="deck-panel scene-deck-panel" aria-label="牌库">
              <h2>牌库</h2>
              <div className="deck-tracker-list">
                <DeckTracker owner="opponent" label={opponentLabel} handCount={session.view.opponent.hand.length} deckCount={session.view.opponent.deckCount} />
                <div className="scene-turn-control">
                  {mulligan ? <button type="button" disabled={interactionLocked} onClick={() => void dispatch(mulligan)}>确认换牌（{mulliganIds.length}）</button> : endTurn ? <button type="button" className="secondary" disabled={interactionLocked} onClick={() => void dispatch(endTurn)}>结束回合</button> : null}
                </div>
                <DeckTracker owner="self" label={selfLabel} handCount={session.view.self.hand.length} deckCount={session.view.self.deckCount} />
              </div>
            </section>
          </aside>
        </div>
        <span
          className={`settle-animation-marker ${animating ? 'is-running' : ''}`}
          data-settle-animation-marker="true"
          data-animation-state={animating ? 'running' : 'complete'}
          data-event-key={session.lastEventKey}
          aria-hidden="true"
          onAnimationEnd={handleSettleAnimationEnd}
        />
      </section>

      {discoverOpen ? <dialog
        ref={assignDiscoverDialogRef}
        className="discover-overlay"
        aria-labelledby="discover-dialog-title"
        aria-modal="true"
        data-dialog-state={discoverOpen ? 'open' : 'closing'}
        data-drop-target="zone:discover"
        onCancel={(event) => event.preventDefault()}
        onClose={handleDiscoverClose}
        onKeyDown={containDiscoverFocus}
      >
        <h2 id="discover-dialog-title">发现选项</h2>
        <div className={`discover-slot ${zoneTargetClass('discover')}`} {...tutorialAttributes(tutorial?.stepId === 'DISCOVER' && discoverOpen ? { role: 'target' } : undefined)}>把卡牌拖到这里确认发现</div>
        <div className="discover-choices">
          {discoverDecisionId !== undefined ? discoverChoiceIds.map((choiceId, index) => {
            const entity = choiceEntity(choiceId, index)
            const payload: DragPayload = { kind: 'DISCOVER_CHOICE', decisionId: discoverDecisionId, choiceDefinitionId: choiceId }
            return <Card key={choiceId} entity={entity} inspection={inspectionFor(entity, `choice:${discoverDecisionId}:${choiceId}`)} tutorialHighlight={tutorial?.stepId === 'DISCOVER' ? { role: 'choice' } : undefined} onPointerDown={(event) => startDrag(payload, event)} onActivate={() => activateFromKeyboard(payload)} dropTargetClassName={zoneTargetClass('discover')} />
          }) : null}
        </div>
        {currentInspectionSource ? <InspectionLayer source={currentInspectionSource} /> : null}
      </dialog> : null}

      {settingsOpen ? <dialog
        ref={settingsDialogRef}
        className="settings-overlay"
        aria-labelledby="settings-dialog-title"
        aria-modal="true"
        data-settings-dialog="true"
        onCancel={(event) => { event.preventDefault(); setSettingsOpen(false) }}
        onClose={() => setSettingsOpen(false)}
      >
        <h2 id="settings-dialog-title">设置</h2>
        <p>设置页面暂时保留空壳，后续将加入游戏选项。</p>
        <div className="settings-actions">
          {concede && session.mode === 'showcase' ? <button type="button" className="danger" disabled={interactionLocked} onClick={() => { setSettingsOpen(false); void dispatch(concede) }}>认输</button> : null}
          <button type="button" className="secondary" onClick={() => setSettingsOpen(false)}>关闭</button>
        </div>
      </dialog> : null}

      {!discoverOpen && currentInspectionSource ? <InspectionLayer source={currentInspectionSource} /> : null}

      {targetArrow ? (
        <svg
          className="target-arrow-layer"
          aria-hidden="true"
          data-target-arrow
          data-arrow-kind={targetArrow.kind}
          data-arrow-source-entity-id={drag?.kind === 'DISCOVER_CHOICE' ? undefined : drag?.entityId}
          data-arrow-target-entity-id={dropTarget?.type === 'entity' ? dropTarget.entityId : undefined}
          data-arrow-target-x={targetArrow.end.x}
          data-arrow-target-y={targetArrow.end.y}
          data-arrow-valid={activeDropAction ? 'true' : 'false'}
          viewBox={`0 0 ${arrowViewport.width} ${arrowViewport.height}`}
          preserveAspectRatio="none"
        >
          <defs>
            <marker id="target-arrow-head" markerWidth="13" markerHeight="13" refX="10" refY="6.5" orient="auto" markerUnits="strokeWidth">
              <path className={`target-arrow-head target-arrow-head--${targetArrow.kind}`} d="M 0 0 L 13 6.5 L 0 13 Z" />
            </marker>
          </defs>
          <path
            className={`target-arrow target-arrow--${targetArrow.kind} ${activeDropAction ? 'is-valid' : ''}`}
            d={curvedArrowPath(targetArrow.start, targetArrow.end)}
            markerEnd="url(#target-arrow-head)"
          />
        </svg>
      ) : null}

      {drag && dragEntity && !arrowKind ? <div className={`drag-preview ${activeDropAction ? 'is-valid' : ''}`} style={dragPreviewStyle} aria-live="polite" data-drag-preview data-hand-exited={drag.kind === 'HAND_CARD' ? String(drag.handExited) : undefined}>
        <Card entity={dragEntity} />
        <span>{activeDropAction ? '松开以确认' : '拖到目标区域'}</span>
      </div> : null}

      <aside className="game-status" aria-label="战场状态">
        <section className="coverage-panel" aria-label="展示战关键词进度">
          {Object.entries(session.view.scenario.coverage).map(([keyword, sequence]) => <span key={keyword} className={sequence === null ? '' : 'complete'}>{sequence === null ? '○' : '✓'} {KEYWORD_LABELS[keyword] ?? keyword}</span>)}
        </section>
        <section className="event-feed" aria-live="polite">
          <strong>最近结算</strong>
          <span>{recentEvents.length > 0 ? recentEvents.map((type) => EVENT_LABELS[type]).join(' → ') : '等待第一条领域事件'}</span>
        </section>
        <p className="status-message" role="status">{session.busy ? '正在结算并持久化…' : session.error ?? (session.view.phase === 'GAME_OVER' ? `${session.view.winnerId === 'PLAYER' ? '胜利' : '失败'} · ${session.view.endReason}` : '命令已就绪')}</p>
        {session.mode === 'showcase' && session.view.phase === 'GAME_OVER' ? <button type="button" className="restart-button" onClick={() => void session.restartShowcase()}>重新开始展示战</button> : null}
      </aside>
    </main>
  )
}
