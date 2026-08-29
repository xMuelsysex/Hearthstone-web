import type { TargetLegalityEvidence } from '@/engine/commands'
import type { RecordedEventV1 } from '@/engine/events'
import type { AuthoritativeSessionStateV1 } from '@/engine/state'
import type { ScenarioEventV1 } from '@/scenarios/events'
import { hasAllShowcaseCoverage } from '@/scenarios/state'

export function deriveScenarioEvents(
  state: AuthoritativeSessionStateV1,
  event: RecordedEventV1,
  sourceEventSequence: number,
  evidence: readonly TargetLegalityEvidence[],
): ScenarioEventV1[] {
  if (state.scenario.id !== 'showcase-v1') return []
  const derived: ScenarioEventV1[] = []
  if (event.scope === 'GAME') {
    if (event.payload.type === 'COMMAND_ACCEPTED') derived.push({ type: 'SCENARIO_COMMAND_ACCEPTED' })
    if (event.payload.type === 'MANATHIRST_BONUS_APPLIED') derived.push({ type: 'KEYWORD_COVERED', keyword: 'MANATHIRST', sourceEventSequence })
    if (event.payload.type === 'MINION_DEATH_BATCH' && event.payload.deaths.some((death) => death.reason === 'POISONOUS')) {
      derived.push({ type: 'KEYWORD_COVERED', keyword: 'POISONOUS', sourceEventSequence })
    }
    if (event.payload.type === 'DISCOVER_RESOLVED') derived.push({ type: 'KEYWORD_COVERED', keyword: 'DISCOVER', sourceEventSequence })
    if (event.payload.type === 'MAGNETIC_MERGED') derived.push({ type: 'KEYWORD_COVERED', keyword: 'MAGNETIC', sourceEventSequence })
    if (event.payload.type === 'GAME_ENDED' && state.scenario.aiConcedeRequested && hasAllShowcaseCoverage(state.scenario)) {
      derived.push({ type: 'SCENARIO_COMPLETED' })
    }
  }
  if (evidence.some((item) => item.excluded.some((entry) => entry.reason === 'ELUSIVE'))) {
    derived.push({ type: 'KEYWORD_COVERED', keyword: 'ELUSIVE', sourceEventSequence })
  }
  const projected = structuredClone(state.scenario)
  for (const item of derived) {
    if (item.type === 'KEYWORD_COVERED' && projected.coverage[item.keyword] === null) {
      projected.coverage[item.keyword] = item.sourceEventSequence
    }
  }
  const gameIsEnding = event.scope === 'GAME' && event.payload.type === 'GAME_ENDED'
  if (!gameIsEnding && hasAllShowcaseCoverage(projected) && state.scenario.stage === 'IN_PROGRESS') {
    derived.push({ type: 'SHOWCASE_READY_FOR_CONCEDE' })
  }
  return derived
}
