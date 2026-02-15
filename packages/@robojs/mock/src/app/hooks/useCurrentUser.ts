import { useCallback, useMemo, useState, useEffect } from 'react'
import { useSession as useSessionState, useSessionDispatch, useWebSocket } from '../stores/sessionStore'
import type { StageUser, StageActivity } from '../types/stage'

// localStorage key for persisting current user ID per browser
const LOCAL_STORAGE_KEY = 'mock_current_user_id'

// ============================================================================
// Simple User Lookup Hook
// ============================================================================

/**
 * Look up a user by ID from the session state.
 * Returns the latest user data, making user display reactive to changes.
 *
 * @param userId - The user ID to look up
 * @param fallback - Optional fallback user data if not found in state
 * @returns The user from state, or the fallback, or undefined
 */
export function useUserById(userId: string, fallback?: Partial<StageUser>): StageUser | undefined {
	const state = useSessionState()

	return useMemo(() => {
		// First check if it's the currentUser (most common case for "my" messages)
		if (state.currentUser?.id === userId) {
			return state.currentUser
		}
		// Then check the users array
		const found = state.users.find(u => u.id === userId)
		if (found) return found
		// Fall back to provided data if available
		if (fallback) {
			return {
				id: userId,
				username: fallback.username ?? 'Unknown',
				avatar: fallback.avatar ?? null,
				bot: fallback.bot ?? false,
				...fallback
			} as StageUser
		}
		return undefined
	}, [state.currentUser, state.users, userId, fallback])
}

// ============================================================================
// Types
// ============================================================================

export interface CurrentUserSettings {
	username?: string
	avatar?: string | null
	status?: 'online' | 'offline' | 'idle' | 'dnd'
	activities?: StageActivity[]
}

