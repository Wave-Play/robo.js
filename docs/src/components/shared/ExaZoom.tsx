import React, { CSSProperties, MouseEvent, ReactNode } from 'react'

interface ExaZoomProps {
	children: ReactNode
	className?: string
	scale?: number
	style?: CSSProperties
	transitionDuration?: string
}

export const ExaZoom = (props: ExaZoomProps) => {
	const { children, className, scale = 1.06, style, transitionDuration = '0.3s' } = props
	const containerStyle: CSSProperties = {
		display: 'flex',
		overflow: 'hidden',
		position: 'relative',
		...(style ?? {})
	}

	const innerStyle: CSSProperties = {
		display: 'flex',
		transition: `transform ${transitionDuration} ease`
	}

	const handleMouseEnter = (e: MouseEvent<HTMLDivElement>) => {
		;(e.currentTarget.firstChild as HTMLElement).style.transform = `scale(${scale})`
	}

	const handleMouseLeave = (e: MouseEvent<HTMLDivElement>) => {
		;(e.currentTarget.firstChild as HTMLElement).style.transform = 'scale(1)'
	}

	return (
		<div style={containerStyle} className={className} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
			<div style={innerStyle}>{children}</div>
		</div>
	)
}
