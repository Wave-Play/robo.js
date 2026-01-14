import { useEffect } from 'react'
import { DropdownContainer, useDropdownPosition } from '../base'
import styles from './EmojiPicker.module.css'

interface EmojiPickerProps {
	onSelect: (emoji: string) => void
	onClose: () => void
	position: { x: number; y: number }
}

// Common emoji set for MVP
const EMOJI_LIST = [
	// Reactions
	':)',
	':-)',
	':D',
	':-D',
	';)',
	';-)',
	':P',
	':-P',
	'XD',
	'xD',
	// Common
	':(',
	':-(',
	":'(",
	':|',
	':-|',
	':/',
	':-/',
	':O',
	':-O',
	':3',
	// Faces
	'^_^',
	'O_o',
	'-_-',
	'>:(',
	'<3',
	'</3',
	':*',
	'B)',
	'8)',
	'T_T'
]

export function EmojiPicker({ onSelect, onClose, position }: EmojiPickerProps) {
	const { dropdownRef, adjustedPosition, isPositioned } = useDropdownPosition({
		position,
		viewportPadding: 8
	})

	// Close on click outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				onClose()
			}
		}

		// Use capture phase to handle click before it bubbles
		document.addEventListener('mousedown', handleClickOutside, true)
		return () => document.removeEventListener('mousedown', handleClickOutside, true)
	}, [onClose, dropdownRef])

	// Close on Escape
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onClose()
			}
		}

		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [onClose])

	return (
		<DropdownContainer
			ref={dropdownRef}
			role="dialog"
			aria-label="Emoji picker"
			className={styles.picker}
			position="fixed"
			coordinates={adjustedPosition}
			isPositioned={isPositioned}
		>
			<div className={styles.grid}>
				{EMOJI_LIST.map((emoji, index) => (
					<button key={`${emoji}-${index}`} className={styles.emoji} onClick={() => onSelect(emoji)} title={emoji}>
						{emoji}
					</button>
				))}
			</div>
		</DropdownContainer>
	)
}
