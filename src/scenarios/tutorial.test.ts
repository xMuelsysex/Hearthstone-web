import { canonicalizeV1 } from '@/log/canonicalize'
import { applyTutorialAction, getTutorialActions, startTutorialStep, TUTORIAL_STEPS, type TutorialStepSession } from '@/scenarios/tutorial'

function sessionKey(session: TutorialStepSession): string {
  return canonicalizeV1({ state: session.state, complete: session.complete, acceptedActionCount: session.acceptedActionCount })
}

function assertReachableOrResettable(initial: TutorialStepSession): void {
  const definition = TUTORIAL_STEPS.find((step) => step.id === initial.stepId)
  if (!definition) throw new Error(`missing tutorial definition ${initial.stepId}`)
  const queue = [initial]
  const visited = new Set<string>()
  let successFound = false

  while (queue.length > 0) {
    const session = queue.shift()
    if (!session) break
    const key = sessionKey(session)
    if (visited.has(key)) continue
    visited.add(key)
    const actions = getTutorialActions(session)
    const reset = actions.find((action) => action.type === 'RESET_TUTORIAL_STEP')
    expect(reset).toEqual({ type: 'RESET_TUTORIAL_STEP', stepId: session.stepId })
    const resetState = reset ? applyTutorialAction(session, reset, 'reset') : null
    expect(resetState && sessionKey(resetState)).toBe(sessionKey(initial))

    if (session.complete) {
      successFound = true
      continue
    }
    if (session.acceptedActionCount >= definition.maximumActions) continue
    for (const [index, action] of actions.entries()) {
      if (action.type === 'RESET_TUTORIAL_STEP') continue
      queue.push(applyTutorialAction(session, action, `${session.stepId}-${session.acceptedActionCount}-${index}`))
    }
  }
  expect(successFound).toBe(true)
}

describe('tutorial micro scenarios', () => {
  it.each(TUTORIAL_STEPS.map((step) => [step.id] as const))('%s has a bounded success path and an explicit reset from every reachable state', (stepId) => {
    assertReachableOrResettable(startTutorialStep(stepId))
  })
})
