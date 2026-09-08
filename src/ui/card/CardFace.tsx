import type { PublicEntityViewModel } from '@/engine/projection'
import { AssetImage } from '@/ui/AssetImage'
import { artAssetPath, cardRuntimeValues } from '@/ui/card/cardRuntime'
import { CardFrame, type CardFrameLayer } from '@/ui/card/CardFrame'

type CardFaceProps = {
  entity: PublicEntityViewModel
  imageAlt?: string
  artClassName?: string
  battlefield?: boolean
  cardFrame?: boolean
  frameImagePath?: string
  cardLayer?: CardFrameLayer
}

export function CardFace({ entity, imageAlt, artClassName, battlefield = false, cardFrame = false, frameImagePath, cardLayer }: CardFaceProps) {
  const values = cardRuntimeValues(entity)
  if (cardFrame) return <CardFrame entity={entity} imagePath={frameImagePath ?? entity.assetPath} {...(imageAlt === undefined ? {} : { imageAlt })} {...(cardLayer === undefined ? {} : { layer: cardLayer })} />
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
      {battlefield ? <span className="battlefield-art-window"><AssetImage src={artAssetPath(entity)} fallbackSrc={entity.assetPath} alt={imageAlt ?? `${entity.name}原画`} className="battlefield-card-art" /></span> : <AssetImage src={entity.assetPath} alt={imageAlt ?? `${entity.name}卡图`} className={artClassName ?? ''} />}
      {!battlefield && values.definition.type !== 'HERO' ? <span className="card-cost layered-card-cost" aria-label={`费用 ${values.cost}`} data-card-cost-current={values.cost}>{values.cost}</span> : null}
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
