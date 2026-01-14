import { useEffect, useMemo, useState } from 'react'
import { DropdownContainer, useDropdownPosition } from '../base'
import styles from './EmojiPicker.module.css'

interface EmojiPickerProps {
	onSelect: (emoji: string) => void
	onClose: () => void
	position?: { x: number; y: number }
}

export const EMOJI_PICKER_WIDTH = 320
export const EMOJI_PICKER_HEIGHT = 260

const EMOJI_CATEGORIES: Array<{
	id: string
	label: string
	icon: string
	emojis: Array<{ emoji: string; name: string }>
}> = [
	{
		id: 'people',
		label: 'People',
		icon: '😀',
		emojis: [
			{ emoji: '😀', name: 'grinning' },
			{ emoji: '😃', name: 'smiley' },
			{ emoji: '😄', name: 'smile' },
			{ emoji: '😁', name: 'grin' },
			{ emoji: '😆', name: 'laughing' },
			{ emoji: '😅', name: 'sweat_smile' },
			{ emoji: '🤣', name: 'rofl' },
			{ emoji: '😂', name: 'joy' },
			{ emoji: '🙂', name: 'slight_smile' },
			{ emoji: '🙃', name: 'upside_down' },
			{ emoji: '😉', name: 'wink' },
			{ emoji: '😊', name: 'blush' },
			{ emoji: '😇', name: 'innocent' },
			{ emoji: '🥰', name: 'smiling_hearts' },
			{ emoji: '😍', name: 'heart_eyes' },
			{ emoji: '😘', name: 'kiss' },
			{ emoji: '😗', name: 'kissing' },
			{ emoji: '😙', name: 'kissing_smile' },
			{ emoji: '😚', name: 'kissing_closed_eyes' },
			{ emoji: '😋', name: 'yum' },
			{ emoji: '😛', name: 'stuck_out_tongue' },
			{ emoji: '😜', name: 'wink_tongue' },
			{ emoji: '🤪', name: 'zany' },
			{ emoji: '😝', name: 'squint_tongue' },
			{ emoji: '🤑', name: 'money_mouth' },
			{ emoji: '🤗', name: 'hugging' },
			{ emoji: '🤭', name: 'hand_over_mouth' },
			{ emoji: '🤫', name: 'shushing' },
			{ emoji: '🤔', name: 'thinking' },
			{ emoji: '🤐', name: 'zipper_mouth' }
		]
	},
	{
		id: 'animals',
		label: 'Animals',
		icon: '🐻',
		emojis: [
			{ emoji: '🐶', name: 'dog' },
			{ emoji: '🐱', name: 'cat' },
			{ emoji: '🐭', name: 'mouse' },
			{ emoji: '🐹', name: 'hamster' },
			{ emoji: '🐰', name: 'rabbit' },
			{ emoji: '🦊', name: 'fox' },
			{ emoji: '🐻', name: 'bear' },
			{ emoji: '🐼', name: 'panda' },
			{ emoji: '🐨', name: 'koala' },
			{ emoji: '🐯', name: 'tiger' },
			{ emoji: '🦁', name: 'lion' },
			{ emoji: '🐮', name: 'cow' },
			{ emoji: '🐷', name: 'pig' },
			{ emoji: '🐸', name: 'frog' },
			{ emoji: '🐵', name: 'monkey' },
			{ emoji: '🐔', name: 'chicken' },
			{ emoji: '🐧', name: 'penguin' },
			{ emoji: '🦆', name: 'duck' },
			{ emoji: '🐢', name: 'turtle' },
			{ emoji: '🐬', name: 'dolphin' },
			{ emoji: '🐳', name: 'whale' },
			{ emoji: '🦋', name: 'butterfly' },
			{ emoji: '🐝', name: 'bee' },
			{ emoji: '🦉', name: 'owl' },
			{ emoji: '🦄', name: 'unicorn' },
			{ emoji: '🐴', name: 'horse' },
			{ emoji: '🐺', name: 'wolf' },
			{ emoji: '🦌', name: 'deer' }
		]
	},
	{
		id: 'food',
		label: 'Food',
		icon: '🍔',
		emojis: [
			{ emoji: '🍎', name: 'apple' },
			{ emoji: '🍊', name: 'orange' },
			{ emoji: '🍓', name: 'strawberry' },
			{ emoji: '🍇', name: 'grapes' },
			{ emoji: '🍉', name: 'watermelon' },
			{ emoji: '🍌', name: 'banana' },
			{ emoji: '🍍', name: 'pineapple' },
			{ emoji: '🍑', name: 'peach' },
			{ emoji: '🍒', name: 'cherries' },
			{ emoji: '🥑', name: 'avocado' },
			{ emoji: '🥕', name: 'carrot' },
			{ emoji: '🌽', name: 'corn' },
			{ emoji: '🍔', name: 'burger' },
			{ emoji: '🍟', name: 'fries' },
			{ emoji: '🍕', name: 'pizza' },
			{ emoji: '🌭', name: 'hotdog' },
			{ emoji: '🍣', name: 'sushi' },
			{ emoji: '🍜', name: 'ramen' },
			{ emoji: '🍩', name: 'donut' },
			{ emoji: '🍪', name: 'cookie' },
			{ emoji: '🍦', name: 'icecream' },
			{ emoji: '🍰', name: 'cake' },
			{ emoji: '🍫', name: 'chocolate' },
			{ emoji: '🍿', name: 'popcorn' }
		]
	},
	{
		id: 'activities',
		label: 'Activities',
		icon: '⚽',
		emojis: [
			{ emoji: '⚽', name: 'soccer' },
			{ emoji: '🏀', name: 'basketball' },
			{ emoji: '🏈', name: 'football' },
			{ emoji: '⚾', name: 'baseball' },
			{ emoji: '🎾', name: 'tennis' },
			{ emoji: '🏐', name: 'volleyball' },
			{ emoji: '🎱', name: '8ball' },
			{ emoji: '🏓', name: 'ping_pong' },
			{ emoji: '🏸', name: 'badminton' },
			{ emoji: '🥊', name: 'boxing' },
			{ emoji: '🎮', name: 'video_game' },
			{ emoji: '🎲', name: 'dice' },
			{ emoji: '🧩', name: 'puzzle' },
			{ emoji: '🎨', name: 'art' },
			{ emoji: '🎸', name: 'guitar' },
			{ emoji: '🎺', name: 'trumpet' },
			{ emoji: '🥁', name: 'drum' }
		]
	},
	{
		id: 'travel',
		label: 'Travel',
		icon: '🚗',
		emojis: [
			{ emoji: '🚗', name: 'car' },
			{ emoji: '🚕', name: 'taxi' },
			{ emoji: '🚌', name: 'bus' },
			{ emoji: '🚎', name: 'trolleybus' },
			{ emoji: '🚓', name: 'police_car' },
			{ emoji: '🚑', name: 'ambulance' },
			{ emoji: '🚒', name: 'fire_engine' },
			{ emoji: '🚚', name: 'truck' },
			{ emoji: '🚜', name: 'tractor' },
			{ emoji: '🏍️', name: 'motorcycle' },
			{ emoji: '✈️', name: 'airplane' },
			{ emoji: '🛫', name: 'departures' },
			{ emoji: '🛬', name: 'arrivals' },
			{ emoji: '🚀', name: 'rocket' },
			{ emoji: '⛵', name: 'boat' },
			{ emoji: '🚤', name: 'speedboat' }
		]
	},
	{
		id: 'objects',
		label: 'Objects',
		icon: '💡',
		emojis: [
			{ emoji: '💡', name: 'light_bulb' },
			{ emoji: '🔧', name: 'wrench' },
			{ emoji: '🔨', name: 'hammer' },
			{ emoji: '🪛', name: 'screwdriver' },
			{ emoji: '🧰', name: 'toolbox' },
			{ emoji: '📱', name: 'phone' },
			{ emoji: '💻', name: 'laptop' },
			{ emoji: '🖥️', name: 'desktop' },
			{ emoji: '📷', name: 'camera' },
			{ emoji: '📦', name: 'package' },
			{ emoji: '🎁', name: 'gift' },
			{ emoji: '🔑', name: 'key' },
			{ emoji: '🧲', name: 'magnet' },
			{ emoji: '🧸', name: 'teddy' }
		]
	},
	{
		id: 'symbols',
		label: 'Symbols',
		icon: '❤️',
		emojis: [
			{ emoji: '❤️', name: 'heart' },
			{ emoji: '🧡', name: 'orange_heart' },
			{ emoji: '💛', name: 'yellow_heart' },
			{ emoji: '💚', name: 'green_heart' },
			{ emoji: '💙', name: 'blue_heart' },
			{ emoji: '💜', name: 'purple_heart' },
			{ emoji: '🖤', name: 'black_heart' },
			{ emoji: '🤍', name: 'white_heart' },
			{ emoji: '💔', name: 'broken_heart' },
			{ emoji: '✨', name: 'sparkles' },
			{ emoji: '⭐', name: 'star' },
			{ emoji: '🔥', name: 'fire' },
			{ emoji: '💯', name: '100' },
			{ emoji: '✅', name: 'check' },
			{ emoji: '❌', name: 'x' },
			{ emoji: '⚠️', name: 'warning' }
		]
	},
	{
		id: 'flags',
		label: 'Flags',
		icon: '🏁',
		emojis: [
			{ emoji: '🏁', name: 'flag_finish' },
			{ emoji: '🏳️', name: 'white_flag' },
			{ emoji: '🏴', name: 'black_flag' },
			{ emoji: '🏳️‍🌈', name: 'rainbow_flag' },
			{ emoji: '🇺🇸', name: 'us' },
			{ emoji: '🇬🇧', name: 'gb' },
			{ emoji: '🇨🇦', name: 'canada' },
			{ emoji: '🇫🇷', name: 'france' },
			{ emoji: '🇯🇵', name: 'japan' },
			{ emoji: '🇦🇺', name: 'australia' },
			{ emoji: '🇩🇪', name: 'germany' },
			{ emoji: '🇧🇷', name: 'brazil' }
		]
	}
]

