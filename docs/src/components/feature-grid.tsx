"use client"

import * as React from "react"
import { useRef, useEffect, isValidElement, cloneElement } from "react"
import { ExaShape } from "./ui/exa-shape"
import { ExaGrow } from "./ui/exa-grow"

interface FeatureGridProps {
	children: React.ReactNode
}

export function FeatureGrid({ children }: FeatureGridProps) {
	return (
		<div className="not-prose grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
			{children}
		</div>
	)
}

interface FeatureProps {
	icon?: React.ReactNode
	title: string
	description?: string
}

interface IconHandle {
	startAnimation: () => void
	stopAnimation: () => void
}

const DefaultIcon = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width={20}
		height={20}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="square"
		strokeLinejoin="miter"
	>
		<path d="M13 2L4 14h7l-2 8 9-12h-7z" />
	</svg>
)

export function Feature({ icon, title, description }: FeatureProps) {
	const cardRef = useRef<HTMLDivElement>(null)
	const iconRef = useRef<IconHandle>(null)

	// Animate the icon when the entire card is hovered
	useEffect(() => {
		const node = cardRef.current
		if (!node) return

		const handleEnter = () => iconRef.current?.startAnimation()
		const handleLeave = () => iconRef.current?.stopAnimation()

		node.addEventListener("mouseenter", handleEnter)
		node.addEventListener("mouseleave", handleLeave)
		node.addEventListener("touchstart", handleEnter)
		node.addEventListener("touchend", handleLeave)
		node.addEventListener("touchcancel", handleLeave)

		return () => {
			node.removeEventListener("mouseenter", handleEnter)
			node.removeEventListener("mouseleave", handleLeave)
			node.removeEventListener("touchstart", handleEnter)
			node.removeEventListener("touchend", handleLeave)
			node.removeEventListener("touchcancel", handleLeave)
		}
	}, [])

	// Clone the icon to inject our ref so it switches to controlled mode
	const renderedIcon = isValidElement(icon)
		? cloneElement(icon as React.ReactElement<{ ref?: React.Ref<IconHandle> }>, { ref: iconRef })
		: icon ?? <DefaultIcon />

	return (
		<ExaGrow scale={1.03}>
			<div ref={cardRef} className="relative w-full h-full flex flex-col">
				<ExaShape highlight innerBorderWidth={1} slope={12} style={{ flex: 1 }}>
					<div className="flex flex-col items-center text-center gap-2 p-4 h-full justify-center">
						<div className="text-muted-foreground [&_svg]:size-5">
							{renderedIcon}
						</div>
						<h4 className="text-sm font-medium leading-tight">{title}</h4>
						{description && (
							<p className="text-xs text-muted-foreground leading-snug">{description}</p>
						)}
					</div>
				</ExaShape>
			</div>
		</ExaGrow>
	)
}
