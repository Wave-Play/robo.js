<<<<<<< HEAD
import { useState, useEffect, useRef, useCallback } from 'react'
import { DropdownContainer } from '../base'
=======
import { useEffect } from 'react'
import { DropdownContainer, useDropdownPosition } from '../base'
>>>>>>> 73140c52 (fix: small ui issues)
import styles from './EmojiPicker.module.css'

interface GuildEmoji {
	id: string
	name: string
	animated?: boolean
}

interface EmojiPickerProps {
	guildId?: string | null
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

<<<<<<< HEAD
// Detect API prefix from current URL
function getApiPrefix() {
	const pathname = window.location.pathname
	const stageIndex = pathname.indexOf('/stage')
	return stageIndex !== -1 ? pathname.slice(0, stageIndex) : ''
}

export function EmojiPicker({ guildId, onSelect, onClose }: EmojiPickerProps) {
	const pickerRef = useRef<HTMLDivElement>(null)
	const [activeTab, setActiveTab] = useState<'standard' | 'guild'>('standard')
	const [guildEmojis, setGuildEmojis] = useState<GuildEmoji[]>([])
	const [isLoading, setIsLoading] = useState(false)

	// Fetch guild emojis when guildId changes
	useEffect(() => {
		if (!guildId) {
			setGuildEmojis([])
			return
		}

		const fetchGuildEmojis = async () => {
			setIsLoading(true)
			try {
				const apiPrefix = getApiPrefix()
				const response = await fetch(`${apiPrefix}/api/v10/guilds/${guildId}/emojis`)
				if (response.ok) {
					const emojis = await response.json()
					setGuildEmojis(emojis)
				}
			} catch (error) {
				console.error('[EmojiPicker] Failed to fetch guild emojis:', error)
			} finally {
				setIsLoading(false)
			}
		}

		fetchGuildEmojis()
	}, [guildId])

	// Listen for guild emoji updates via window event
	useEffect(() => {
		const handleEmojisUpdate = (event: Event) => {
			const customEvent = event as CustomEvent<{ guild_id: string; emojis: GuildEmoji[] }>
			if (customEvent.detail?.guild_id === guildId) {
				setGuildEmojis(customEvent.detail.emojis || [])
			}
		}

		window.addEventListener('guild_emojis_update', handleEmojisUpdate)
		return () => window.removeEventListener('guild_emojis_update', handleEmojisUpdate)
	}, [guildId])
=======
export function EmojiPicker({ onSelect, onClose, position }: EmojiPickerProps) {
	const { dropdownRef, adjustedPosition, isPositioned } = useDropdownPosition({
		position,
		viewportPadding: 8
	})
>>>>>>> 73140c52 (fix: small ui issues)

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

	// Handle guild emoji selection - returns Discord emoji format <:name:id>
	const handleGuildEmojiSelect = useCallback(
		(emoji: GuildEmoji) => {
			const prefix = emoji.animated ? 'a' : ''
			onSelect(`<${prefix}:${emoji.name}:${emoji.id}>`)
		},
		[onSelect]
	)

	return (
<<<<<<< HEAD
		<DropdownContainer ref={pickerRef} role="dialog" aria-label="Emoji picker" placement="top-end" className={styles.picker}>
			{/* Tab bar */}
			{guildId && (
				<div className={styles.tabs}>
					<button
						className={`${styles.tab} ${activeTab === 'standard' ? styles.activeTab : ''}`}
						onClick={() => setActiveTab('standard')}
						title="Standard Emojis"
					>
						😀
=======
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
>>>>>>> 73140c52 (fix: small ui issues)
					</button>
					<button
						className={`${styles.tab} ${activeTab === 'guild' ? styles.activeTab : ''}`}
						onClick={() => setActiveTab('guild')}
						title="Server Emojis"
					>
						🏠
					</button>
				</div>
			)}

			{/* Standard emojis */}
			{activeTab === 'standard' && (
				<div className={styles.grid}>
					{EMOJI_LIST.map((emoji) => (
						<button key={emoji} className={styles.emoji} onClick={() => onSelect(emoji)} title={emoji}>
							{emoji}
						</button>
					))}
				</div>
			)}

			{/* Guild emojis */}
			{activeTab === 'guild' && (
				<div className={styles.guildSection}>
					{isLoading ? (
						<div className={styles.empty}>Loading...</div>
					) : guildEmojis.length > 0 ? (
						<div className={styles.grid}>
							{guildEmojis.map((emoji) => (
								<button
									key={emoji.id}
									className={styles.emoji}
									onClick={() => handleGuildEmojiSelect(emoji)}
									title={`:${emoji.name}:`}
								>
									<img
										src={`https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}`}
										alt={emoji.name}
										width={22}
										height={22}
										className={styles.emojiImage}
									/>
								</button>
							))}
						</div>
					) : (
						<div className={styles.empty}>No custom emojis</div>
					)}
				</div>
			)}
		</DropdownContainer>
	)
}
