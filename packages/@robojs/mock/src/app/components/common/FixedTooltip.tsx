import { createPortal } from 'react-dom'
import { useRef, useState } from 'react'

interface FixedTooltipProps {
	label: string
	children: React.ReactNode
}

/**
 * Tooltip that portals to document.body so it won't be clipped
 * by overflow containers or broken by parent transforms.
 */
export function FixedTooltip({ label, children }: FixedTooltipProps) {
	const [show, setShow] = useState(false)
	const [pos, setPos] = useState({ top: 0, left: 0 })
	const triggerRef = useRef<HTMLDivElement>(null)

	const handleMouseEnter = () => {
		if (triggerRef.current) {
			const rect = triggerRef.current.getBoundingClientRect()
			setPos({
				top: rect.top - 6,
				left: rect.left + rect.width / 2
			})
		}
		setShow(true)
	}

	return (
		<div
			ref={triggerRef}
			style={{ position: 'relative', display: 'inline-flex' }}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={() => setShow(false)}
		>
			{children}
			{show &&
				createPortal(
					<div
						style={{
							position: 'fixed',
							top: pos.top,
							left: pos.left,
							transform: 'translate(-50%, -100%)',
							padding: '6px 10px',
							borderRadius: 6,
							background: '#111214',
							boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
							fontSize: 12,
							fontWeight: 600,
							color: '#fff',
							whiteSpace: 'nowrap',
							zIndex: 9999,
							pointerEvents: 'none'
						}}
					>
						{label}
					</div>,
					document.body
				)}
		</div>
	)
}
