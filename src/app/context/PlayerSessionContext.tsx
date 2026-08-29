import type { ReactNode } from 'react'
import { PlayerSessionContext, type PlayerSessionValue } from '@/app/context/playerSession'

export function PlayerSessionProvider({ value, children }: { value: PlayerSessionValue; children: ReactNode }) {
  return <PlayerSessionContext.Provider value={value}>{children}</PlayerSessionContext.Provider>
}
