import React, { CSSProperties, useState, useRef, useEffect, ReactNode } from 'react'

interface ExaZoomProps {
	children: ReactNode
	className?: string
	containerStyle?: CSSProperties
	origin?: string
	scale?: number
	style?: CSSProperties
	transitionDuration?: string
}

export const ExaZoom = (props: ExaZoomProps) => {
	const {
		children,
		className,
		containerStyle: innerContainerStyle,
		origin,
		scale = 1.06,
		style,
		transitionDuration = '0.3s'
	} = props
	const [isHovered, setIsHovered] = useState(false)
	const containerRef = useRef<HTMLDivElement>(null)

	const containerStyle: CSSProperties = {
		display: 'flex',
		overflow: 'hidden',
		position: 'relative',
		...(style ?? {})
	}

	const innerStyle: CSSProperties = {
		display: 'flex',
		transition: `transform ${transitionDuration} ease`,
		transformOrigin: origin,
		transform: isHovered ? `scale(${scale})` : 'scale(1)',
		...(innerContainerStyle ?? {})
	}

	useEffect(() => {
		const node = containerRef.current
		if (node) {
			// Mouse event handlers
			const handleMouseEnter = () => setIsHovered(true)
			const handleMouseLeave = () => setIsHovered(false)

			// Touch event handlers
			const handleTouchStart = () => setIsHovered(true)
			const handleTouchEnd = () => setIsHovered(false)
			const handleTouchCancel = () => setIsHovered(false)
			const handleTouchMove = () => setIsHovered(false)

			// Add mouse event listeners
			node.addEventListener('mouseenter', handleMouseEnter)
			node.addEventListener('mouseleave', handleMouseLeave)

			// Add touch event listeners
			node.addEventListener('touchstart', handleTouchStart)
			node.addEventListener('touchend', handleTouchEnd)
			node.addEventListener('touchcancel', handleTouchCancel)
			node.addEventListener('touchmove', handleTouchMove)

			// Cleanup event listeners on unmount
			return () => {
				node.removeEventListener('mouseenter', handleMouseEnter)
				node.removeEventListener('mouseleave', handleMouseLeave)
				node.removeEventListener('touchstart', handleTouchStart)
				node.removeEventListener('touchend', handleTouchEnd)
				node.removeEventListener('touchcancel', handleTouchCancel)
				node.removeEventListener('touchmove', handleTouchMove)
			}
		}
	}, [])

	return (
		<div ref={containerRef} style={containerStyle} className={className}>
			<div style={innerStyle}>{children}</div>
		</div>
	)
}
