import type { SessionController } from '@/app/session/SessionController'

type DebugSnapshot = ReturnType<SessionController['getDebugSnapshot']>

export function DebugPanel({ snapshot }: { snapshot: DebugSnapshot }) {
  return (
    <details className="debug-panel">
      <summary>开发调试面板</summary>
      <p>随机种子：{snapshot.state?.game.rng.seed ?? '无活动对局'}</p>
      <p>批次：{snapshot.lastBatch?.sequence ?? 0} · 事件：{snapshot.log?.totalEventCount ?? 0}</p>
      <pre>{JSON.stringify(snapshot, null, 2)}</pre>
    </details>
  )
}
