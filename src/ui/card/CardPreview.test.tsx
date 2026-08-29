import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardPreview } from '@/ui/card/CardPreview'

describe('CardPreview', () => {
  it('keeps the original card art and effect text while layering dynamic values', () => {
    render(<CardPreview />)

    const card = screen.getByRole('article', { name: '剃刀猎手，费用 3，攻击 2，生命 3/3，效果 战吼：召唤一个1/1的野猪。' })
    expect(card).toHaveAttribute('data-card-preview', 'CS2_196')
    expect(card.querySelector('.layered-card-art-source')).toHaveAttribute('src', '/assets/cards/CS2_196.png')
    expect(card.querySelector('.layered-card-art-source')).toHaveAttribute('alt', '剃刀猎手原画、卡框与原始效果文字')
    expect(card).toHaveAttribute('data-card-effect-source', 'original-art')
    expect(card.querySelector('.layered-card-body')).toBeNull()
    expect(screen.getByText('本地官方卡图（原始效果保留）')).toBeInTheDocument()
  })

  it('updates the mana, attack, and health layers independently', async () => {
    const user = userEvent.setup()
    render(<CardPreview />)

    await user.click(screen.getByRole('button', { name: '费用+1' }))
    await user.click(screen.getByRole('button', { name: '攻击+1' }))
    await user.click(screen.getByRole('button', { name: '生命-1' }))

    const card = screen.getByRole('article', { name: '剃刀猎手，费用 4，攻击 3，生命 2/3，效果 战吼：召唤一个1/1的野猪。' })
    expect(card).toHaveAttribute('data-card-cost-current', '4')
    expect(card).toHaveAttribute('data-card-attack-current', '3')
    expect(card).toHaveAttribute('data-card-value-current', '2')
    expect(card.querySelector('.layered-card-cost')).toHaveTextContent('4')
    expect(card.querySelector('.layered-card-attack')).toHaveTextContent('3')
    expect(card.querySelector('.layered-card-health')).toHaveTextContent('2')
  })
})
