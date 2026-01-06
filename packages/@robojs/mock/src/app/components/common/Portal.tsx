import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface PortalProps {
	children: ReactNode
}

export function Portal({ children }: PortalProps) {
	const portalRoot = useRef<HTMLElement | null>(null)

	useEffect(() => {
		let root = document.getElementById('overlay-root')
		if (!root) {
			root = document.createElement('div')
			root.id = 'overlay-root'
			root.style.position = 'fixed'
			root.style.top = '0'
			root.style.left = '0'
			root.style.width = '100%'
			root.style.height = '100%'
			root.style.pointerEvents = 'none'
			root.style.zIndex = '9999'
			document.body.appendChild(root)
		}

		portalRoot.current = root
	}, [])

	if (!portalRoot.current) {
		return null
	}

	return createPortal(children, portalRoot.current)
}
