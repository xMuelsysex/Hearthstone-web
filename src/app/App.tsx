import { useEffect, useState, type ComponentType } from 'react'
import { PlayerSessionProvider } from '@/app/context/PlayerSessionContext'
import type { BattleAnimation, PlayerSessionValue } from '@/app/context/playerSession'
import { SessionController, type SessionSnapshot } from '@/app/session/SessionController'
import { chooseTavernKeeperAction, type AiObservationV1 } from '@/ai/tavernKeeper'
import type { LegalActionDescriptor } from '@/engine/commands'
import type { RecordedEventV1 } from '@/engine/events'
import { projectLegalActions, projectPlayerView } from '@/engine/projection'
import { createShowcaseState, type ShowcasePlayerClass } from '@/scenarios/showcase'
import { SHOWCASE_DECKS_V1 } from '@/cards/decks'
import { applyTutorialAction, getTutorialActions, startTutorialStep, TUTORIAL_STEPS, type TutorialStepSession } from '@/scenarios/tutorial'
import { BrowserStorageAdapter } from '@/storage/browserStorage'
import { GameRepository, MemoryStorageAdapter } from '@/storage/repository'
import { STORAGE_KEY } from '@/storage/schema'
import { CardPreview } from '@/ui/card/CardPreview'
import { GameBoard } from '@/ui/game/GameBoard'
import { MainMenu, type CompletedLogSummary } from '@/ui/menu/MainMenu'

type BrowserHost = {
  controller: SessionController
  storageError: string | null
  rawStorage: string | null
}

type DebugPanelProps = {
  snapshot: ReturnType<SessionController['getDebugSnapshot']>
}

function createBrowserHost(): BrowserHost {
  const adapter = new BrowserStorageAdapter()
  const rawStorage = adapter.getItem(STORAGE_KEY)
  try {
    return {
      controller: new SessionController(new GameRepository(adapter)),
      storageError: null,
      rawStorage,
    }
  } catch (error) {
    return {
      controller: new SessionController(new GameRepository(new MemoryStorageAdapter())),
      storageError: error instanceof Error ? error.message : 'INVALID_STORAGE_ROOT',
      rawStorage,
    }
  }
}

