import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PublicEntityViewModel } from '@/engine/projection'
import { CardPreview } from '@/ui/card/CardPreview'
import { CardFrame } from '@/ui/card/CardFrame'

describe('CardPreview', () => {
  it('composes a raster frame with original art and live values', () => {
    render(<CardPreview />)

    const card = screen.getByRole('article', { name: '剃刀猎手，费用 3，攻击 2，生命 3/3，效果 战吼：召唤一个1/1的野猪。' })
    expect(card).toHaveAttribute('data-card-preview', 'CS2_196')
    expect(card.querySelector('.card-frame')).toHaveAttribute('data-card-frame-source', 'official-card-image')
    expect(card.querySelector('.card-frame-original')).toHaveAttribute('src', '/assets/cards/CS2_196.png')
    expect(card.querySelector('.card-frame-original')).toHaveAttribute('alt', '剃刀猎手官方原卡图与实时数值')
    expect(card).toHaveAttribute('data-card-effect-source', 'official-card-image')
    expect(card.querySelector('.card-frame')).toHaveAttribute('data-card-fixed-content-source', 'official-card-image')
    expect(card.querySelector('.card-frame')).toHaveAttribute('data-card-fixed-content-text', '战吼：召唤一个1/1的野猪。')
    expect(card.querySelector('.layered-card-body')).toBeNull()
    expect(card.querySelector('.card-frame-description')).toBeNull()
    expect(card.querySelector('.card-frame-name')).toBeNull()
    expect([...card.querySelectorAll<HTMLImageElement>('.card-frame-dynamic-asset')].every((node) => node.src.includes('/assets/card-frames/materials/'))).toBe(true)
    expect(card.querySelector('.card-frame-stat-asset--attack')).toHaveAttribute('src', '/assets/card-frames/materials/common/attack.png')
    expect(card.querySelector('.card-frame-stat-asset--value')).toHaveAttribute('src', '/assets/card-frames/materials/common/vitality.png')
  })

  it('marks a partially damaged card as damaged even after a health buff', () => {
    const entity: PublicEntityViewModel = {
      id: 901,
      definitionId: 'CS2_196',
      cost: 3,
      name: '剃刀猎手',
      assetPath: '/assets/cards/CS2_196.png',
      attack: 2,
      health: 4,
      maxHealth: 5,
      armor: 0,
      durability: 0,
      exhausted: false,
      keywords: [],
      controllerId: 'PLAYER',
    }

    render(<CardFrame entity={entity} imagePath="/assets/cards/CS2_196.png" />)

    expect(screen.getByLabelText('生命 4/5')).toHaveClass('card-frame-stat--damaged')
  })

  it('shows each official card layer independently for visual diagnosis', () => {
    render(<CardPreview />)

    const debug = screen.getByRole('region', { name: '随从牌逐层诊断' })
    const layers = within(debug).getAllByRole('article')
    expect(layers).toHaveLength(8)
    const labels = {
      original: '官方底图',
      'cost-asset': '费用遮罩',
      'cost-number': '费用数字',
      'attack-asset': '攻击遮罩',
      'attack-number': '攻击数字',
      'value-asset': '生命遮罩',
      'value-number': '生命数字',
      composite: '最终合成',
    } as const
    for (const [key, label] of Object.entries(labels)) {
      const layer = within(debug).getByRole('article', { name: label })
      expect(layer).toHaveAttribute('data-card-layer', key)
      expect(layer.querySelector('.card-frame')).toHaveAttribute('data-card-frame-layer', key)
    }

    const weaponDebug = screen.getByRole('region', { name: '武器牌逐层诊断' })
    expect(within(weaponDebug).getAllByRole('article')).toHaveLength(8)
    const weaponValueLayer = within(weaponDebug).getByRole('article', { name: '耐久遮罩' })
    expect(weaponValueLayer).toHaveAttribute('data-card-layer', 'value-asset')
    expect(weaponValueLayer.querySelector('.card-frame')).toHaveAttribute('data-card-frame-type', 'WEAPON')
    expect(weaponValueLayer.querySelector('.card-frame')).toHaveAttribute('data-card-frame-base', '/assets/cards/CS2_082.png')
  })

  it('shows several raster-frame samples across card types', () => {
    render(<CardPreview />)

    const samples = screen.getAllByRole('article').filter((card) => card.hasAttribute('data-card-sample'))
    expect(samples).toHaveLength(4)
    expect(screen.getByRole('article', { name: '奥术箭，法术' })).toHaveAttribute('data-card-sample', 'RLK_843')
    expect(screen.getByRole('article', { name: '奥术箭，法术' }).querySelector('.card-frame')).toHaveAttribute('data-card-frame-type', 'SPELL')
    const spell = screen.getByRole('article', { name: '奥术箭，法术' })
    expect(spell.querySelector('.card-frame-original')).toHaveAttribute('src', '/assets/cards/RLK_843.png')
    expect(spell.querySelector('.card-frame')).toHaveAttribute('data-card-fixed-content-text', '造成2点伤害。法力渴求（8）：改为造成3点伤害。')
    expect(spell.querySelector('.card-frame-description')).toBeNull()
    expect(screen.getByRole('article', { name: '邪恶短刀，武器' })).toHaveAttribute('data-card-type', 'WEAPON')
    expect(screen.getByRole('article', { name: '邪恶短刀，武器' }).querySelector('.card-frame')).toHaveAttribute('data-card-frame-source', 'official-card-image')
    const weapon = screen.getByRole('article', { name: '邪恶短刀，武器' })
    expect(weapon.querySelector('.card-frame-cost-asset')).toHaveAttribute('src', '/assets/card-frames/materials/cost/cost-crystal.png')
    expect(weapon.querySelector('.card-frame-cost-asset')).toHaveStyle({
      top: '9.922680412371134%',
      left: '7.6171875%',
      width: '19.921875%',
      height: '13.530927835051546%',
    })
    expect(weapon.querySelector('.card-frame-stat-cover--attack')).toHaveAttribute('src', '/assets/card-frames/materials/weapon/weapon-attack-cover.png')
    expect(weapon.querySelector('.card-frame-stat-asset--attack')).toHaveAttribute('src', '/assets/card-frames/materials/weapon/weapon-attack.png')
    expect(weapon.querySelector('.card-frame-stat-cover--value')).toHaveAttribute('src', '/assets/card-frames/materials/weapon/weapon-durability-cover.png')
    expect(weapon.querySelector('.card-frame-stat-asset--value')).toHaveAttribute('src', '/assets/card-frames/materials/weapon/weapon-durability.png')
    expect(screen.getByRole('article', { name: '吉安娜·普罗德摩尔，英雄' }).querySelector('.card-frame')).toHaveAttribute('data-card-frame-type', 'HERO')
    expect(screen.getByRole('article', { name: '吉安娜·普罗德摩尔，英雄' }).querySelector('.card-frame-original')).toHaveAttribute('src', '/assets/heroes/HERO_08.png')
    expect(screen.getByRole('article', { name: '吉安娜·普罗德摩尔，英雄' }).querySelector('.card-frame-stat-asset--value')).toHaveAttribute('src', '/assets/card-frames/materials/common/armor.png')
  })

  it('updates runtime values through a real attack and syncs all card views', async () => {
    const user = userEvent.setup()
    render(<CardPreview />)

    const card = screen.getByRole('article', { name: '剃刀猎手，费用 3，攻击 2，生命 3/3，效果 战吼：召唤一个1/1的野猪。' })
    expect(card).toHaveAttribute('data-runtime-card-state', '2/3')
    for (const mode of ['hand', 'board', 'inspection']) {
      expect(document.querySelector(`[data-runtime-card-view="${mode}"] [data-card-value-current="3"]`)).not.toBeNull()
    }

    await user.click(screen.getByRole('button', { name: '让1/1随从攻击剃刀猎手' }))

    const damagedCard = screen.getByRole('article', { name: '剃刀猎手，费用 3，攻击 2，生命 2/3，效果 战吼：召唤一个1/1的野猪。' })
    expect(damagedCard).toHaveAttribute('data-card-attack-current', '2')
    expect(damagedCard).toHaveAttribute('data-card-value-current', '2')
    expect(damagedCard.querySelector('.card-frame-value')).toHaveTextContent('2')
    for (const mode of ['hand', 'board', 'inspection']) {
      expect(document.querySelector(`[data-runtime-card-view="${mode}"] [data-card-value-current="2"]`)).not.toBeNull()
    }
    expect(screen.getByRole('button', { name: '让1/1随从攻击剃刀猎手' })).toBeDisabled()
  })
})
