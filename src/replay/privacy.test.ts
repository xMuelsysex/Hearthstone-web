import { createGameState } from '@/engine/setup'
import {
  allowedReplayViewers,
  authorizeReplayViewer,
  projectReplayView,
  type ReplayAuthorizationRequest,
} from '@/replay/privacy'
import { projectReplayFrame } from '@/replay/projectReplayFrame'

function request(status: ReplayAuthorizationRequest['status'], viewer: ReplayAuthorizationRequest['viewer'], origin: ReplayAuthorizationRequest['origin'] = 'local'): ReplayAuthorizationRequest {
  return { status, origin, ownerId: 'PLAYER', viewer }
}

describe('replay privacy', () => {
  it('scopes active and pending artifacts to their original player', () => {
    expect(allowedReplayViewers({ status: 'active', origin: 'local', ownerId: 'PLAYER' })).toEqual(['PLAYER'])
    expect(allowedReplayViewers({ status: 'pending', origin: 'imported', ownerId: 'PLAYER' })).toEqual(['PLAYER'])
    expect(authorizeReplayViewer(request('active', 'PLAYER'))).toEqual({ ok: true, viewer: 'PLAYER' })
    expect(authorizeReplayViewer(request('active', 'OPPONENT'))).toEqual({ ok: false, code: 'REPLAY_VIEW_FORBIDDEN' })
    expect(authorizeReplayViewer(request('pending', 'PUBLIC', 'imported'))).toEqual({ ok: false, code: 'REPLAY_VIEW_FORBIDDEN' })
  })

  it('allows all public projections only for completed artifacts and keeps hands hidden by viewer', () => {
    const state = createGameState({ seed: 902 })
    const playerView = projectReplayFrame(state, request('active', 'PLAYER'))
    expect(playerView.viewerId).toBe('PLAYER')
    expect(playerView.pendingDecision?.kind).toBe('MULLIGAN')
    expect(playerView.self.hand.every((card) => 'hidden' in card)).toBe(false)
    expect(playerView.opponent.hand.every((card) => 'hidden' in card)).toBe(true)

    expect(() => projectReplayFrame(state, request('active', 'OPPONENT'))).toThrow('REPLAY_VIEW_FORBIDDEN')
    expect(() => projectReplayFrame(state, request('pending', 'PUBLIC', 'imported'))).toThrow('REPLAY_VIEW_FORBIDDEN')

    const publicView = projectReplayView(state, 'PUBLIC')
    expect(publicView.self.hand.every((card) => 'hidden' in card)).toBe(true)
    expect(publicView.opponent.hand.every((card) => 'hidden' in card)).toBe(true)
    expect(authorizeReplayViewer(request('completed', 'PLAYER'))).toEqual({ ok: true, viewer: 'PLAYER' })
    expect(authorizeReplayViewer(request('completed', 'OPPONENT'))).toEqual({ ok: true, viewer: 'OPPONENT' })
    expect(authorizeReplayViewer(request('completed', 'PUBLIC'))).toEqual({ ok: true, viewer: 'PUBLIC' })
  })
})
