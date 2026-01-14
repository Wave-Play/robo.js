import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CHANNEL_TYPE, normalizeChannelName } from '../../utils'
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
		description: 'Send messages, GIFs, emoji, opinions and puns',
		Icon: ChannelIcon
	},
	{
		type: CHANNEL_TYPE.VOICE,
		title: 'Voice',
		description: 'Hang out together with voice, video and screen share',
		Icon: VoiceChannelIcon
	},
	{
		type: CHANNEL_TYPE.FORUM,
		title: 'Forum',
		description: 'Create a space for organised discussions',
		Icon: ForumIcon
	}
] as const

export function CreateChannelModal({ guildName, defaultType = CHANNEL_TYPE.TEXT, onClose, onSubmit }: CreateChannelModalProps) {
	const [selectedType, setSelectedType] = useState<number>(defaultType)
	const [channelName, setChannelName] = useState('new-channel')
	const [isPrivate, setIsPrivate] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		setSelectedType(defaultType)
	}, [defaultType])

	useEffect(() => {
		inputRef.current?.focus()
	}, [])

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onClose()
			}
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [onClose])

	const subtitle = useMemo(() => (guildName ? `in ${guildName}` : 'Create a channel'), [guildName])

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

	return createPortal(
		<div className={styles.overlay} onClick={handleOverlayClick} role="presentation">
			<div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="create-channel-title">
				<header className={styles.header}>
					<div>
						<h2 id="create-channel-title" className={styles.title}>
							Create Channel
						</h2>
						<p className={styles.subtitle}>{subtitle}</p>
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
					</div>
					{error && <p className={styles.errorText}>{error}</p>}
				</section>

				<section className={styles.section}>
					<div className={styles.toggleRow}>
						<div>
							<h3 className={styles.sectionTitle}>Private Channel</h3>
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
					<button
						className={styles.primaryButton}
						onClick={handleSubmit}
						type="button"
						disabled={isSubmitting || !channelName}
					>
						{isSubmitting ? 'Creating…' : 'Create Channel'}
					</button>
				</footer>
			</div>
		</div>,
		document.body
	)
}

function CloseIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
			<path d="M18 6L6 18M6 6l12 12" />
		</svg>
	)
}
