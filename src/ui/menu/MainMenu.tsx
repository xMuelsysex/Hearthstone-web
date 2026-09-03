import { getCardDefinition } from '@/cards/registry'
import type { ShowcaseDeckDefinitionV1 } from '@/cards/decks'
import type { ShowcasePlayerClass } from '@/scenarios/showcase'
import { useRef } from 'react'

const CLASS_LABELS: Record<ShowcasePlayerClass, string> = {
  DEATHKNIGHT: '死亡骑士',
  DEMONHUNTER: '恶魔猎手',
  DRUID: '德鲁伊',
  HUNTER: '猎人',
  MAGE: '法师',
  PALADIN: '圣骑士',
  PRIEST: '牧师',
  ROGUE: '潜行者',
  SHAMAN: '萨满祭司',
  WARLOCK: '术士',
  WARRIOR: '战士',
}

export type CompletedLogSummary = {
  gameId: string
  completedAt: string
  result: 'PLAYER_WIN' | 'PLAYER_LOSS'
  totalEventCount: number
  rulesVersion: string
}

type MainMenuProps = {
  notice: string
  hasActive: boolean
  canResume: boolean
  canExport: boolean
  tutorialCompleted: boolean
  completedLogs: CompletedLogSummary[]
  storageError: string | null
  showcaseDecks: readonly ShowcaseDeckDefinitionV1[]
  selectedShowcaseClass: ShowcasePlayerClass
  onSelectShowcaseClass: (ownerClass: ShowcasePlayerClass) => void
  onShowcase: () => void
  onResume: () => void
  onTutorial: () => void
  onImport: (file: File) => void
  onExport: () => void
  onDownloadRawStorage: () => void
}

export function MainMenu({ notice, hasActive, canResume, canExport, tutorialCompleted, completedLogs, storageError, showcaseDecks, selectedShowcaseClass, onSelectShowcaseClass, onShowcase, onResume, onTutorial, onImport, onExport, onDownloadRawStorage }: MainMenuProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  return (
    <section className="menu-panel" aria-labelledby="menu-title">
      <p className="eyebrow">单人浏览器纵向切片</p>
      <h1 id="menu-title">炉石传说：旅店展示战</h1>
      <p className="menu-copy">选择一位英雄，用对应职业牌组挑战旅店老板；现有战场交互、动画与日志规则对所有职业保持一致，职业差异按官方英雄技能与代表卡牌呈现。</p>
      <section className="class-picker" aria-labelledby="class-picker-title">
        <div className="class-picker-heading">
          <h2 id="class-picker-title">选择英雄</h2>
          <span>{CLASS_LABELS[selectedShowcaseClass]}</span>
        </div>
        <div className="class-grid" role="radiogroup" aria-label="展示战英雄">
          {showcaseDecks.map((deck) => {
            const hero = getCardDefinition(deck.heroId)
            const heroPower = getCardDefinition(deck.heroPowerId)
            const selected = deck.ownerClass === selectedShowcaseClass
            return (
              <button
                key={deck.id}
                type="button"
                className={`class-option ${selected ? 'is-selected' : ''}`}
                role="radio"
                aria-checked={selected}
                aria-label={`选择${CLASS_LABELS[deck.ownerClass]}英雄：${hero.name}`}
                data-showcase-class={deck.ownerClass}
                data-selected={selected}
                disabled={hasActive || storageError !== null}
                onClick={() => onSelectShowcaseClass(deck.ownerClass)}
              >
                <span className="class-option-portrait"><img src={`/assets/heroes/${hero.id}.png`} alt="" /></span>
                <span className="class-option-copy">
                  <strong>{hero.name}</strong>
                  <small>{CLASS_LABELS[deck.ownerClass]} · {heroPower.name}（{heroPower.cost}费）</small>
                  <span className="class-option-power">{heroPower.text.replaceAll(/<[^>]+>/g, '').replaceAll(/\s+/g, ' ')}</span>
                  <span className="class-signatures" aria-label="职业代表卡牌">{deck.signatureCardIds.map((cardId) => <span className="class-signature" key={cardId}><img src={`/assets/cards/${cardId}.png`} alt="" /><span>{getCardDefinition(cardId).name}</span></span>)}</span>
                </span>
              </button>
            )
          })}
        </div>
      </section>
      <div className="menu-actions">
        <button type="button" onClick={onShowcase} disabled={hasActive || storageError !== null}>{hasActive ? '已有进行中对局' : '开始对局'}</button>
        {canResume ? <button type="button" className="secondary" onClick={onResume}>继续对局</button> : null}
        <button type="button" className="secondary" disabled={storageError !== null} onClick={onTutorial}>{tutorialCompleted ? '重新教程' : '开始五步教程'}</button>
      </div>
      <div className="menu-utility-actions">
        <button type="button" className="secondary" disabled={storageError !== null} onClick={() => fileInput.current?.click()}>导入 JSON 日志</button>
        <button type="button" className="secondary" disabled={!canExport} onClick={onExport}>导出当前日志</button>
        {storageError !== null ? <button type="button" className="danger" onClick={onDownloadRawStorage}>下载损坏存储原文</button> : null}
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          aria-label="选择日志 JSON 文件"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            if (file) onImport(file)
            event.currentTarget.value = ''
          }}
        />
      </div>
      {completedLogs.length > 0 ? (
        <section className="log-summary" aria-labelledby="recent-logs-title">
          <h2 id="recent-logs-title">最近完成对局</h2>
          <ul>{completedLogs.map((log) => <li key={log.gameId}><strong>{log.result === 'PLAYER_WIN' ? '胜利' : '失败'}</strong><span>{new Date(log.completedAt).toLocaleString('zh-CN')}</span><span>{log.totalEventCount} 个事件 · {log.rulesVersion}</span></li>)}</ul>
        </section>
      ) : null}
      <p className="status-message" role="status">{notice}</p>
    </section>
  )
}
