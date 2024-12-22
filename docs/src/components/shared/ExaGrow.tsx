import React, { CSSProperties, useState, useRef, useEffect } from 'react'

interface GrowOnHoverProps {
	children: React.ReactNode
	className?: string
	scale?: number
	style?: React.CSSProperties
}

export const ExaGrow = (props: GrowOnHoverProps) => {
	const { children, className, scale = 1.1, style } = props
	const [isHovered, setIsHovered] = useState(false)
	const divRef = useRef<HTMLDivElement>(null)

	const combinedStyle: CSSProperties = {
		display: 'flex',
		transition: 'transform 0.3s',
		transform: isHovered ? `scale(${scale})` : 'scale(1)',
		...style
	}

	useEffect(() => {
		const node = divRef.current
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
		<div ref={divRef} className={className} style={combinedStyle}>
			{children}
		</div>
	)
}
