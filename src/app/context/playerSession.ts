import { createContext, useContext } from 'react'
import type { LegalActionDescriptor } from '@/engine/commands'
import type { PlayerViewModel, PublicEntityViewModel } from '@/engine/projection'
import type { TutorialStepId } from '@/scenarios/tutorial'

export type { LegalActionDescriptor, PlayerViewModel, PublicEntityViewModel }

export type TutorialUiState = {
  stepId: TutorialStepId
  title: string
  instruction: string
  stepNumber: number
  totalSteps: number
  complete: boolean
}

export type PlayerSessionValue = {
  mode: 'showcase' | 'tutorial'
  view: PlayerViewModel
  legalActions: LegalActionDescriptor[]
  lastEventTypes: string[]
  lastEventKey: string
  busy: boolean
  error: string | null
  tutorial: TutorialUiState | null
  dispatchAction(action: LegalActionDescriptor, mulliganEntityIds?: number[]): Promise<void>
  resetTutorialStep(): void
  nextTutorialStep(): void | Promise<void>
  skipTutorial(): void | Promise<void>
  startShowcase(): Promise<void>
  restartShowcase(): Promise<void>
  exportLog(): void
  exitToMenu(): void
}

export const PlayerSessionContext = createContext<PlayerSessionValue | null>(null)

export function usePlayerSession(): PlayerSessionValue {
  const value = useContext(PlayerSessionContext)
  if (!value) throw new Error('PLAYER_SESSION_CONTEXT_MISSING')
  return value
}
