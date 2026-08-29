import type { LegalActionDescriptor } from '@/engine/commands'
import { projectLegalActions, projectPlayerView, type PlayerViewModel } from '@/engine/projection'
import type { AuthoritativeSessionStateV1 } from '@/engine/state'
import type { ScenarioCoverageV1, ScenarioStateV1 } from '@/scenarios/state'

export type ScenarioPublicStateV1 = {
  stage: ScenarioStateV1['stage']
  coverage: ScenarioCoverageV1
}

export type AiObservationV1 = {
  view: PlayerViewModel
  legalActions: LegalActionDescriptor[]
  scenario: ScenarioPublicStateV1
}

export function observeForAi(state: AuthoritativeSessionStateV1): AiObservationV1 {
  return {
    view: projectPlayerView(state, 'OPPONENT'),
    legalActions: projectLegalActions(state, 'OPPONENT'),
    scenario: {
      stage: state.scenario.stage,
      coverage: structuredClone(state.scenario.coverage),
    },
  }
}

export function chooseTavernKeeperAction(observation: AiObservationV1): LegalActionDescriptor | null {
  const { legalActions, scenario } = observation
  if (scenario.stage === 'READY_FOR_AI_CONCEDE') {
    return legalActions.find((action) => action.type === 'CONCEDE') ?? null
  }
  const mulligan = legalActions.find((action) => action.type === 'CONFIRM_MULLIGAN')
  if (mulligan) return mulligan
  const discover = legalActions.find((action) => action.type === 'SELECT_DISCOVER')
  if (discover) return discover
  if (scenario.coverage.ELUSIVE === null) {
    const elusiveProbe = legalActions.find((action) => 'evidence' in action && action.evidence?.excluded.some((entry) => entry.reason === 'ELUSIVE'))
    if (elusiveProbe) return elusiveProbe
  }
  return legalActions.find((action) => action.type === 'END_TURN')
    ?? legalActions.find((action) => action.type !== 'CONCEDE')
    ?? legalActions.find((action) => action.type === 'CONCEDE')
    ?? null
}
