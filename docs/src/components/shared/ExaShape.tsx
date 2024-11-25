import React, { useState, useRef, useEffect } from 'react'

interface ExaShapeProps {
	accentColor?: string
	accentLineWidth?: number
	autoWidth?: boolean
	children?: React.ReactElement
	defaultHeight?: number
	defaultWidth?: number
	highlight?: boolean
	innerBorderWidth?: number
	innerColor?: string
	outerColor?: string
	slope?: number
}

export const ExaShape = (props: ExaShapeProps) => {
	let {
		accentColor = '#489178',
		accentLineWidth = 0,
		autoWidth = true,
		children,
		defaultHeight = 48,
		defaultWidth = 100,
		highlight = true,
		innerBorderWidth = 1,
		innerColor = 'var(--card-background-color)',
		outerColor = 'var(--ifm-color-emphasis-200)',
		slope = 24
	} = props
	const [dimensions, setDimensions] = useState({
		width: defaultWidth,
		height: defaultHeight
	})
	const { width, height } = dimensions
	const containerRef = useRef(null)

	// Listen for hover events on containerRef
	const [isHovering, setHovering] = useState(false)

	useEffect(() => {
		const node = containerRef.current
		if (node) {
			node.addEventListener('mouseenter', () => setHovering(true))
			node.addEventListener('mouseleave', () => setHovering(false))
			return () => {
				node.removeEventListener('mouseenter', () => setHovering(true))
				node.removeEventListener('mouseleave', () => setHovering(false))
			}
		}
	}, [containerRef.current])

	// Highlight the shape when hovering
	if (isHovering && highlight) {
		outerColor = 'var(--ifm-color-primary)'
	}

	const outerD = `
    M 0,${slope}
    L ${slope},0
    L ${width - slope},0
    L ${width},0
    L ${width},${height - slope}
    L ${width - slope},${height}
    L ${slope},${height}
    L 0,${height}
    Z
  `

	const innerD = `
    M ${innerBorderWidth},${slope + innerBorderWidth}
    L ${slope + innerBorderWidth},${innerBorderWidth}
    L ${width - slope - innerBorderWidth},${innerBorderWidth}
    L ${width - innerBorderWidth},${innerBorderWidth}
    L ${width - innerBorderWidth},${height - slope - innerBorderWidth}
    L ${width - slope - innerBorderWidth},${height - innerBorderWidth}
    L ${slope + innerBorderWidth},${height - innerBorderWidth}
    L ${innerBorderWidth},${height - innerBorderWidth}
    Z
  `

	useEffect(() => {
		const observer = new ResizeObserver((entries) => {
			for (let entry of entries) {
				// Get full size including padding and border
				const rect = entry.target.getBoundingClientRect()
				const width = rect.width
				const height = rect.height

				// Get computed styles for padding
				const style = window.getComputedStyle(entry.target)
				const paddingLeft = parseFloat(style.paddingLeft)
				const paddingRight = parseFloat(style.paddingRight)
				const paddingTop = parseFloat(style.paddingTop)
				const paddingBottom = parseFloat(style.paddingBottom)

				// Adjust dimensions to exclude padding if needed
				const adjustedWidth = width
				const adjustedHeight = height

				setDimensions({
					width: adjustedWidth,
					height: adjustedHeight
				})
			}
		})
		if (containerRef.current) {
			observer.observe(containerRef.current)
		}
		return () => {
			if (containerRef.current) {
				observer.unobserve(containerRef.current)
			}
		}
	}, [])

	return (
		<>
			<svg
				width={width}
				height={height}
				style={{
					width,
					height,
					position: 'absolute',
					top: 0,
					bottom: 0,
					zIndex: -1
				}}
				xmlns="http://www.w3.org/2000/svg"
			>
				<path
					d={outerD}
					fill={outerColor}
					style={{
						boxShadow: '0 3px 6px 0 #0003',
						transition: 'fill 0.4s ease-in-out'
					}}
				/>
				<path d={innerD} fill={innerColor} />
				<path
					d={`M ${slope + accentLineWidth / 4},0 L ${width},0`}
					stroke={accentColor}
					strokeWidth={accentLineWidth}
					style={{
						boxShadow: '0 3px 6px 0 #0003'
					}}
					fill="none"
				/>
				<path
					d={`M 0,${slope + accentLineWidth / 2} L ${slope + accentLineWidth / 2},0`}
					stroke={accentColor}
					strokeWidth={accentLineWidth / 2}
					fill="none"
				/>
			</svg>
			{children &&
				React.cloneElement(children, {
					ref: containerRef
				})}
		</>
	)
}
