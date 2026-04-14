import { SyncContext as SyncContextProvider } from './context.js'
import { useZoneKey } from './SyncZone.js'
import { useSyncState } from './useSyncState.js'
import React, {
	forwardRef,
	Fragment,
	useCallback,
	useContext,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState
} from 'react'
import type {
	InterpolateConfig,
	LockContext,
	SetStateOptions,
	SyncBoxHandle,
	SyncBoxProps,
	SyncBoxRenderFunction,
	SyncBoxSetState,
	SyncStatus
} from './types.js'

// Internal state shape when lockable is enabled
interface LockableState<T> {
	data: T
	lockedBy: string | null
}

// Helper to lerp between two values
function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t
}

// Apply interpolation to state
function interpolateState<T>(
	current: T | undefined,
	target: T,
	config: InterpolateConfig<T>
): T {
	if (!current || typeof target !== 'object' || target === null) {
		return target
	}

	const result = { ...target }
	for (const key in config) {
		const factor = config[key]
		if (
			factor !== undefined &&
			typeof current[key] === 'number' &&
			typeof target[key] === 'number'
		) {
			;(result as Record<string, unknown>)[key] = lerp(
				current[key] as number,
				target[key] as number,
				factor
			)
		}
	}
	return result
}

/**
 * Internal SyncBox implementation with forwardRef.
 */
