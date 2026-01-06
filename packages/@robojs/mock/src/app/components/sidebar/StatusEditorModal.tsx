import { useEffect, useRef, useState } from 'react'
import type { StageUser } from '../../types/stage'
import { getAvatarUrl } from '../../utils/avatar'
import styles from './StatusEditorModal.module.css'

interface StatusEditorModalProps {
	user: StageUser
	displayName: string
	handle: string
	initialStatus: string
	placeholder: string
	onSave: (nextStatus: string) => Promise<void>
	onClose: () => void
}

type ClearAfterOption = 'dont-clear' | '30-minutes' | '1-hour' | '4-hours' | '24-hours'

const clearAfterOptions: Array<{
	value: ClearAfterOption
	label: string
	buttonLabel: string
}> = [
	{
		value: '24-hours',
		label: '24 hours (tomorrow at 10:56 PM)',
		buttonLabel: 'Clear tomorrow at 10:56 PM'
	},
	{
		value: '4-hours',
		label: '4 hours (tomorrow at 2:56 AM)',
		buttonLabel: 'Clear in 4 hours'
	},
	{
		value: '1-hour',
		label: '1 hour (11:56 PM)',
		buttonLabel: 'Clear in 1 hour'
	},
	{
		value: '30-minutes',
		label: '30 minutes (11:26 PM)',
		buttonLabel: 'Clear in 30 minutes'
	},
	{
		value: 'dont-clear',
		label: "Don't clear",
		buttonLabel: "Don't clear"
	}
]

export function StatusEditorModal({
	user,
	displayName,
	handle,
	initialStatus,
	placeholder,
	onSave,
	onClose
}: StatusEditorModalProps) {
	const [statusText, setStatusText] = useState(initialStatus)
	const [isSaving, setIsSaving] = useState(false)
	const [clearAfter, setClearAfter] = useState<ClearAfterOption>('dont-clear')
	const [showClearMenu, setShowClearMenu] = useState(false)
	const clearMenuRef = useRef<HTMLDivElement>(null)
	const clearButtonRef = useRef<HTMLButtonElement>(null)

	useEffect(() => {
		setStatusText(initialStatus)
	}, [initialStatus])

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onClose()
			}
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [onClose])

	useEffect(() => {
		if (!showClearMenu) return

		const handlePointerDown = (event: MouseEvent) => {
			const target = event.target as Node
			if (clearMenuRef.current?.contains(target) || clearButtonRef.current?.contains(target)) {
				return
			}
			setShowClearMenu(false)
		}

		window.addEventListener('mousedown', handlePointerDown)
		return () => window.removeEventListener('mousedown', handlePointerDown)
	}, [showClearMenu])

	const previewText = statusText.trim() ? statusText.trim() : placeholder
	const status = user.status || 'online'
	const selectedClearOption =
		clearAfterOptions.find((option) => option.value === clearAfter) ?? clearAfterOptions[0]

	const handleSave = async () => {
		setIsSaving(true)
		try {
			await onSave(statusText)
		} catch (error) {
			console.error('[StatusEditorModal] Failed to save status', error)
		} finally {
			setIsSaving(false)
		}
	}

	return (
		<div className={styles.overlay} onClick={onClose} role="presentation">
			<div className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Set your status">
				<div className={styles.header}>
					<h2 className={styles.title}>Set your status</h2>
					<button className={styles.closeButton} type="button" onClick={onClose} aria-label="Close">
						<CloseIcon />
					</button>
				</div>

				<div className={styles.previewCard}>
					<div className={styles.previewBanner} />
					<div className={styles.previewRow}>
						<div className={styles.previewAvatarWrap}>
							<img
								className={styles.previewAvatar}
								src={getAvatarUrl(user.id, user.avatar, 96)}
								alt=""
							/>
							<span className={`${styles.previewStatusDot} ${styles[status]}`} />
						</div>
						<div className={`${styles.previewBubble} ${!statusText.trim() ? styles.previewBubblePlaceholder : ''}`}>
							{previewText}
						</div>
					</div>
					<div className={styles.previewMeta}>
						<div className={styles.previewDisplayName}>{displayName}</div>
						<div className={styles.previewHandle}>{handle}</div>
					</div>
				</div>

				<div className={styles.field}>
					<label className={styles.label} htmlFor="status-input">
						Status
					</label>
					<div className={styles.inputRow}>
						<span className={styles.inputIcon} aria-hidden="true">
							<SmileIcon />
						</span>
						<input
							id="status-input"
							className={styles.input}
							type="text"
							value={statusText}
							onChange={(event) => setStatusText(event.target.value)}
							placeholder={placeholder}
							maxLength={128}
						/>
						{statusText.length > 0 && (
							<button
								className={styles.clearButton}
								type="button"
								onClick={() => setStatusText('')}
								aria-label="Clear status text"
							>
								<SmallCloseIcon />
							</button>
						)}
					</div>
				</div>

				<div className={styles.footer}>
					<div className={styles.clearAfter}>
						<button
							ref={clearButtonRef}
							className={`${styles.dropdownButton} ${showClearMenu ? styles.dropdownButtonOpen : ''}`}
							type="button"
							onClick={() => setShowClearMenu((prev) => !prev)}
							aria-haspopup="menu"
							aria-expanded={showClearMenu}
						>
							<span>{selectedClearOption.buttonLabel}</span>
							<ChevronDownIcon />
						</button>
						{showClearMenu && (
							<div className={styles.clearMenu} ref={clearMenuRef} role="menu">
								<div className={styles.clearMenuHeader}>Clear after</div>
								{clearAfterOptions.map((option) => (
									<button
										key={option.value}
										className={`${styles.clearMenuItem} ${
											clearAfter === option.value ? styles.clearMenuItemSelected : ''
										}`}
										type="button"
										role="menuitemradio"
										aria-checked={clearAfter === option.value}
										onClick={() => {
											setClearAfter(option.value)
											setShowClearMenu(false)
										}}
									>
										<span>{option.label}</span>
										{clearAfter === option.value && <CheckIcon />}
									</button>
								))}
							</div>
						)}
					</div>
					<button className={styles.saveButton} type="button" onClick={handleSave} disabled={isSaving}>
						{isSaving ? 'Saving...' : 'Save'}
					</button>
				</div>
			</div>
		</div>
	)
}

