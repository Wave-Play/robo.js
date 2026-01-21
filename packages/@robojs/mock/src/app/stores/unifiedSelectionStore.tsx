import { createContext, useContext, useReducer, useCallback, useEffect, type ReactNode, type Dispatch } from 'react'
import { usePlayback } from './playbackStore'
import type { StageNavigationChangedData } from '../types/stage'

// ============================================================================
// Types
// ============================================================================

/**
 * Unified selection state that works for both live and playback modes.
 * This is the single source of truth for what guild/channel is selected.
 */
export interface UnifiedSelectionState {
	/** Currently selected guild ID */
	selectedGuildId: string | null
	/** Currently selected channel ID */
	selectedChannelId: string | null
	/** Preserved live selection for restoration when exiting playback */
	liveGuildId: string | null
	liveChannelId: string | null
}

// ============================================================================
// Actions
// ============================================================================

type SelectionAction =
	| { type: 'SELECT_GUILD'; payload: string | null }
	| { type: 'SELECT_CHANNEL'; payload: string | null }
	| { type: 'SAVE_LIVE_SELECTION' }
	| { type: 'RESTORE_LIVE_SELECTION' }
	| { type: 'SET_SELECTION'; payload: { guildId: string | null; channelId: string | null } }
	| { type: 'NAVIGATE_TO_GUILD'; payload: { guildId: string | null } }
	| { type: 'NAVIGATE_TO_CHANNEL'; payload: { channelId: string } }
	| { type: 'NAVIGATE_TO_DM'; payload: { userId: string } }
	| { type: 'NAVIGATE_TO_THREAD'; payload: { threadId: string } }

// ============================================================================
// Initial State
// ============================================================================

const initialState: UnifiedSelectionState = {
	selectedGuildId: null,
	selectedChannelId: null,
	liveGuildId: null,
	liveChannelId: null
}

// ============================================================================
// Reducer
// ============================================================================

function selectionReducer(state: UnifiedSelectionState, action: SelectionAction): UnifiedSelectionState {
	switch (action.type) {
		case 'SELECT_GUILD':
			return {
				...state,
				selectedGuildId: action.payload,
				// Clear channel when guild changes
				selectedChannelId: null
			}

		case 'SELECT_CHANNEL':
			return {
				...state,
				selectedChannelId: action.payload
			}

		case 'SAVE_LIVE_SELECTION':
			return {
				...state,
				liveGuildId: state.selectedGuildId,
				liveChannelId: state.selectedChannelId
			}

		case 'RESTORE_LIVE_SELECTION':
			return {
				...state,
				selectedGuildId: state.liveGuildId,
				selectedChannelId: state.liveChannelId
			}

		case 'SET_SELECTION':
			return {
				...state,
				selectedGuildId: action.payload.guildId,
				selectedChannelId: action.payload.channelId
			}

		case 'NAVIGATE_TO_GUILD':
			return {
				...state,
				selectedGuildId: action.payload.guildId,
				selectedChannelId: null // Clear channel when guild changes
			}

		case 'NAVIGATE_TO_CHANNEL':
			return {
				...state,
				selectedChannelId: action.payload.channelId
			}

		case 'NAVIGATE_TO_DM':
			return {
				...state,
				selectedGuildId: null, // DMs are outside of guilds
				selectedChannelId: action.payload.userId // Use userId as channel for DM navigation
			}

		case 'NAVIGATE_TO_THREAD':
			return {
				...state,
				selectedChannelId: action.payload.threadId // Threads are channel-like
			}

		default:
			return state
	}
}

// ============================================================================
// Context
// ============================================================================

interface SelectionContextValue {
	state: UnifiedSelectionState
	dispatch: Dispatch<SelectionAction>
}

const SelectionContext = createContext<SelectionContextValue | null>(null)

// Module-level ref for accessing state outside React components
let _currentSelectionState: UnifiedSelectionState = initialState

