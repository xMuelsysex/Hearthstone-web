import type { AuthoritativeSessionStateV1, PlayerId } from '@/engine/state'
import {
  assertReplayViewer,
  projectReplayView,
  type ReplayArtifactOrigin,
  type ReplayArtifactStatus,
  type ReplayAuthorizationRequest,
  type ReplayViewer,
  type ReplayViewModel,
} from '@/replay/privacy'

type ReplayFrameArtifact = Omit<ReplayAuthorizationRequest, 'viewer'>

export function projectReplayFrame(state: AuthoritativeSessionStateV1, request: ReplayAuthorizationRequest): ReplayViewModel
export function projectReplayFrame(state: AuthoritativeSessionStateV1, viewer: ReplayViewer, artifact?: ReplayFrameArtifact): ReplayViewModel
export function projectReplayFrame(
  state: AuthoritativeSessionStateV1,
  requestOrViewer: ReplayAuthorizationRequest | ReplayViewer,
  artifact?: ReplayFrameArtifact,
): ReplayViewModel {
  const request: ReplayAuthorizationRequest = typeof requestOrViewer === 'string'
    ? {
        status: artifact?.status ?? 'completed',
        origin: artifact?.origin ?? 'local',
        ownerId: artifact?.ownerId ?? (requestOrViewer === 'OPPONENT' ? 'OPPONENT' : 'PLAYER'),
        viewer: requestOrViewer,
      }
    : requestOrViewer
  assertReplayViewer(request)
  return projectReplayView(state, request.viewer)
}

export type { ReplayArtifactOrigin, ReplayArtifactStatus, ReplayViewer, ReplayViewModel, PlayerId }
