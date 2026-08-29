import type { ShowcaseKeyword } from '@/scenarios/state'

export type ScenarioEventV1 =
  | { type: 'SCENARIO_COMMAND_ACCEPTED' }
  | { type: 'KEYWORD_COVERED'; keyword: ShowcaseKeyword; sourceEventSequence: number }
  | { type: 'SHOWCASE_READY_FOR_CONCEDE' }
  | { type: 'AI_CONCEDE_REQUESTED' }
  | { type: 'SCENARIO_COMPLETED' }
