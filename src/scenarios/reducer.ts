import type { ScenarioEventV1 } from '@/scenarios/events'
import { hasAllShowcaseCoverage, type ScenarioStateV1 } from '@/scenarios/state'

export function applyScenarioEvent(state: ScenarioStateV1, event: ScenarioEventV1): ScenarioStateV1 {
  const next = structuredClone(state)
  switch (event.type) {
    case 'SCENARIO_COMMAND_ACCEPTED':
      next.acceptedCommandCount += 1
      return next
    case 'KEYWORD_COVERED':
      if (next.coverage[event.keyword] === null) next.coverage[event.keyword] = event.sourceEventSequence
      return next
    case 'SHOWCASE_READY_FOR_CONCEDE':
      if (next.stage === 'IN_PROGRESS' && hasAllShowcaseCoverage(next)) next.stage = 'READY_FOR_AI_CONCEDE'
      return next
    case 'AI_CONCEDE_REQUESTED':
      next.aiConcedeRequested = true
      return next
    case 'SCENARIO_COMPLETED':
      if (next.stage === 'READY_FOR_AI_CONCEDE' && next.aiConcedeRequested && hasAllShowcaseCoverage(next)) next.stage = 'COMPLETED'
      return next
  }
}