export function EmojiPicker({ onSelect, onClose, position }: EmojiPickerProps) {
	const centerPosition = useMemo(() => {
		if (position) return position
		if (typeof window === 'undefined') return { x: 0, y: 0 }
		return {
			x: Math.max(16, (window.innerWidth - EMOJI_PICKER_WIDTH) / 2),
			y: Math.max(16, (window.innerHeight - EMOJI_PICKER_HEIGHT) / 2)
		}
	}, [position])

	const { dropdownRef, adjustedPosition, isPositioned } = useDropdownPosition({
		position: centerPosition,
		viewportPadding: 16
	})
	const [activeCategory, setActiveCategory] = useState(0)
	const [hovered, setHovered] = useState<{ emoji: string; name: string } | null>(null)
	const category = EMOJI_CATEGORIES[activeCategory]
	const preview = hovered ?? category.emojis[0]
	const sidebarIcons = useMemo(() => EMOJI_CATEGORIES.map((item) => item.icon), [])

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

	const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
		if (event.target === event.currentTarget) {
			onClose()
		}
	}

	return (
		<div className={styles.overlay} onClick={handleOverlayClick}>
			<DropdownContainer
				ref={dropdownRef}
				role="dialog"
				aria-label="Emoji picker"
				className={styles.picker}
				position="fixed"
				coordinates={adjustedPosition}
				isPositioned={isPositioned}
			>
				<div className={styles.container}>
				<div className={styles.sidebar} aria-hidden="true">
					{sidebarIcons.map((icon, index) => (
						<button
							key={`${icon}-${index}`}
							className={`${styles.sideButton} ${index === activeCategory ? styles.sideActive : ''}`}
							type="button"
							onClick={() => setActiveCategory(index)}
						>
							{icon}
						</button>
					))}
				</div>
				<div className={styles.main}>
					<div className={styles.header}>
						<div className={styles.headerTitle}>
							<span className={styles.headerIcon}>{category.icon}</span>
							<span>{category.label}</span>
							<span className={styles.headerCaret}>▾</span>
						</div>
					</div>
					<div className={styles.grid}>
						{category.emojis.map((item, index) => (
							<button
								key={`${item.name}-${index}`}
								className={styles.emoji}
								onClick={() => onSelect(item.emoji)}
								onMouseEnter={() => setHovered(item)}
								title={item.emoji}
							>
								{item.emoji}
							</button>
						))}
					</div>
					<div className={styles.footer}>
						<span className={styles.footerEmoji}>{preview.emoji}</span>
						<span className={styles.footerName}>:{preview.name}:</span>
					</div>
				</div>
				</div>
			</DropdownContainer>
		</div>
	)
}
