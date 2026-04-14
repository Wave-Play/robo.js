import { SyncContext } from './context.js'
import { useZoneKey } from './SyncZone.js'
import { useSyncState } from './useSyncState.js'
import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { InterpolateConfig, LockContext, SyncContext as SyncContextType } from './types.js'

/**
 * Bounds configuration for draggable elements.
 */
export interface DragBounds {
	minX?: number
	maxX?: number
	minY?: number
	maxY?: number
}

/**
 * Options for useSyncDrag hook.
 */
export interface DragOptions<T> {
	/** Smooth remote updates with linear interpolation (field -> lerp factor 0-1) */
	interpolate?: InterpolateConfig<T>
	/** Milliseconds between updates (default: 16) */
	throttle?: number
	/** Constrain position within bounds */
	bounds?: DragBounds
	/** Convert to 0-1 viewport coordinates (default: true) */
	normalize?: boolean
	/** Automatically lock when dragging starts (default: true) */
	lockOnDrag?: boolean
}

/**
 * Base state shape for draggable elements.
 */
export interface DragState {
	x: number
	y: number
	[key: string]: unknown
}

/**
 * Result returned by useSyncDrag hook.
 */
export interface DragResult<T extends DragState, ClientData = unknown> {
	/** Current state (may be interpolated for remote updates) */
	state: T
	/** Update state (partial or updater function) */
	setState: (update: Partial<T> | ((prev: T) => T)) => void
	/** Whether current client is dragging */
	isDragging: boolean
	/** Whether anyone is dragging (locked) */
	isBeingDragged: boolean
	/** Whether current client can interact (not locked by others) */
	canInteract: boolean
	/** Handlers to spread onto draggable element */
	dragHandlers: {
		onMouseDown: (e: React.MouseEvent) => void
		onTouchStart: (e: React.TouchEvent) => void
	}
	/** Lock context for advanced usage */
	lock: LockContext | undefined
	/** Sync context for client awareness */
	context: SyncContextType<ClientData>
}

// Internal lockable state wrapper
interface LockableState<T> {
	data: T
	lockedBy: string | null
}

// Linear interpolation
function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t
}

// Apply interpolation to state
function interpolateState<T extends DragState>(current: T, target: T, config: InterpolateConfig<T>): T {
	const result = { ...target }
	for (const key in config) {
		const factor = config[key]
		if (factor !== undefined && typeof current[key] === 'number' && typeof target[key] === 'number') {
			;(result as Record<string, unknown>)[key] = lerp(current[key] as number, target[key] as number, factor)
		}
	}
	return result
}

/**
 * Hook for creating draggable elements with synchronized positions.
 *
 * Handles locking, interpolation, bounds, and gesture detection automatically.
 * Returns handlers to spread onto your draggable element.
 *
 * @example
 * function DraggableBall({ id }: { id: string }) {
 *   const { state, isDragging, canInteract, dragHandlers } = useSyncDrag(
 *     ['ball', id],
 *     { x: 0.5, y: 0.5 },
 *     { interpolate: { x: 0.2, y: 0.2 }, bounds: { minX: 0.05, maxX: 0.95, minY: 0.05, maxY: 0.95 } }
 *   )
 *
 *   return (
 *     <div
 *       {...dragHandlers}
 *       style={{
 *         position: 'absolute',
 *         left: `${state.x * 100}%`,
 *         top: `${state.y * 100}%`,
 *         cursor: isDragging ? 'grabbing' : canInteract ? 'grab' : 'not-allowed'
 *       }}
 *     >
 *       Ball
 *     </div>
 *   )
 * }
 */