export interface UseCurrentUserResult {
	/** The current acting user for Stage UI interactions (resolved from localStorage user ID) */
	currentUser: StageUser | null
	/** Whether the current user has been loaded/claimed */
	isLoaded: boolean
	/** Update the current user's properties */
	updateUser: (settings: CurrentUserSettings) => Promise<StageUser>
	/** Claim an existing user as the current user (stores in localStorage) */
	claimUser: (userId: string) => void
	/** Switch to a different existing user as the current user */
	switchUser: (userId: string) => Promise<StageUser>
	/** Create a new user and set them as the current user */
	createAndSwitchUser: (username: string, avatar?: string | null) => Promise<StageUser>
	/** Get all available users that can be switched to */
	availableUsers: StageUser[]
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Get initial user ID from localStorage (client-side only)
 */
function getStoredUserId(): string | null {
	if (typeof window === 'undefined') return null
	try {
		return localStorage.getItem(LOCAL_STORAGE_KEY)
	} catch {
		return null
	}
}

/**
 * Store user ID in localStorage (client-side only)
 */
function storeUserId(userId: string): void {
	if (typeof window === 'undefined') return
	try {
		localStorage.setItem(LOCAL_STORAGE_KEY, userId)
	} catch {
		// Ignore localStorage errors
	}
}

/**
 * Clear user ID from localStorage
 */
function clearStoredUserId(): void {
	if (typeof window === 'undefined') return
	try {
		localStorage.removeItem(LOCAL_STORAGE_KEY)
	} catch {
		// Ignore localStorage errors
	}
}

/**
 * Hook for managing the current "acting" user in Stage UI.
 *
 * The current user is tracked per-browser via localStorage, allowing multiple
 * browsers to act as different (or the same) users independently.
 *
 * The current user represents the human using Stage - separate from the bot user.
 * All interactions (messages, commands, buttons, etc.) are sent as this user.
 *
 * @returns Current user state and management functions
 */
export function useCurrentUser(): UseCurrentUserResult {
	const state = useSessionState()
	const dispatch = useSessionDispatch()
	const { sendCommand, isConnected } = useWebSocket()

	// Local user ID state (persisted in localStorage)
	const [localUserId, setLocalUserId] = useState<string | null>(getStoredUserId)

	// Get all non-bot users that can be switched to
	const availableUsers = useMemo(() => state.users.filter(u => !u.bot), [state.users])

	// Resolve current user from local user ID
	const currentUser = useMemo(() => {
		if (!localUserId) return null

		// Look up user in state
		const found = state.users.find(u => u.id === localUserId)
		if (found) return found

		// Also check currentUser from state (may be there before users array is populated)
		if (state.currentUser?.id === localUserId) return state.currentUser

		return null
	}, [localUserId, state.users, state.currentUser])

	// Claim a user by ID (stores in localStorage, no server call needed)
	const claimUser = useCallback((userId: string) => {
		setLocalUserId(userId)
		storeUserId(userId)
	}, [])

	// Auto-claim first user or create new one when connected and no user claimed
	useEffect(() => {
		if (!isConnected || localUserId) return

		// If we have non-bot users, claim the first one
		if (availableUsers.length > 0) {
			claimUser(availableUsers[0].id)
			return
		}

		// If we have currentUser from state sync, claim it
		if (state.currentUser && !state.currentUser.bot) {
			claimUser(state.currentUser.id)
			return
		}

		// Otherwise create a new user
		const createUser = async () => {
			try {
				const result = await sendCommand<{ user: StageUser }>('set_current_user', {
					username: `User-${Date.now().toString(36).slice(-4)}`,
					create_new: true
				})
				if (result?.user) {
					claimUser(result.user.id)
					dispatch({ type: 'SET_CURRENT_USER', payload: result.user })
				}
			} catch (error) {
				console.error('[useCurrentUser] Failed to create user:', error)
			}
		}
		createUser()
	}, [isConnected, localUserId, availableUsers, state.currentUser, claimUser, sendCommand, dispatch])

	// Clear local user if they were deleted from state
	useEffect(() => {
		if (!localUserId) return
		if (state.users.length === 0) return // State not loaded yet

		const userExists = state.users.some(u => u.id === localUserId)
		if (!userExists && state.currentUser?.id !== localUserId) {
			// User was deleted, clear local state
			clearStoredUserId()
			setLocalUserId(null)
		}
	}, [localUserId, state.users, state.currentUser])

	// Update current user properties
	const updateUser = useCallback(async (settings: CurrentUserSettings): Promise<StageUser> => {
		if (!isConnected) {
			throw new Error('Not connected to session')
		}
		if (!localUserId) {
			throw new Error('No current user')
		}

		const result = await sendCommand<{ user: StageUser }>('set_current_user', settings)

		// Update local state immediately for optimistic UI
		if (result?.user) {
			dispatch({ type: 'SET_CURRENT_USER', payload: result.user })
		}

		return result.user
	}, [isConnected, localUserId, sendCommand, dispatch])

	// Switch to an existing user (claims and notifies server)
	const switchUser = useCallback(async (userId: string): Promise<StageUser> => {
		if (!isConnected) {
			throw new Error('Not connected to session')
		}

		// First claim the user locally
		claimUser(userId)

		// Then notify server
		const result = await sendCommand<{ user: StageUser }>('switch_user', { user_id: userId })

		// Update local state immediately
		if (result?.user) {
			dispatch({ type: 'SET_CURRENT_USER', payload: result.user })
			// Backend resets Activity auth context on switch_user; keep Stage UI in sync.
			dispatch({ type: 'SET_ACTIVITY_AUTH_STATE', payload: 'UNAUTHENTICATED' })
		}

		return result.user
	}, [isConnected, claimUser, sendCommand, dispatch])

	// Create a new user and switch to them
	const createAndSwitchUser = useCallback(async (username: string, avatar?: string | null): Promise<StageUser> => {
		if (!isConnected) {
			throw new Error('Not connected to session')
		}

		// Use set_current_user with create_new flag
		const result = await sendCommand<{ user: StageUser }>('set_current_user', {
			username,
			avatar,
			create_new: true
		})

		// Claim the new user and update local state
		if (result?.user) {
			claimUser(result.user.id)
			dispatch({ type: 'SET_CURRENT_USER', payload: result.user })
		}

		return result.user
	}, [isConnected, claimUser, sendCommand, dispatch])

	return {
		currentUser,
		isLoaded: localUserId !== null,
		updateUser,
		claimUser,
		switchUser,
		createAndSwitchUser,
		availableUsers
	}
}