function SyncBoxInner<T = unknown, ClientData = unknown>(
	props: SyncBoxProps<T, ClientData>,
	ref: React.ForwardedRef<SyncBoxHandle<T>>
) {
	const {
		id,
		initialState,
		children,
		style,
		className,
		as: Component = 'div',
		onStateChange,
		onSyncStatusChange,
		throttle: throttleConfig,
		lockable = false,
		interpolate: interpolateConfig,
		onConflict
	} = props

	// Get connection status from context
	const syncContext = useContext(SyncContextProvider)
	const isConnected = syncContext.connected
	const clientId = syncContext.clientId

	// Compute full key with zone prefix
	const fullKey = useZoneKey(id)

	// Wrap initial state for lockable mode
	const wrappedInitialState = useMemo(() => {
		if (lockable) {
			return { data: initialState, lockedBy: null } as LockableState<T | undefined>
		}
		return initialState
	}, [initialState, lockable])

	// Use the existing useSyncState hook
	const [rawState, setRawStateOriginal, context] = useSyncState<
		T | LockableState<T | undefined> | undefined,
		ClientData
	>(wrappedInitialState, fullKey)

	// Stabilize setRawState reference (useSyncState doesn't memoize it)
	const setRawStateRef = useRef(setRawStateOriginal)
	setRawStateRef.current = setRawStateOriginal
	const setRawState = useCallback(
		(newState: Partial<T | LockableState<T | undefined> | undefined>) => {
			setRawStateRef.current(newState)
		},
		[]
	)

	// Unwrap state for lockable mode
	const { state, lockedBy } = useMemo(() => {
		if (lockable && rawState && typeof rawState === 'object' && 'data' in rawState) {
			const lockableState = rawState as LockableState<T | undefined>
			return { state: lockableState.data, lockedBy: lockableState.lockedBy }
		}
		return { state: rawState as T | undefined, lockedBy: null }
	}, [rawState, lockable])

	// Track displayed state (for interpolation)
	const [displayState, setDisplayState] = useState<T | undefined>(state)
	const animationFrameRef = useRef<number | null>(null)

	// Track sync status
	const [syncStatus, setSyncStatus] = useState<SyncStatus>({
		synced: false,
		syncing: false,
		stale: false
	})

	// Refs for tracking state changes and callbacks
	const stateRef = useRef<T | undefined>(state)
	const prevStateRef = useRef<T | undefined>(undefined)
	const onStateChangeRef = useRef(onStateChange)
	const onSyncStatusChangeRef = useRef(onSyncStatusChange)
	const onConflictRef = useRef(onConflict)
	const hasSyncedRef = useRef(false)

	// Throttle state for high-frequency updates
	const throttleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const pendingStateRef = useRef<Partial<T> | ((prev: T) => T) | null>(null)
	const lastUpdateTimeRef = useRef(0)

	// Optimistic update tracking
	const optimisticStateRef = useRef<T | undefined>(undefined)
	const isOptimisticRef = useRef(false)

	// Track intended lock state (updated synchronously, unlike React state)
	// This is needed because when lock() and setState() are called in sequence,
	// the React state 'lockedBy' may still be stale (null) when setState runs
	const intendedLockedByRef = useRef<string | null>(lockedBy)

	// Stabilize interpolateConfig to prevent infinite loops from inline objects
	const interpolateConfigRef = useRef(interpolateConfig)
	const interpolateConfigKey = interpolateConfig ? JSON.stringify(interpolateConfig) : null
	useEffect(() => {
		interpolateConfigRef.current = interpolateConfig
	}, [interpolateConfigKey])

	// Keep callback refs updated
	useEffect(() => {
		onStateChangeRef.current = onStateChange
		onSyncStatusChangeRef.current = onSyncStatusChange
		onConflictRef.current = onConflict
	}, [onStateChange, onSyncStatusChange, onConflict])

	// Track if current client is lock holder (for skipping interpolation)
	const isLockHolder = lockable && lockedBy === clientId
	const isLockHolderRef = useRef(isLockHolder)
	isLockHolderRef.current = isLockHolder

	// Target state ref for interpolation (updated without restarting animation)
	const targetStateRef = useRef<T | undefined>(state)
	const isAnimatingRef = useRef(false)

	// Ref to track current display state for interpolation checks (avoids stale closures)
	const displayStateRef = useRef<T | undefined>(displayState)

	// Start interpolation animation toward target
	const startInterpolation = useCallback(() => {
		// Don't start if already animating or no config
		if (isAnimatingRef.current || !interpolateConfigRef.current) {
			return
		}

		isAnimatingRef.current = true

		const animate = () => {
			const target = targetStateRef.current
			const current = displayStateRef.current
			const config = interpolateConfigRef.current

			// Stop if we're the lock holder (they get instant updates)
			if (isLockHolderRef.current) {
				isAnimatingRef.current = false
				return
			}

			// Stop if no config or no state
			if (!config || !current || !target) {
				isAnimatingRef.current = false
				setDisplayState(target)
				return
			}

			// Check if we need to interpolate
			let needsInterpolation = false
			for (const key in config) {
				if (
					typeof current[key] === 'number' &&
					typeof target[key] === 'number' &&
					Math.abs((current[key] as number) - (target[key] as number)) > 0.001
				) {
					needsInterpolation = true
					break
				}
			}

			// Stop animation when caught up
			if (!needsInterpolation) {
				isAnimatingRef.current = false
				// Snap to target to ensure exact final position
				if (current !== target) {
					setDisplayState(target)
				}
				return
			}

			// Interpolate and continue
			const interpolated = interpolateState(current, target, config)
			displayStateRef.current = interpolated
			setDisplayState(interpolated)
			animationFrameRef.current = requestAnimationFrame(animate)
		}

		animationFrameRef.current = requestAnimationFrame(animate)
	}, [])

	// Update target state when state changes
	useEffect(() => {
		targetStateRef.current = state

		// If we're the lock holder OR no interpolation config, apply state directly
		if (isLockHolderRef.current || !interpolateConfigRef.current) {
			displayStateRef.current = state
			setDisplayState(state)
			return
		}

		// Start interpolation toward new target (if not already running)
		startInterpolation()
	}, [state, startInterpolation])

	// Keep displayStateRef in sync
	useEffect(() => {
		displayStateRef.current = displayState
	}, [displayState])

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			isAnimatingRef.current = false
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current)
			}
		}
	}, [])

	// Track connection status for stale detection
	useEffect(() => {
		if (hasSyncedRef.current) {
			const isStale = !isConnected
			setSyncStatus((prev) => {
				if (prev.stale !== isStale) {
					const newStatus: SyncStatus = { ...prev, stale: isStale }
					onSyncStatusChangeRef.current?.(newStatus)
					return newStatus
				}
				return prev
			})
		}
	}, [isConnected])

	// Track state changes and update sync status
	useEffect(() => {
		const prevState = prevStateRef.current
		stateRef.current = state

		// Only process if state actually changed
		if (state === prevState) {
			return
		}

		prevStateRef.current = state

		// Handle conflict resolution
		if (isOptimisticRef.current && state !== optimisticStateRef.current && onConflictRef.current) {
			const resolved = onConflictRef.current(optimisticStateRef.current as T, state as T)
			if (resolved !== state) {
				// Apply resolved state
				setRawState(lockable ? { data: resolved, lockedBy } : resolved)
			}
			isOptimisticRef.current = false
			optimisticStateRef.current = undefined
		}

		// Mark as synced once we receive state
		if (!hasSyncedRef.current && state !== undefined) {
			hasSyncedRef.current = true
		}

		// Update sync status when state changes
		if (hasSyncedRef.current) {
			const newStatus: SyncStatus = {
				synced: true,
				syncing: false,
				stale: !isConnected,
				lastSyncedAt: Date.now()
			}
			setSyncStatus(newStatus)
			onSyncStatusChangeRef.current?.(newStatus)
		}

		// Notify state change callback
		if (onStateChangeRef.current) {
			onStateChangeRef.current(state as T, prevState as T | undefined)
		}
	}, [state, isConnected, lockable, lockedBy, setRawState])

	// Cleanup throttle timeout on unmount
	useEffect(() => {
		return () => {
			if (throttleTimeoutRef.current) {
				clearTimeout(throttleTimeoutRef.current)
			}
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current)
			}
		}
	}, [])

	// Wrapped setState with throttling, optimistic updates, and lockable support
	const setState: SyncBoxSetState<T> = useCallback(
		(newState: Partial<T> | ((prev: T) => T), options?: SetStateOptions) => {
			const { optimistic = false, throttle: callThrottle } = options || {}

			// Determine effective throttle
			const effectiveThrottle = callThrottle ?? (typeof throttleConfig === 'number' ? throttleConfig : undefined)

			// Helper to compute new state value
			const computeNewState = (prev: T | undefined): T => {
				if (typeof newState === 'function') {
					return (newState as (prev: T) => T)(prev as T)
				}
				return { ...(prev as T), ...newState }
			}

			// Helper to actually send the update
			const sendUpdate = (stateToSend: T) => {
				// Mark as syncing
				setSyncStatus((prev) => {
					const syncingStatus: SyncStatus = { ...prev, syncing: true }
					onSyncStatusChangeRef.current?.(syncingStatus)
					return syncingStatus
				})

				// Wrap for lockable mode - use intendedLockedByRef to preserve lock state
				// (lockedBy from React state may be stale if lock() was just called)
				const wrappedState = lockable
					? { data: stateToSend, lockedBy: intendedLockedByRef.current }
					: stateToSend

				setRawState(wrappedState as Partial<T | LockableState<T | undefined> | undefined>)
				lastUpdateTimeRef.current = Date.now()
			}

			// Handle optimistic update
			if (optimistic) {
				const newValue = computeNewState(stateRef.current)
				isOptimisticRef.current = true
				optimisticStateRef.current = newValue
				// Apply locally immediately
				setDisplayState(newValue)
			}

			// Get the state to send
			const stateToSend = computeNewState(stateRef.current)

			// If no throttling, send immediately
			if (!effectiveThrottle) {
				sendUpdate(stateToSend)
				return
			}

			// Store the latest pending state
			pendingStateRef.current = newState

			const now = Date.now()
			const timeSinceLastUpdate = now - lastUpdateTimeRef.current

			// If enough time has passed, send immediately
			if (timeSinceLastUpdate >= effectiveThrottle) {
				if (throttleTimeoutRef.current) {
					clearTimeout(throttleTimeoutRef.current)
					throttleTimeoutRef.current = null
				}
				sendUpdate(stateToSend)
				pendingStateRef.current = null
				return
			}

			// Otherwise, schedule a send for later (if not already scheduled)
			if (!throttleTimeoutRef.current) {
				const delay = effectiveThrottle - timeSinceLastUpdate
				throttleTimeoutRef.current = setTimeout(() => {
					throttleTimeoutRef.current = null
					if (pendingStateRef.current !== null) {
						const pending = computeNewState(stateRef.current)
						sendUpdate(pending)
						pendingStateRef.current = null
					}
				}, delay)
			}
		},
		[setRawState, throttleConfig, lockable]
	)

	// Keep intendedLockedByRef in sync with actual state from server
	useEffect(() => {
		intendedLockedByRef.current = lockedBy
	}, [lockedBy])

	// Lock context for lockable mode
	const lockContext: LockContext | undefined = useMemo(() => {
		if (!lockable) return undefined

		return {
			isLocked: lockedBy !== null,
			lockedBy,
			isLockHolder: lockedBy === clientId,
			lock: () => {
				if (!lockedBy && !intendedLockedByRef.current) {
					intendedLockedByRef.current = clientId // Update ref immediately
					setRawState({ data: stateRef.current, lockedBy: clientId } as Partial<
						T | LockableState<T | undefined> | undefined
					>)
				}
			},
			unlock: () => {
				if (lockedBy === clientId || intendedLockedByRef.current === clientId) {
					intendedLockedByRef.current = null // Update ref immediately
					setRawState({ data: stateRef.current, lockedBy: null } as Partial<
						T | LockableState<T | undefined> | undefined
					>)
				}
			}
		}
	}, [lockable, lockedBy, clientId, setRawState])

	// Get state function
	const getState = useCallback(() => stateRef.current, [])

	// Get sync status function
	const getSyncStatus = useCallback(() => syncStatus, [syncStatus])

	// Expose imperative handle
	useImperativeHandle(
		ref,
		() => ({
			getState,
			setState,
			getSyncStatus,
			lock: lockContext
		}),
		[getState, setState, getSyncStatus, lockContext]
	)

	// Determine what to render as children
	const renderContent = () => {
		// Use state directly when lock holder (immediate feedback), otherwise use displayState for interpolation
		const useInterpolation = interpolateConfigRef.current && !isLockHolder
		const effectiveState = useInterpolation ? displayState : state

		// Check if children is a render function
		if (typeof children === 'function') {
			return (children as SyncBoxRenderFunction<T, ClientData>)(
				effectiveState,
				setState,
				syncStatus,
				context,
				lockContext
			)
		}
		return children
	}

	// Handle as={null} for no wrapper
	if (Component === null) {
		return <Fragment>{renderContent()}</Fragment>
	}

	// Render the wrapper element
	return (
		<Component style={style} className={className}>
			{renderContent()}
		</Component>
	)
}