// ============================================================================
// Provider
// ============================================================================

interface UnifiedSelectionProviderProps {
	children: ReactNode
}

export function UnifiedSelectionProvider({ children }: UnifiedSelectionProviderProps) {
	const [state, dispatch] = useReducer(selectionReducer, initialState)
	const playbackState = usePlayback()

	// Save live selection when entering playback mode
	// Restore when exiting playback mode
	useEffect(() => {
		// This effect doesn't auto-select - that's handled by useStageData
		// It only saves/restores the live selection on mode change
	}, [playbackState.mode])

	// Keep module-level ref in sync for getNavigationStateSnapshot
	useEffect(() => {
		_currentSelectionState = state
	}, [state])

	return <SelectionContext.Provider value={{ state, dispatch }}>{children}</SelectionContext.Provider>
}

// ============================================================================
// Hooks
// ============================================================================

function useSelectionStore() {
	const context = useContext(SelectionContext)
	if (!context) {
		throw new Error('useSelectionStore must be used within a UnifiedSelectionProvider')
	}
	return context
}

/**
 * Hook for accessing and modifying the unified selection state.
 * This should be used by useStageData internally.
 */
export function useUnifiedSelection() {
	const { state, dispatch } = useSelectionStore()

	const selectGuild = useCallback(
		(guildId: string | null) => {
			dispatch({ type: 'SELECT_GUILD', payload: guildId })
		},
		[dispatch]
	)

	const selectChannel = useCallback(
		(channelId: string | null) => {
			dispatch({ type: 'SELECT_CHANNEL', payload: channelId })
		},
		[dispatch]
	)

	const setSelection = useCallback(
		(guildId: string | null, channelId: string | null) => {
			dispatch({ type: 'SET_SELECTION', payload: { guildId, channelId } })
		},
		[dispatch]
	)

	const saveLiveSelection = useCallback(() => {
		dispatch({ type: 'SAVE_LIVE_SELECTION' })
	}, [dispatch])

	const restoreLiveSelection = useCallback(() => {
		dispatch({ type: 'RESTORE_LIVE_SELECTION' })
	}, [dispatch])

	// Navigation actions for external control (Phase 8)
	const navigateToGuild = useCallback(
		(guildId: string | null) => {
			dispatch({ type: 'NAVIGATE_TO_GUILD', payload: { guildId } })
		},
		[dispatch]
	)

	const navigateToChannel = useCallback(
		(channelId: string) => {
			dispatch({ type: 'NAVIGATE_TO_CHANNEL', payload: { channelId } })
		},
		[dispatch]
	)

	const navigateToDM = useCallback(
		(userId: string) => {
			dispatch({ type: 'NAVIGATE_TO_DM', payload: { userId } })
		},
		[dispatch]
	)

	const navigateToThread = useCallback(
		(threadId: string) => {
			dispatch({ type: 'NAVIGATE_TO_THREAD', payload: { threadId } })
		},
		[dispatch]
	)

	return {
		// State
		selectedGuildId: state.selectedGuildId,
		selectedChannelId: state.selectedChannelId,
		liveGuildId: state.liveGuildId,
		liveChannelId: state.liveChannelId,

		// Actions
		selectGuild,
		selectChannel,
		setSelection,
		saveLiveSelection,
		restoreLiveSelection,

		// External navigation (Phase 8)
		navigateToGuild,
		navigateToChannel,
		navigateToDM,
		navigateToThread
	}
}

// ============================================================================
// State Snapshot for Control Commands
// ============================================================================

/**
 * Get a snapshot of the current navigation state for control command responses.
 * This can be called outside of React components.
 */
export function getNavigationStateSnapshot(): StageNavigationChangedData {
	const state = _currentSelectionState
	return {
		guildId: state.selectedGuildId,
		channelId: state.selectedChannelId,
		timestamp: Date.now()
	}
}
