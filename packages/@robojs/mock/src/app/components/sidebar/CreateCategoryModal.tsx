import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PrimaryButton } from '../base'
import { EmojiPicker } from '../common/EmojiPicker'
import shared from './CreateChannelModal.module.css'
import local from './CreateCategoryModal.module.css'

interface CreateCategoryModalProps {
	onClose: () => void
	onSubmit: (payload: { name: string; isPrivate: boolean }) => Promise<void> | void
}

export function CreateCategoryModal({ onClose, onSubmit }: CreateCategoryModalProps) {
	const [categoryName, setCategoryName] = useState('New Category')
	const [isPrivate, setIsPrivate] = useState(false)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [showEmojiPicker, setShowEmojiPicker] = useState(false)
	const inputRef = useRef<HTMLInputElement>(null)
	const emojiButtonRef = useRef<HTMLButtonElement>(null)

	useEffect(() => {
		inputRef.current?.focus()
		inputRef.current?.select()
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

	const handleSubmit = async () => {
		if (!categoryName.trim()) return

		setIsSubmitting(true)
		try {
			await onSubmit({
				name: categoryName,
				isPrivate
			})
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
			const start = input.selectionStart ?? categoryName.length
			const end = input.selectionEnd ?? categoryName.length
			const newName = categoryName.slice(0, start) + emoji + categoryName.slice(end)
			setCategoryName(newName)

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
		<div className={shared.overlay} onClick={handleOverlayClick} role="presentation">
			<div className={`${shared.modal} ${local.modal}`} role="dialog" aria-modal="true" aria-labelledby="create-category-title">
				<header className={shared.header}>
					<div>
						<h2 id="create-category-title" className={`${shared.title} ${local.title}`}>
							Create Category
						</h2>
					</div>
					<button className={`${shared.closeButton} ${local.closeButton}`} onClick={onClose} aria-label="Close" type="button">
						<CloseIcon />
					</button>
				</header>

				<section className={`${shared.section} ${local.section}`}>
					<h3 className={`${shared.sectionTitle} ${local.sectionTitle}`}>Category Name</h3>
					<div className={`${shared.inputField} ${local.inputField} ${local.emojiAnchor}`}>
						<input
							ref={inputRef}
							type="text"
							value={categoryName}
							onChange={(event) => setCategoryName(event.target.value)}
							placeholder="New Category"
							aria-label="Category name"
						/>
						<button
							ref={emojiButtonRef}
							type="button"
							className={`${shared.emojiButton} ${local.emojiButton}`}
							aria-label="Pick an emoji"
							onClick={() => setShowEmojiPicker(!showEmojiPicker)}
						>
							<EmojiIcon />
						</button>
					</div>
				</section>

				<section className={`${shared.section} ${local.section}`}>
					<div className={shared.toggleRow}>
						<div>
							<h3 className={`${shared.sectionTitle} ${local.privateTitle}`}>
								<LockIcon />
								Private Category
							</h3>
							<p className={`${shared.sectionDescription} ${local.description}`}>
								By making a category private, only select members and roles will be able to view this category. Linked channels in this category will automatically match to this setting.
							</p>
						</div>
						<button
							className={`${shared.toggle} ${local.toggle} ${isPrivate ? `${shared.toggleOn} ${local.toggleOn}` : ''}`}
							onClick={() => setIsPrivate((prev) => !prev)}
							type="button"
							role="switch"
							aria-checked={isPrivate}
							aria-label="Toggle private category"
						>
							<span className={shared.toggleHandle} />
						</button>
					</div>
				</section>

				<footer className={`${shared.footer} ${local.footer}`}>
					<button className={`${shared.secondaryButton} ${local.cancelButton}`} onClick={onClose} type="button" disabled={isSubmitting}>
						Cancel
					</button>
					<PrimaryButton
						onClick={handleSubmit}
						disabled={isSubmitting || !categoryName.trim()}
					>
						{isSubmitting ? 'Creating...' : 'Create Category'}
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
