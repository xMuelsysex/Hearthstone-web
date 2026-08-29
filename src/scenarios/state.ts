export const SCENARIO_VERSION = 'showcase-v1' as const

export type ShowcaseKeyword = 'MANATHIRST' | 'POISONOUS' | 'ELUSIVE' | 'DISCOVER' | 'MAGNETIC'

export type ScenarioCoverageV1 = Record<ShowcaseKeyword, number | null>

export type ScenarioStateV1 = {
  id: 'showcase-v1' | 'tutorial-v1' | 'sandbox-v1'
  version: typeof SCENARIO_VERSION
  coverage: ScenarioCoverageV1
  stage: 'IN_PROGRESS' | 'READY_FOR_AI_CONCEDE' | 'COMPLETED'
  aiConcedeRequested: boolean
  acceptedCommandCount: number
}

export function createScenarioState(id: ScenarioStateV1['id'] = 'showcase-v1'): ScenarioStateV1 {
  return {
    id,
    version: SCENARIO_VERSION,
    coverage: {
      MANATHIRST: null,
      POISONOUS: null,
      ELUSIVE: null,
      DISCOVER: null,
      MAGNETIC: null,
    },
    stage: 'IN_PROGRESS',
    aiConcedeRequested: false,
    acceptedCommandCount: 0,
  }
}

export function hasAllShowcaseCoverage(state: ScenarioStateV1): boolean {
  return Object.values(state.coverage).every((sequence) => sequence !== null)
}
