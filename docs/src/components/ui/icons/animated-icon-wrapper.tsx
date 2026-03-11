"use client"

import { cloneElement, isValidElement, useEffect, useRef, type ReactElement } from "react"

interface AnimatedIconWrapperProps {
	children: ReactElement
}

/**
 * Wraps an animated icon and attaches hover listeners to the nearest
 * interactive ancestor (link, button, menu item) so the icon animates
 * when the full parent container is hovered — not just the icon itself.
 *
 * Falls back to the wrapper element when no suitable parent is found.
 */
export function AnimatedIconWrapper({ children }: AnimatedIconWrapperProps) {
	const iconRef = useRef<{ startAnimation: () => void; stopAnimation: () => void } | null>(null)
	const containerRef = useRef<HTMLSpanElement>(null)

	useEffect(() => {
		const el = containerRef.current
		if (!el) return

		const parent = el.closest("a, button, [role='treeitem'], [role='menuitem']") ?? el

		const start = () => iconRef.current?.startAnimation()
		const stop = () => iconRef.current?.stopAnimation()

		parent.addEventListener("mouseenter", start)
		parent.addEventListener("mouseleave", stop)

		return () => {
			parent.removeEventListener("mouseenter", start)
			parent.removeEventListener("mouseleave", stop)
		}
	}, [])

	if (!isValidElement(children)) return children

	return (
		<span ref={containerRef} className="inline-flex">
			{cloneElement(children as ReactElement<{ ref?: React.Ref<unknown> }>, { ref: iconRef })}
		</span>
	)
}
