import { useRef } from 'react'

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
  onShowcase: () => void
  onResume: () => void
  onTutorial: () => void
  onImport: (file: File) => void
  onExport: () => void
  onDownloadRawStorage: () => void
}

export function MainMenu({ notice, hasActive, canResume, canExport, tutorialCompleted, completedLogs, storageError, onShowcase, onResume, onTutorial, onImport, onExport, onDownloadRawStorage }: MainMenuProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  return (
    <section className="menu-panel" aria-labelledby="menu-title">
      <p className="eyebrow">单人浏览器纵向切片</p>
      <h1 id="menu-title">炉石传说：旅店展示战</h1>
      <p className="menu-copy">使用固定法师卡组挑战旅店老板，在一局对战中完成法力渴求、剧毒、扰魔、发现与磁力。</p>
      <div className="menu-actions">
        <button type="button" onClick={onShowcase} disabled={hasActive || storageError !== null}>{hasActive ? '已有进行中对局' : '开始展示战'}</button>
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