export function useSyncDrag<T extends DragState = DragState, ClientData = unknown>(
	key: (string | null)[],
	initialState: T,
	options?: DragOptions<T>
): DragResult<T, ClientData> {
	const { interpolate, throttle = 16, bounds, normalize = true, lockOnDrag = true } = options ?? {}

	// Get client ID from context
	const { clientId, connected, ws } = useContext(SyncContext)

	// Compute full key with zone prefix (matches SyncBox behavior)
	const fullKey = useZoneKey(key)

	// Store interpolate config in a ref to avoid closure issues in animation loop
	const interpolateRef = useRef(interpolate)
	useEffect(() => {
		interpolateRef.current = interpolate
	}, [interpolate])

	// Wrapped initial state for lockable mode (use ref to keep stable reference)
	const wrappedInitialStateRef = useRef<LockableState<T>>({ data: initialState, lockedBy: null })

	// Sync the lockable state
	const [rawState, setRawState, context] = useSyncState<LockableState<T>, ClientData>(
		wrappedInitialStateRef.current,
		fullKey
	)

	// Extract data and lock info
	const state = rawState?.data ?? initialState
	const lockedBy = rawState?.lockedBy ?? null
	const isLocked = lockedBy !== null
	const isLockHolder = lockedBy === clientId

	// Local dragging state
	const [isDragging, setIsDragging] = useState(false)

	// Display state for interpolation
	const [displayState, setDisplayState] = useState<T>(state)

	// Refs for stable values in callbacks
	const stateRef = useRef(state)
	const displayStateRef = useRef(displayState)
	const isDraggingRef = useRef(isDragging)
	const isLockHolderRef = useRef(isLockHolder)
	const lockedByRef = useRef(lockedBy)
	const targetStateRef = useRef<T>(state)

	// Throttling refs
	const lastUpdateRef = useRef(0)
	const throttleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const pendingStateRef = useRef<Partial<T> | null>(null)

	// Animation refs
	const animationFrameRef = useRef<number | null>(null)
	const isAnimatingRef = useRef(false)

	// Keep refs in sync
	useEffect(() => {
		stateRef.current = state
		targetStateRef.current = state
	}, [state])

	useEffect(() => {
		displayStateRef.current = displayState
	}, [displayState])

	useEffect(() => {
		isDraggingRef.current = isDragging
	}, [isDragging])

	useEffect(() => {
		isLockHolderRef.current = isLockHolder
	}, [isLockHolder])

	useEffect(() => {
		lockedByRef.current = lockedBy
	}, [lockedBy])

	// Start interpolation animation
	const startInterpolation = useCallback(() => {
		const config = interpolateRef.current
		if (!config) return

		// Cancel any existing animation and restart fresh
		if (animationFrameRef.current) {
			cancelAnimationFrame(animationFrameRef.current)
		}

		isAnimatingRef.current = true

		const animate = () => {
			const target = targetStateRef.current
			const current = displayStateRef.current
			const currentConfig = interpolateRef.current

			// Lock holder sees instant updates
			if (isLockHolderRef.current) {
				isAnimatingRef.current = false
				return
			}

			// If interpolate config was removed, stop and snap to target
			if (!currentConfig) {
				isAnimatingRef.current = false
				if (current !== target) {
					setDisplayState(target)
				}
				return
			}

			// Check if we need to keep interpolating
			let needsInterpolation = false
			for (const key in currentConfig) {
				if (
					typeof current[key] === 'number' &&
					typeof target[key] === 'number' &&
					Math.abs((current[key] as number) - (target[key] as number)) > 0.001
				) {
					needsInterpolation = true
					break
				}
			}

			if (!needsInterpolation) {
				isAnimatingRef.current = false
				if (current !== target) {
					setDisplayState(target)
				}
				return
			}

			const interpolated = interpolateState(current, target, currentConfig)
			displayStateRef.current = interpolated
			setDisplayState(interpolated)
			animationFrameRef.current = requestAnimationFrame(animate)
		}

		animationFrameRef.current = requestAnimationFrame(animate)
	}, []) // No dependencies - uses refs for all values

	// Handle remote state updates
	useEffect(() => {
		if (isLockHolder) {
			// Lock holder sees instant updates
			setDisplayState(state)
		} else if (interpolateRef.current) {
			// Start interpolation for remote updates
			targetStateRef.current = state
			startInterpolation()
		} else {
			// No interpolation, instant update
			setDisplayState(state)
		}
	}, [state, isLockHolder, startInterpolation])

	// Cleanup animation on unmount
	useEffect(() => {
		return () => {
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current)
			}
			if (throttleTimeoutRef.current) {
				clearTimeout(throttleTimeoutRef.current)
			}
		}
	}, [])

	// Apply bounds to position
	const applyBounds = useCallback(
		(x: number, y: number): { x: number; y: number } => {
			if (!bounds) return { x, y }
			return {
				x: Math.max(bounds.minX ?? -Infinity, Math.min(bounds.maxX ?? Infinity, x)),
				y: Math.max(bounds.minY ?? -Infinity, Math.min(bounds.maxY ?? Infinity, y))
			}
		},
		[bounds]
	)

	// Send state update with throttling
	const sendUpdate = useCallback(
		(update: Partial<T>) => {
			const newData = { ...stateRef.current, ...update }
			setRawState({
				data: newData,
				lockedBy: lockedByRef.current
			})
			lastUpdateRef.current = Date.now()
		},
		[setRawState]
	)

	// Set state with throttling
	const setState = useCallback(
		(update: Partial<T> | ((prev: T) => T)) => {
			const newUpdate = typeof update === 'function' ? update(stateRef.current) : update

			// Apply bounds if x or y changed
			let finalUpdate = newUpdate
			if ('x' in newUpdate || 'y' in newUpdate) {
				const bounded = applyBounds(
					(newUpdate as Partial<DragState>).x ?? stateRef.current.x,
					(newUpdate as Partial<DragState>).y ?? stateRef.current.y
				)
				finalUpdate = { ...newUpdate, ...bounded } as Partial<T>
			}

			// Optimistic local update for lock holder
			if (isLockHolderRef.current) {
				const newState = { ...stateRef.current, ...finalUpdate }
				stateRef.current = newState
				displayStateRef.current = newState
				setDisplayState(newState)
			}

			// Throttled send
			const now = Date.now()
			const timeSinceLastUpdate = now - lastUpdateRef.current

			if (timeSinceLastUpdate >= throttle) {
				sendUpdate(finalUpdate)
				if (throttleTimeoutRef.current) {
					clearTimeout(throttleTimeoutRef.current)
					throttleTimeoutRef.current = null
				}
				pendingStateRef.current = null
			} else {
				pendingStateRef.current = { ...(pendingStateRef.current ?? {}), ...finalUpdate }
				if (!throttleTimeoutRef.current) {
					throttleTimeoutRef.current = setTimeout(() => {
						if (pendingStateRef.current) {
							sendUpdate(pendingStateRef.current)
							pendingStateRef.current = null
						}
						throttleTimeoutRef.current = null
					}, throttle - timeSinceLastUpdate)
				}
			}
		},
		[applyBounds, throttle, sendUpdate]
	)

	// Lock functions
	const lock = useCallback(() => {
		if (!connected || !ws || isLocked) return
		lockedByRef.current = clientId
		setRawState({
			data: stateRef.current,
			lockedBy: clientId
		})
	}, [connected, ws, isLocked, clientId, setRawState])

	const unlock = useCallback(() => {
		if (!connected || !ws || !isLockHolder) return
		lockedByRef.current = null
		// Send any pending state before unlocking
		if (pendingStateRef.current) {
			setRawState({
				data: { ...stateRef.current, ...pendingStateRef.current },
				lockedBy: null
			})
			pendingStateRef.current = null
		} else {
			setRawState({
				data: stateRef.current,
				lockedBy: null
			})
		}
	}, [connected, ws, isLockHolder, setRawState])

	// Lock context object
	const lockContext: LockContext = {
		isLocked,
		lockedBy,
		isLockHolder,
		lock,
		unlock
	}

	// Global mouse/touch handlers for dragging
	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			if (!isDraggingRef.current) return

			const x = normalize ? e.clientX / window.innerWidth : e.clientX
			const y = normalize ? e.clientY / window.innerHeight : e.clientY
			setState({ x, y } as Partial<T>)
		}

		const handleMouseUp = () => {
			if (!isDraggingRef.current) return
			setIsDragging(false)
			if (lockOnDrag) {
				unlock()
			}
		}

		const handleTouchMove = (e: TouchEvent) => {
			if (!isDraggingRef.current || e.touches.length === 0) return

			const touch = e.touches[0]
			const x = normalize ? touch.clientX / window.innerWidth : touch.clientX
			const y = normalize ? touch.clientY / window.innerHeight : touch.clientY
			setState({ x, y } as Partial<T>)
		}

		const handleTouchEnd = () => {
			if (!isDraggingRef.current) return
			setIsDragging(false)
			if (lockOnDrag) {
				unlock()
			}
		}

		document.addEventListener('mousemove', handleMouseMove)
		document.addEventListener('mouseup', handleMouseUp)
		document.addEventListener('touchmove', handleTouchMove)
		document.addEventListener('touchend', handleTouchEnd)

		return () => {
			document.removeEventListener('mousemove', handleMouseMove)
			document.removeEventListener('mouseup', handleMouseUp)
			document.removeEventListener('touchmove', handleTouchMove)
			document.removeEventListener('touchend', handleTouchEnd)
		}
	}, [normalize, lockOnDrag, setState, unlock])

	// Drag handlers to spread onto element
	const dragHandlers = {
		onMouseDown: (e: React.MouseEvent) => {
			if (isLocked && !isLockHolder) return // Can't interact if locked by others

			e.preventDefault()
			setIsDragging(true)

			if (lockOnDrag) {
				lock()
			}

			// Update position immediately
			const x = normalize ? e.clientX / window.innerWidth : e.clientX
			const y = normalize ? e.clientY / window.innerHeight : e.clientY
			setState({ x, y } as Partial<T>)
		},
		onTouchStart: (e: React.TouchEvent) => {
			if (isLocked && !isLockHolder) return // Can't interact if locked by others

			if (e.touches.length === 0) return

			setIsDragging(true)

			if (lockOnDrag) {
				lock()
			}

			const touch = e.touches[0]
			const x = normalize ? touch.clientX / window.innerWidth : touch.clientX
			const y = normalize ? touch.clientY / window.innerHeight : touch.clientY
			setState({ x, y } as Partial<T>)
		}
	}

	return {
		state: displayState,
		setState,
		isDragging,
		isBeingDragged: isLocked,
		canInteract: !isLocked || isLockHolder,
		dragHandlers,
		lock: lockContext,
		context
	}
}
