import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CHANNEL_TYPE, normalizeChannelName } from '../../utils'
import { PrimaryButton } from '../base'
import { EmojiPicker } from '../common/EmojiPicker'
import ChannelIcon from '../icons/channel'
import VoiceChannelIcon from '../icons/voice_channel'
import ForumIcon from '../icons/forum'
import styles from './CreateChannelModal.module.css'

interface CreateChannelModalProps {
	guildName?: string
	defaultType?: number
	onClose: () => void
	onSubmit: (payload: { name: string; type: number; isPrivate: boolean }) => Promise<void> | void
}

const channelTypeOptions = [
	{
		type: CHANNEL_TYPE.TEXT,
		title: 'Text',
		description: 'Send messages, images, GIFs, emoji, opinions, and puns',
		Icon: ChannelIcon
	},
	{
		type: CHANNEL_TYPE.VOICE,
		title: 'Voice',
		description: 'Hang out together with voice, video, and screen share',
		Icon: VoiceChannelIcon
	},
	{
		type: CHANNEL_TYPE.FORUM,
		title: 'Forum',
		description: 'Create a space for organized discussions',
		Icon: ForumIcon
	}
] as const

export function CreateChannelModal({ defaultType = CHANNEL_TYPE.TEXT, onClose, onSubmit }: CreateChannelModalProps) {
	const [selectedType, setSelectedType] = useState<number>(defaultType)
	const [channelName, setChannelName] = useState('new-channel')
	const [isPrivate, setIsPrivate] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [showEmojiPicker, setShowEmojiPicker] = useState(false)
	const inputRef = useRef<HTMLInputElement>(null)
	const emojiButtonRef = useRef<HTMLButtonElement>(null)

	useEffect(() => {
		setSelectedType(defaultType)
	}, [defaultType])

	useEffect(() => {
		inputRef.current?.focus()
	}, [])

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				if (showEmojiPicker) {
					setShowEmojiPicker(false)
				} else {
					onClose()
				}
			}
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [onClose, showEmojiPicker])

	const handleNameChange = (value: string) => {
		const normalized = value ? normalizeChannelName(value) : ''
		setChannelName(normalized)
		if (error && normalized) {
			setError(null)
		}
	}

	const handleSubmit = async () => {
		if (!channelName.trim()) {
			setError('Please enter a channel name')
			return
		}

		setIsSubmitting(true)
		try {
			await onSubmit({
				name: channelName,
				type: selectedType,
				isPrivate
			})
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to create channel'
			setError(message || 'Failed to create channel')
			return
		} finally {
			setIsSubmitting(false)
		}
	}

	const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
		if (event.target === event.currentTarget) {
			onClose()
		}
	}

	const handleEmojiSelect = (emoji: string) => {
		const input = inputRef.current
		if (input) {
			const start = input.selectionStart ?? channelName.length
			const end = input.selectionEnd ?? channelName.length
			const newName = channelName.slice(0, start) + emoji + channelName.slice(end)
			const normalized = normalizeChannelName(newName)
			setChannelName(normalized)

			requestAnimationFrame(() => {
				const pos = start + emoji.length
				input.setSelectionRange(pos, pos)
				input.focus()
			})
		}
		setShowEmojiPicker(false)
	}

	const getEmojiPickerPosition = () => {
		if (!emojiButtonRef.current) return { x: 0, y: 0 }
		const rect = emojiButtonRef.current.getBoundingClientRect()
		return {
			x: rect.right - 320,
			y: rect.bottom + 8
		}
	}

	return createPortal(
		<div className={styles.overlay} onClick={handleOverlayClick} role="presentation">
			<div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="create-channel-title">
				<header className={styles.header}>
					<div>
						<h2 id="create-channel-title" className={styles.title}>
							Create Channel
						</h2>
					</div>
					<button className={styles.closeButton} onClick={onClose} aria-label="Close" type="button">
						<CloseIcon />
					</button>
				</header>

				<section className={styles.section}>
					<h3 className={styles.sectionTitle}>Channel Type</h3>
					<div className={styles.typeList}>
						{channelTypeOptions.map((option) => (
							<label
								key={option.type}
								className={`${styles.typeOption} ${selectedType === option.type ? styles.typeOptionActive : ''}`}
							>
								<input
									type="radio"
									name="channel-type"
									value={option.type}
									checked={selectedType === option.type}
									onChange={() => setSelectedType(option.type)}
								/>
								<span className={styles.radioIndicator}>
									<span className={styles.radioIndicatorDot} />
								</span>
								<div className={styles.typeIcon}>
									<option.Icon />
								</div>
								<div className={styles.typeCopy}>
									<div className={styles.typeTitle}>{option.title}</div>
									<div className={styles.typeDescription}>{option.description}</div>
								</div>
							</label>
						))}
					</div>
				</section>

				<section className={styles.section}>
					<h3 className={styles.sectionTitle}>Channel Name</h3>
					<div className={`${styles.inputField} ${error ? styles.inputError : ''}`}>
						<span className={styles.inputPrefix}>#</span>
						<input
							ref={inputRef}
							type="text"
							value={channelName}
							onChange={(event) => handleNameChange(event.target.value)}
							placeholder="new-channel"
							aria-label="Channel name"
						/>
						<button
							ref={emojiButtonRef}
							type="button"
							className={styles.emojiButton}
							aria-label="Pick an emoji"
							onClick={() => setShowEmojiPicker(!showEmojiPicker)}
						>
							<EmojiIcon />
						</button>
					</div>
					{error && <p className={styles.errorText}>{error}</p>}
				</section>

				<section className={styles.section}>
					<div className={styles.toggleRow}>
						<div>
							<h3 className={styles.privateTitle}>
								<LockIcon />
								Private Channel
							</h3>
							<p className={styles.sectionDescription}>
								Only selected members and roles will be able to view this channel.
							</p>
						</div>
						<button
							className={`${styles.toggle} ${isPrivate ? styles.toggleOn : ''}`}
							onClick={() => setIsPrivate((prev) => !prev)}
							type="button"
							role="switch"
							aria-checked={isPrivate}
							aria-label="Toggle private channel"
						>
							<span className={styles.toggleHandle} />
						</button>
					</div>
				</section>

				<footer className={styles.footer}>
					<button className={styles.secondaryButton} onClick={onClose} type="button" disabled={isSubmitting}>
						Cancel
					</button>
					<PrimaryButton
						onClick={handleSubmit}
						disabled={isSubmitting || !channelName}
					>
						{isSubmitting ? 'Creating...' : 'Create Channel'}
					</PrimaryButton>
				</footer>
			</div>

			{showEmojiPicker && (
				<EmojiPicker
					position={getEmojiPickerPosition()}
					onSelect={handleEmojiSelect}
					onClose={() => setShowEmojiPicker(false)}
				/>
			)}
		</div>,
		document.body
	)
}

function CloseIcon() {
	return (
		<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z" />
		</svg>
	)
}

function LockIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ marginRight: 6, verticalAlign: 'middle', color: '#949ba4' }}>
			<path d="M17 11V7a5 5 0 0 0-10 0v4H5v11h14V11h-2zm-8-4a3 3 0 0 1 6 0v4H9V7z" />
		</svg>
	)
}

function EmojiIcon() {
	return (
		<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.418 0-8-3.582-8-8s3.582-8 8-8 8 3.582 8 8-3.582 8-8 8zm-4-9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm8 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm-4 7c2.28 0 4.22-1.66 5-4H7c.78 2.34 2.72 4 5 4z" />
		</svg>
	)
}