function downloadJson(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function batchEventTypes(snapshot: SessionSnapshot | null): string[] {
  return snapshot?.lastBatch?.events.map((recorded) => recorded.event.payload.type) ?? []
}

type AnimationRecord = {
  sequence: number
  event: RecordedEventV1
}

function animationsFromEvents(events: readonly AnimationRecord[]): BattleAnimation[] {
  return events.flatMap(({ sequence, event: recorded }): BattleAnimation[] => {
    if (recorded.scope !== 'GAME') return []
    const payload = recorded.payload
    if (payload.type === 'CARD_DRAWN') {
      return [{ type: 'DRAW', actorId: payload.actorId, sequence, burned: payload.burned }]
    }
    if (payload.type === 'MULLIGAN_CONFIRMED') {
      return payload.drawnEntityIds.map(() => ({ type: 'DRAW' as const, actorId: payload.actorId, sequence, burned: false }))
    }
    if (payload.type === 'ATTACK_DECLARED') {
      return [{ type: 'ATTACK', actorId: payload.actorId, sequence, sourceEntityId: payload.sourceEntityId, targetEntityId: payload.targetEntityId }]
    }
    return []
  })
}

function batchAnimations(snapshot: SessionSnapshot | null): BattleAnimation[] {
  return animationsFromEvents(snapshot?.lastBatch?.events ?? [])
}

export function App() {
  const cardPreview = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('card-preview')
  const [host] = useState(createBrowserHost)
  const { controller, storageError, rawStorage } = host
  const firstLaunchTutorial = storageError === null && controller.getActiveLog() === null && !controller.getRoot().tutorialCompleted
  const [screen, setScreen] = useState<'menu' | 'session'>(firstLaunchTutorial ? 'session' : 'menu')
  const [mode, setMode] = useState<'showcase' | 'tutorial'>(firstLaunchTutorial ? 'tutorial' : 'showcase')
  const [showcaseClass, setShowcaseClass] = useState<ShowcasePlayerClass>('MAGE')
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(() => controller.snapshot())
  const [tutorialSession, setTutorialSession] = useState<TutorialStepSession | null>(() => firstLaunchTutorial ? startTutorialStep(TUTORIAL_STEPS[0]!.id) : null)
  const [tutorialIndex, setTutorialIndex] = useState(0)
  const [notice, setNotice] = useState(storageError ? `本地存储损坏：${storageError}` : firstLaunchTutorial ? '首次启动：完成或跳过五步教程后进入主菜单。' : '冻结卡牌、棋盘与权威日志已就绪。')
  const [DebugPanel, setDebugPanel] = useState<ComponentType<DebugPanelProps> | null>(null)

  useEffect(() => controller.subscribe(() => setSnapshot(controller.snapshot())), [controller])

  useEffect(() => {
    if (storageError) return
    let active = true
    void controller.restore()
      .then((restored) => {
        if (!active || !restored) return
        setSnapshot(controller.snapshot())
        setNotice('检测到进行中的展示战，可以继续对局。')
      })
      .catch((error: unknown) => {
        if (active) setNotice(`恢复日志失败：${error instanceof Error ? error.message : 'UNKNOWN_ERROR'}`)
      })
    return () => { active = false }
  }, [controller, storageError])

  useEffect(() => {
    if (!import.meta.env.DEV || !new URLSearchParams(window.location.search).has('debug')) return
    let active = true
    void import('@/dev/DebugPanel').then((module) => {
      if (active) setDebugPanel(() => module.DebugPanel)
    })
    return () => { active = false }
  }, [])

  async function startShowcase(): Promise<void> {
    const initialState = createShowcaseState(showcaseClass)
    const starting = controller.start(initialState)
    setMode('showcase')
    setTutorialSession(null)
    setSnapshot({
      view: projectPlayerView(initialState, 'PLAYER'),
      legalActions: projectLegalActions(initialState, 'PLAYER'),
      lastBatch: null,
      busy: true,
      error: null,
    })
    setScreen('session')
    try {
      await starting
      setSnapshot(controller.snapshot())
      setNotice('展示战已开始。')
    } catch (error) {
      setMode('showcase')
      setSnapshot(controller.snapshot())
      setScreen('menu')
      setNotice(`展示战启动失败：${error instanceof Error ? error.message : 'UNKNOWN_ERROR'}`)
    }
  }

  async function startShowcaseFromTutorial(): Promise<void> {
    try {
      await controller.markTutorialCompleted()
    } catch (error) {
      setNotice(`教程状态保存失败：${error instanceof Error ? error.message : 'UNKNOWN_ERROR'}`)
      return
    }
    await startShowcase()
  }

  function startTutorial(index = 0): void {
    if (storageError) return
    const step = TUTORIAL_STEPS[index]
    if (!step) throw new Error(`TUTORIAL_STEP_MISSING:${index}`)
    setTutorialIndex(index)
    setTutorialSession(startTutorialStep(step.id))
    setMode('tutorial')
    setScreen('session')
    setNotice('教程已开始。')
  }

  async function advanceTavernKeeper(): Promise<void> {
    for (let index = 0; index < 12; index += 1) {
      const opponent = controller.snapshotForActor('OPPONENT')
      if (!opponent || opponent.view.phase === 'GAME_OVER') return
      const forcedDecision = opponent.legalActions.some((action) => action.type === 'CONFIRM_MULLIGAN' || action.type === 'SELECT_DISCOVER')
      if (!forcedDecision && opponent.view.activePlayerId !== 'OPPONENT') return
      const observation: AiObservationV1 = {
        view: opponent.view,
        legalActions: opponent.legalActions,
        scenario: {
          stage: opponent.view.scenario.stage,
          coverage: structuredClone(opponent.view.scenario.coverage),
        },
      }
      const action = chooseTavernKeeperAction(observation)
      if (!action) throw new Error('TAVERN_KEEPER_HAS_NO_ACTION')
      await controller.dispatchAction(action)
    }
    throw new Error('TAVERN_KEEPER_ACTION_LIMIT')
  }

  async function dispatchShowcaseAction(action: LegalActionDescriptor, mulliganEntityIds: number[] = []): Promise<void> {
    await controller.dispatchAction(action, mulliganEntityIds)
    await advanceTavernKeeper()
    setSnapshot(controller.snapshot())
  }

  async function dispatchTutorialAction(action: LegalActionDescriptor): Promise<void> {
    if (!tutorialSession) throw new Error('NO_TUTORIAL_SESSION')
    const next = applyTutorialAction(
      tutorialSession,
      { type: 'ENGINE_ACTION', descriptor: action },
      `tutorial-ui-${tutorialSession.stepId}-${tutorialSession.acceptedActionCount + 1}`,
    )
    setTutorialSession(next)
  }

  async function importLog(file: File): Promise<void> {
    try {
      const result = await controller.importLog(file)
      setSnapshot(controller.snapshot())
      setTutorialSession(null)
      setMode('showcase')
      setScreen('session')
      setNotice(result.idempotent ? `日志 ${result.gameId} 已存在。` : `已导入 ${result.status === 'in_progress' ? '进行中' : '已完成'}日志 ${result.gameId}。`)
    } catch (error) {
      setNotice(`导入失败：${error instanceof Error ? error.message : 'UNKNOWN_ERROR'}`)
    }
  }

  async function skipTutorial(): Promise<void> {
    try {
      await controller.markTutorialCompleted()
    } catch (error) {
      setNotice(`教程状态保存失败：${error instanceof Error ? error.message : 'UNKNOWN_ERROR'}`)
      return
    }
    setTutorialSession(null)
    setNotice('教程已跳过，可随时从主菜单重新开始。')
    setScreen('menu')
  }

  function downloadRawStorage(): void {
    if (rawStorage === null) return
    downloadJson(rawStorage, 'hearthstone-web-corrupt-storage.json')
    setNotice('损坏存储原文已下载，原始 localStorage 保持不变。')
  }

  function exportCurrentLog(): void {
    const text = controller.exportCurrentLog()
    if (!text) {
      setNotice('当前没有可导出的日志。')
      return
    }
    downloadJson(text, `hearthstone-log-${new Date().toISOString().replaceAll(':', '-')}.json`)
    setNotice('日志已导出。')
  }

  const tutorialDefinition = tutorialSession ? TUTORIAL_STEPS[tutorialIndex] : null
  const tutorialActorId = tutorialSession?.state.game.pendingDecision?.kind === 'DISCOVER'
    ? tutorialSession.state.game.pendingDecision.actorId
    : tutorialSession?.state.game.activePlayerId
  const tutorialView = tutorialSession && tutorialActorId ? projectPlayerView(tutorialSession.state, tutorialActorId) : null
  const tutorialLegalActions = tutorialSession ? getTutorialActions(tutorialSession).flatMap((action) => action.type === 'ENGINE_ACTION' ? [action.descriptor] : []) : []

  const root = controller.getRoot()
  const completedLogs: CompletedLogSummary[] = root.completedGameLogs.slice(-5).reverse().map((log) => ({
    gameId: log.gameId,
    completedAt: log.completedAt,
    result: log.result,
    totalEventCount: log.totalEventCount,
    rulesVersion: log.rulesVersion,
  }))

  const playerValue: PlayerSessionValue | null = mode === 'showcase' && snapshot ? {
    mode,
    view: snapshot.view,
    legalActions: snapshot.legalActions,
    lastEventTypes: batchEventTypes(snapshot),
    lastAnimations: batchAnimations(snapshot),
    lastEventKey: snapshot.lastBatch ? String(snapshot.lastBatch.sequence) : '',
    busy: snapshot.busy,
    error: snapshot.error,
    tutorial: null,
    startShowcase,
    dispatchAction: dispatchShowcaseAction,
    resetTutorialStep: () => undefined,
    nextTutorialStep: () => undefined,
    skipTutorial: () => undefined,
    restartShowcase: startShowcase,
    exportLog: exportCurrentLog,
    exitToMenu: () => setScreen('menu'),
  } : mode === 'tutorial' && tutorialSession && tutorialDefinition && tutorialView ? {
    mode,
    view: tutorialView,
    legalActions: tutorialLegalActions,
    lastEventTypes: tutorialSession.lastBatch?.events.map((recorded) => recorded.event.payload.type) ?? [],
    lastAnimations: animationsFromEvents(tutorialSession.lastBatch?.events ?? []),
    lastEventKey: tutorialSession.lastBatch ? `${tutorialSession.stepId}-${tutorialSession.acceptedActionCount}` : '',
    busy: false,
    error: null,
    tutorial: {
      stepId: tutorialSession.stepId,
      title: tutorialDefinition.title,
      instruction: tutorialDefinition.instruction,
      stepNumber: tutorialIndex + 1,
      totalSteps: TUTORIAL_STEPS.length,
      complete: tutorialSession.complete,
    },
    startShowcase: startShowcaseFromTutorial,
    dispatchAction: dispatchTutorialAction,
    resetTutorialStep: () => setTutorialSession(startTutorialStep(tutorialSession.stepId)),
    nextTutorialStep: async () => {
      if (tutorialIndex + 1 < TUTORIAL_STEPS.length) {
        startTutorial(tutorialIndex + 1)
        return
      }
      try {
        await controller.markTutorialCompleted()
      } catch (error) {
        setNotice(`教程状态保存失败：${error instanceof Error ? error.message : 'UNKNOWN_ERROR'}`)
        return
      }
      setTutorialSession(null)
      setNotice('五步教程已完成。')
      setScreen('menu')
    },
    skipTutorial,
    restartShowcase: async () => undefined,
    exportLog: () => undefined,
    exitToMenu: () => setScreen('menu'),
  } : null

  if (cardPreview) {
    return <CardPreview />
  }

  if (screen === 'session' && playerValue) {
    return (
      <PlayerSessionProvider value={playerValue}>
        <GameBoard />
        {DebugPanel ? <DebugPanel snapshot={controller.getDebugSnapshot()} /> : null}
      </PlayerSessionProvider>
    )
  }

  return (
    <main className="app-shell">
      <MainMenu
        notice={notice}
        hasActive={root.activeGameLog !== null}
        canResume={root.activeGameLog !== null && snapshot !== null}
        canExport={controller.exportCurrentLog() !== null || rawStorage !== null}
        tutorialCompleted={root.tutorialCompleted}
        completedLogs={completedLogs}
        storageError={storageError}
        showcaseDecks={SHOWCASE_DECKS_V1}
        selectedShowcaseClass={showcaseClass}
        onSelectShowcaseClass={setShowcaseClass}
        onShowcase={() => void startShowcase()}
        onResume={() => { setMode('showcase'); setSnapshot(controller.snapshot()); setScreen('session') }}
        onTutorial={() => startTutorial(0)}
        onImport={(file) => void importLog(file)}
        onExport={storageError ? downloadRawStorage : exportCurrentLog}
        onDownloadRawStorage={downloadRawStorage}
      />
    </main>
  )
}
