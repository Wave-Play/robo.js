import React, { useEffect, useRef } from 'react'
import { useSyncDrag } from './useSyncDrag.js'
import type { DragBounds, DragOptions, DragState } from './useSyncDrag.js'
import type { InterpolateConfig } from './types.js'

/**
 * Render props for SyncDraggable children.
 */
export interface SyncDraggableRenderProps<T extends DragState> {
	/** Current state (position and custom data) */
	state: T
	/** Whether current client is dragging */
	isDragging: boolean
	/** Whether anyone is dragging */
	isBeingDragged: boolean
	/** Whether current client can interact */
	canInteract: boolean
}

/**
 * Props for SyncDraggable component.
 */
export interface SyncDraggableProps<T extends DragState = DragState, _ClientData = unknown> {
	/** Key suffix for state synchronization */
	id: (string | null)[]
	/** Initial state (must include x, y) */
	initial: T
	/** Interpolation config for smooth remote updates */
	interpolate?: InterpolateConfig<T>
	/** Milliseconds between updates */
	throttle?: number
	/** Position bounds */
	bounds?: DragBounds
	/** Use 0-1 viewport coordinates (default: true) */
	normalize?: boolean
	/** Children to render - can be ReactNode or render function */
	children: React.ReactNode | ((props: SyncDraggableRenderProps<T>) => React.ReactNode)
	/** Called when drag starts */
	onDragStart?: (state: T) => void
	/** Called on each drag update */
	onDrag?: (state: T) => void
	/** Called when drag ends */
	onDragEnd?: (state: T) => void
	/** Called when state changes (from any source) */
	onStateChange?: (state: T, prevState: T) => void
	/** CSS styles for wrapper element */
	style?: React.CSSProperties
	/** CSS class name for wrapper element */
	className?: string
	/** Element type to render (default: 'div', null for no wrapper) */
	as?: keyof JSX.IntrinsicElements | null
}

/**
 * Declarative component wrapper for making any element draggable and synchronized.
 *
 * Automatically handles positioning, locking, interpolation, and touch/mouse events.
 *
 * @example
 * // Basic usage
 * <SyncDraggable
 *   id={['ball', '1']}
 *   initial={{ x: 0.5, y: 0.5 }}
 *   interpolate={{ x: 0.2, y: 0.2 }}
 *   bounds={{ minX: 0.05, maxX: 0.95, minY: 0.05, maxY: 0.95 }}
 * >
 *   <div className="ball">Drag me!</div>
 * </SyncDraggable>
 *
 * @example
 * // With render props for custom styling
 * <SyncDraggable
 *   id={['piece', index]}
 *   initial={{ x: 0.1, y: 0.1 }}
 *   interpolate={{ x: 0.15, y: 0.15 }}
 * >
 *   {({ isDragging, canInteract, state }) => (
 *     <div
 *       className="game-piece"
 *       style={{
 *         cursor: isDragging ? 'grabbing' : canInteract ? 'grab' : 'not-allowed',
 *         opacity: isDragging ? 0.8 : 1
 *       }}
 *     >
 *       Piece at ({state.x.toFixed(2)}, {state.y.toFixed(2)})
 *     </div>
 *   )}
 * </SyncDraggable>
 *
 * @example
 * // With lifecycle callbacks
 * <SyncDraggable
 *   id={['card', cardId]}
 *   initial={{ x: 0.5, y: 0.5 }}
 *   onDragStart={(s) => console.log('Started dragging at', s.x, s.y)}
 *   onDragEnd={(s) => console.log('Dropped at', s.x, s.y)}
 * >
 *   <Card />
 * </SyncDraggable>
 */
export function SyncDraggable<T extends DragState = DragState, ClientData = unknown>(
	props: SyncDraggableProps<T, ClientData>
): React.ReactElement | null {
	const {
		id,
		initial,
		interpolate,
		throttle,
		bounds,
		normalize = true,
		children,
		onDragStart,
		onDrag,
		onDragEnd,
		onStateChange,
		style,
		className,
		as: Component = 'div'
	} = props

	const options: DragOptions<T> = {
		interpolate,
		throttle,
		bounds,
		normalize,
		lockOnDrag: true
	}

	const { state, isDragging, isBeingDragged, canInteract, dragHandlers } = useSyncDrag<T, ClientData>(
		id,
		initial,
		options
	)

	// Track previous state for callbacks
	const prevStateRef = useRef<T>(state)
	const prevDraggingRef = useRef(isDragging)

	// Handle lifecycle callbacks
	useEffect(() => {
		// Drag start
		if (isDragging && !prevDraggingRef.current) {
			onDragStart?.(state)
		}

		// Drag end
		if (!isDragging && prevDraggingRef.current) {
			onDragEnd?.(state)
		}

		prevDraggingRef.current = isDragging
	}, [isDragging, state, onDragStart, onDragEnd])

	// Handle state change and drag callbacks
	useEffect(() => {
		const prevState = prevStateRef.current

		// State changed
		if (state !== prevState) {
			onStateChange?.(state, prevState)

			// Drag update (only if currently dragging)
			if (isDragging) {
				onDrag?.(state)
			}
		}

		prevStateRef.current = state
	}, [state, isDragging, onStateChange, onDrag])

	// Build render props
	const renderProps: SyncDraggableRenderProps<T> = {
		state,
		isDragging,
		isBeingDragged,
		canInteract
	}

	// Render children
	const content = typeof children === 'function' ? children(renderProps) : children

	// Default cursor based on state
	const cursor = isDragging ? 'grabbing' : canInteract ? 'grab' : 'not-allowed'

	// Compute position styles
	const positionStyles: React.CSSProperties = normalize
		? {
				position: 'absolute',
				left: `${state.x * 100}%`,
				top: `${state.y * 100}%`,
				transform: 'translate(-50%, -50%)'
			}
		: {
				position: 'absolute',
				left: state.x,
				top: state.y,
				transform: 'translate(-50%, -50%)'
			}

	// No wrapper mode
	if (Component === null) {
		// In no-wrapper mode, we can't attach handlers
		// This is an advanced use case where the user handles everything
		return content as React.ReactElement
	}

	return (
		<Component
			{...dragHandlers}
			className={className}
			style={{
				...positionStyles,
				cursor,
				userSelect: 'none',
				touchAction: 'none',
				...style
			}}
		>
			{content}
		</Component>
	)
}