/**
 * A synced container component that synchronizes arbitrary state across clients.
 *
 * SyncBox is general-purpose - apps define their own logic for what to sync
 * (position, rotation, custom game state, etc.) and how to use it.
 *
 * Features:
 * - Automatic zone prefix inheritance (works with SyncZone)
 * - Imperative API via ref (getState, setState, getSyncStatus)
 * - Render props support with setState passed directly
 * - Lockable mode for exclusive ownership
 * - Interpolation for smooth remote updates
 * - Per-field or global throttling
 * - Optimistic updates with conflict resolution
 * - Optional wrapper element (as={null} for none)
 *
 * @example
 * // With lockable (automatic ownership tracking)
 * <SyncBox id={['ball']} initialState={{ x: 0, y: 0 }} lockable>
 *   {(state, setState, status, context, lock) => (
 *     <div
 *       onMouseDown={() => lock?.lock()}
 *       onMouseUp={() => lock?.unlock()}
 *       style={{ cursor: lock?.isLocked ? (lock.isLockHolder ? 'grabbing' : 'not-allowed') : 'grab' }}
 *     />
 *   )}
 * </SyncBox>
 *
 * @example
 * // With interpolation for smooth movement
 * <SyncBox
 *   id={['cursor']}
 *   initialState={{ x: 0.5, y: 0.5 }}
 *   interpolate={{ x: 0.15, y: 0.15 }}
 * >
 *   {(state) => <Cursor x={state?.x} y={state?.y} />}
 * </SyncBox>
 *
 * @example
 * // With optimistic updates
 * <SyncBox id={['counter']} initialState={{ count: 0 }}>
 *   {(state, setState) => (
 *     <button onClick={() => setState({ count: (state?.count ?? 0) + 1 }, { optimistic: true })}>
 *       {state?.count}
 *     </button>
 *   )}
 * </SyncBox>
 *
 * @example
 * // No wrapper element
 * <SyncBox as={null} id={['data']} initialState={{ value: '' }}>
 *   {(state, setState) => <input value={state?.value} onChange={e => setState({ value: e.target.value })} />}
 * </SyncBox>
 */
export const SyncBox = forwardRef(SyncBoxInner) as <T = unknown, ClientData = unknown>(
	props: SyncBoxProps<T, ClientData> & { ref?: React.ForwardedRef<SyncBoxHandle<T>> }
) => React.ReactElement