function CloseIcon() {
	return (
		<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
			<path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z" />
		</svg>
	)
}

function SmallCloseIcon() {
	return (
		<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
			<path d="M18.4 5.6 12 12l6.4 6.4-1.4 1.4L10.6 13.4 4.2 19.8 2.8 18.4 9.2 12 2.8 5.6 4.2 4.2 10.6 10.6 17 4.2z" />
		</svg>
	)
}

function SmileIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
			<path d="M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20zm-3.5 8a1.5 1.5 0 1 1 0-3a1.5 1.5 0 0 1 0 3zm7 0a1.5 1.5 0 1 1 0-3a1.5 1.5 0 0 1 0 3zm-7.24 3.3a.75.75 0 0 1 1.04.2c.56.76 1.57 1.5 2.7 1.5s2.14-.74 2.7-1.5a.75.75 0 1 1 1.2.9c-.86 1.15-2.31 2.1-3.9 2.1s-3.04-.95-3.9-2.1a.75.75 0 0 1 .16-1.04z" />
		</svg>
	)
}

function ChevronDownIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
			<path d="M5.3 9.3a1 1 0 0 1 1.4 0l5.3 5.29 5.3-5.3a1 1 0 1 1 1.4 1.42l-6 6a1 1 0 0 1-1.4 0l-6-6a1 1 0 0 1 0-1.42z" />
		</svg>
	)
}

function CheckIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
			<path d="M9 16.17l-3.88-3.88a1 1 0 0 0-1.41 1.41l4.59 4.59a1 1 0 0 0 1.41 0l10-10a1 1 0 1 0-1.41-1.41L9 16.17z" />
		</svg>
	)
}
