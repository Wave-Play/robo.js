import { useRef, useState } from 'react'
import type { StageReaction } from '../../types/stage'
import { EmojiPicker } from '../common/EmojiPicker'
import styles from './Reactions.module.css'

interface ReactionsProps {
	messageId: string
	reactions: StageReaction[]
	onAddReaction: (messageId: string, emoji: string) => Promise<void>
	onRemoveReaction: (messageId: string, emoji: string) => Promise<void>
}

export function Reactions({ messageId, reactions, onAddReaction, onRemoveReaction }: ReactionsProps) {
	const [showPicker, setShowPicker] = useState(false)
	const [loadingEmoji, setLoadingEmoji] = useState<string | null>(null)
	const [pickerPosition, setPickerPosition] = useState<{ x: number; y: number } | null>(null)
	const addButtonRef = useRef<HTMLButtonElement>(null)

	const handleReactionClick = async (emoji: string, hasReacted: boolean) => {
		const emojiKey = emoji
		setLoadingEmoji(emojiKey)
		try {
			if (hasReacted) {
				await onRemoveReaction(messageId, emoji)
			} else {
				await onAddReaction(messageId, emoji)
			}
		} finally {
			setLoadingEmoji(null)
		}
	}

	const handleAddReaction = async (emoji: string) => {
		setShowPicker(false)
		setLoadingEmoji(emoji)
		try {
			await onAddReaction(messageId, emoji)
		} finally {
			setLoadingEmoji(null)
		}
	}

	const formatCount = (count: number): string => {
		if (count > 99) return '99+'
		return count.toString()
	}

	const togglePicker = () => {
		if (showPicker) {
			setShowPicker(false)
			return
		}

		const rect = addButtonRef.current?.getBoundingClientRect()
		if (rect) {
			setPickerPosition({ x: rect.left, y: rect.bottom + 6 })
		} else {
			setPickerPosition({ x: 0, y: 0 })
		}
		setShowPicker(true)
	}

	const hasReactions = reactions.length > 0

	return (
		<div
			className={`${styles.container} ${hasReactions ? '' : styles.empty}`}
			data-reactions-empty={!hasReactions || undefined}
		>
			{reactions.map((reaction) => {
				const emojiKey = reaction.emoji.id || reaction.emoji.name || ''
				const isLoading = loadingEmoji === emojiKey
				return (
					<button
						key={emojiKey}
						className={`${styles.reaction} ${reaction.me ? styles.reacted : ''} ${isLoading ? styles.loading : ''}`}
						onClick={() => handleReactionClick(emojiKey, reaction.me)}
						disabled={isLoading}
						title={`${reaction.count} reaction${reaction.count !== 1 ? 's' : ''}`}
					>
						<span className={styles.emoji}>
							{reaction.emoji.id ? (
								<img
									src={`https://cdn.discordapp.com/emojis/${reaction.emoji.id}.webp?size=16`}
									alt={reaction.emoji.name || ''}
									className={styles.emojiImage}
								/>
							) : (
								reaction.emoji.name
							)}
						</span>
						<span className={styles.count}>{formatCount(reaction.count)}</span>
					</button>
				)
			})}

			<div className={styles.addButtonWrapper}>
				<button
					className={styles.addButton}
					onClick={togglePicker}
					title="Add reaction"
					ref={addButtonRef}
				>
					<SmilePlus />
				</button>

				{showPicker && pickerPosition && (
					<EmojiPicker
						onSelect={handleAddReaction}
						onClose={() => setShowPicker(false)}
						position={pickerPosition}
					/>
				)}
			</div>
		</div>
	)
}

function SmilePlus() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path
				d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-4-8c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1zm8 0c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1zm-4 4c2.21 0 4-1.79 4-4h-2c0 1.1-.9 2-2 2s-2-.9-2-2H8c0 2.21 1.79 4 4 4z"
				fill="currentColor"
			/>
			<path
				d="M19 11h-2v2h-2v2h2v2h2v-2h2v-2h-2v-2z"
				fill="currentColor"
			/>
		</svg>
	)
}
