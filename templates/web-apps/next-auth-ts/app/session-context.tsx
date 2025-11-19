'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getSession, signOut as authSignOut } from '@robojs/auth/client'
import type { Session } from '@robojs/auth/types'

type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface SessionContextValue {
	status: SessionStatus
	session: Session | null
	refresh: () => Promise<void>
	signOut: () => Promise<void>
	signOutPending: boolean
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined)

export function SessionProvider({ children }: { children: React.ReactNode }) {
	const [session, setSession] = useState<Session | null>(null)
	const [status, setStatus] = useState<SessionStatus>('loading')
	const [signOutPending, setSignOutPending] = useState(false)

	const refresh = useCallback(async () => {
		try {
			const next = await getSession<Session>()
			setSession(next)
			setStatus(next ? 'authenticated' : 'unauthenticated')
		} catch (err) {
			console.error('Failed to load session', err)
			setSession(null)
			setStatus('unauthenticated')
		}
	}, [])

	useEffect(() => {
		void refresh()
	}, [refresh])

	const signOut = useCallback(async () => {
		if (signOutPending) return
		setSignOutPending(true)
		try {
			await authSignOut()
			setSession(null)
			setStatus('unauthenticated')
		} catch (err) {
			console.error('Sign-out failed', err)
		} finally {
			setSignOutPending(false)
		}
	}, [signOutPending])

	const value = useMemo<SessionContextValue>(
		() => ({ status, session, refresh, signOut, signOutPending }),
		[status, session, refresh, signOut, signOutPending]
	)

	return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSessionState() {
	const context = useContext(SessionContext)
	if (!context) {
		throw new Error('useSessionState must be used within a SessionProvider')
	}
	return context
}
