import { useEffect, useState, useRef, RefObject } from 'react'

/**
 * useElementStuck Hook
 * Detects when an element becomes sticky and returns a ref to be attached to the sentinel.
 *
 * @returns {Object} - Contains the ref for the sentinel and a boolean indicating sticky state.
 */
export const useElementStuck = (): {
	sentinelRef: RefObject<HTMLDivElement>
	isStuck: boolean
} => {
	const [isStuck, setIsStuck] = useState<boolean>(false)
	const sentinelRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const sentinel = sentinelRef.current
		if (!sentinel) {
			return
		}

		const observer = new IntersectionObserver(
			([entry]) => {
				// If the sentinel is not intersecting, the target is sticky
				setIsStuck(!entry.isIntersecting)
			},
			{
				root: null, // Use the viewport as the root
				threshold: 0,
				rootMargin: `-${sentinel.getBoundingClientRect().height}px 0px 0px 0px`
			}
		)

		observer.observe(sentinel)
		return () => {
			if (sentinel) {
				observer.unobserve(sentinel)
			}
		}
	}, [])

	return { sentinelRef, isStuck }
}
