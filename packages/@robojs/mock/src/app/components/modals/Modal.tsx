import { useState, useEffect, useCallback } from 'react'
import { PrimaryButton } from '../base'
import { TextInput, TextInputComponentData } from './TextInput'
import styles from './Modal.module.css'

// Discord interaction response types
const InteractionResponseType = {
	Modal: 9
} as const

export interface ModalActionRow {
	type: 1
	components: TextInputComponentData[]
}

export interface ModalData {
	custom_id: string
	title: string
	components: ModalActionRow[]
}

interface ModalProps {
	modal: ModalData
	onClose: () => void
	onSubmit: (customId: string, components: ModalActionRow[]) => Promise<void>
}

export function Modal({ modal, onClose, onSubmit }: ModalProps) {
	const [values, setValues] = useState<Record<string, string>>({})
	const [errors, setErrors] = useState<Record<string, string>>({})
	const [isSubmitting, setIsSubmitting] = useState(false)

	// Initialize values from component defaults
	useEffect(() => {
		const initialValues: Record<string, string> = {}
		for (const row of modal.components) {
			for (const component of row.components) {
				if (component.type === 4) {
					initialValues[component.custom_id] = component.value || ''
				}
			}
		}
		setValues(initialValues)
	}, [modal])

	// Handle escape key
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && !isSubmitting) {
				onClose()
			}
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [onClose, isSubmitting])

	const validateForm = useCallback((): boolean => {
		const newErrors: Record<string, string> = {}

		for (const row of modal.components) {
			for (const component of row.components) {
				if (component.type !== 4) continue

				const value = values[component.custom_id] || ''
				const trimmedValue = value.trim()

				// Required validation
				if (component.required && !trimmedValue) {
					newErrors[component.custom_id] = 'This field is required'
					continue
				}

				// Min length validation
				if (component.min_length && value.length < component.min_length) {
					newErrors[component.custom_id] = `Must be at least ${component.min_length} characters`
					continue
				}

				// Max length validation (should be enforced by input, but validate anyway)
				if (component.max_length && value.length > component.max_length) {
					newErrors[component.custom_id] = `Must be at most ${component.max_length} characters`
				}
			}
		}

		setErrors(newErrors)
		return Object.keys(newErrors).length === 0
	}, [modal, values])

	const handleSubmit = async () => {
		if (!validateForm()) {
			return
		}

		setIsSubmitting(true)
		try {
			// Build components array with values
			const submitComponents: ModalActionRow[] = modal.components.map((row) => ({
				type: 1 as const,
				components: row.components.map((component) => ({
					...component,
					value: values[component.custom_id] || ''
				}))
			}))

			await onSubmit(modal.custom_id, submitComponents)
		} finally {
			setIsSubmitting(false)
		}
	}

	const handleOverlayClick = (e: React.MouseEvent) => {
		if (e.target === e.currentTarget && !isSubmitting) {
			onClose()
		}
	}

	const handleValueChange = (customId: string, value: string) => {
		setValues((prev) => ({
			...prev,
			[customId]: value
		}))
		// Clear error when user starts typing
		if (errors[customId]) {
			setErrors((prev) => {
				const next = { ...prev }
				delete next[customId]
				return next
			})
		}
	}

	return (
		<div className={styles.overlay} onClick={handleOverlayClick}>
			<div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="modal-title">
				<div className={styles.header}>
					<h2 id="modal-title" className={styles.title}>
						{modal.title}
					</h2>
					<button
						className={styles.closeButton}
						onClick={onClose}
						disabled={isSubmitting}
						aria-label="Close modal"
						type="button"
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<path d="M18 6L6 18M6 6l12 12" />
						</svg>
					</button>
				</div>

				<div className={styles.content}>
					{modal.components.map((row, rowIndex) => (
						<div key={rowIndex} className={styles.row}>
							{row.components.map((component) =>
								component.type === 4 ? (
									<TextInput
										key={component.custom_id}
										component={component}
										value={values[component.custom_id] || ''}
										error={errors[component.custom_id]}
										onChange={(value) => handleValueChange(component.custom_id, value)}
									/>
								) : null
							)}
						</div>
					))}
				</div>

				<div className={styles.footer}>
					<button className={styles.cancelButton} onClick={onClose} disabled={isSubmitting} type="button">
						Cancel
					</button>
					<PrimaryButton onClick={handleSubmit} disabled={isSubmitting}>
						{isSubmitting ? 'Submitting...' : 'Submit'}
					</PrimaryButton>
				</div>
			</div>
		</div>
	)
}

export { InteractionResponseType }
