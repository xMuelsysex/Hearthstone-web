import { projectPlayerView, type PlayerViewModel, type PublicEntityViewModel } from '@/engine/projection'
import type { AuthoritativeSessionStateV1, PlayerId } from '@/engine/state'

export type ReplayViewer = PlayerId | 'PUBLIC'
export type ReplayArtifactStatus = 'active' | 'pending' | 'completed'
export type ReplayArtifactOrigin = 'local' | 'imported'

export type ReplayAuthorizationRequest = {
  status: ReplayArtifactStatus
  origin: ReplayArtifactOrigin
  ownerId: PlayerId
  viewer: ReplayViewer
}

export type ReplayAuthorizationResult =
  | { ok: true; viewer: ReplayViewer }
  | { ok: false; code: 'REPLAY_VIEW_FORBIDDEN' }

export type ReplayHiddenCardViewModel = { hidden: true }
export type ReplayCardViewModel = PublicEntityViewModel | ReplayHiddenCardViewModel

type ReplayPlayerSideViewModel = Omit<PlayerViewModel['self'], 'hand'> & {
  hand: ReplayCardViewModel[]
}

type ReplayOpponentSideViewModel = Omit<PlayerViewModel['opponent'], 'hand'> & {
  hand: ReplayCardViewModel[]
}

export type ReplayViewModel = Omit<PlayerViewModel, 'viewerId' | 'self' | 'opponent'> & {
  viewerId: ReplayViewer
  self: ReplayPlayerSideViewModel
  opponent: ReplayOpponentSideViewModel
}

export function allowedReplayViewers(request: Omit<ReplayAuthorizationRequest, 'viewer'>): ReplayViewer[] {
  if (request.status === 'completed') return ['PLAYER', 'OPPONENT', 'PUBLIC']
  return [request.ownerId]
}

export function authorizeReplayViewer(request: ReplayAuthorizationRequest): ReplayAuthorizationResult {
  return allowedReplayViewers(request).includes(request.viewer)
    ? { ok: true, viewer: request.viewer }
    : { ok: false, code: 'REPLAY_VIEW_FORBIDDEN' }
}

export function assertReplayViewer(request: ReplayAuthorizationRequest): void {
  const result = authorizeReplayViewer(request)
  if (!result.ok) throw new Error(result.code)
}

function hiddenHand(length: number): ReplayHiddenCardViewModel[] {
  return Array.from({ length }, () => ({ hidden: true as const }))
}

export function projectReplayView(state: AuthoritativeSessionStateV1, viewer: ReplayViewer): ReplayViewModel {
  const baseViewer: PlayerId = viewer === 'OPPONENT' ? 'OPPONENT' : 'PLAYER'
  const base = projectPlayerView(state, baseViewer)
  const publicView = viewer === 'PUBLIC'
  const selfHand = publicView ? hiddenHand(base.self.hand.length) : base.self.hand
  const pendingDecision = publicView || (state.game.pendingDecision?.kind === 'DISCOVER' && state.game.pendingDecision.actorId !== baseViewer)
    ? (base.pendingDecision === null ? null : { kind: base.pendingDecision.kind })
    : base.pendingDecision

  return {
    ...base,
    viewerId: viewer,
    pendingDecision,
    self: {
      ...base.self,
      hand: selfHand,
    },
    opponent: {
      ...base.opponent,
      hand: base.opponent.hand.map(() => ({ hidden: true as const })),
    },
  }
}
