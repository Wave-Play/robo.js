import { useState, useEffect } from 'react'
import styles from './DisclaimerModal.module.css'

const DISCLAIMER_STORAGE_KEY = 'robojs-mock-disclaimer-accepted'

interface DisclaimerModalProps {
	onAccept?: () => void
}

export function DisclaimerModal({ onAccept }: DisclaimerModalProps) {
	const [isVisible, setIsVisible] = useState(false)

	useEffect(() => {
		// Check if user has already accepted the disclaimer
		const hasAccepted = localStorage.getItem(DISCLAIMER_STORAGE_KEY)
		if (!hasAccepted) {
			setIsVisible(true)
		}
	}, [])

	const handleAccept = () => {
		localStorage.setItem(DISCLAIMER_STORAGE_KEY, 'true')
		setIsVisible(false)
		onAccept?.()
	}

	if (!isVisible) {
		return null
	}

	return (
		<div className={styles.overlay}>
			<div className={styles.modal} role="alertdialog" aria-modal="true" aria-labelledby="disclaimer-title" aria-describedby="disclaimer-description">
				{/* Warning Icon */}
				<div className={styles.iconWrapper}>
					<WarningIcon />
				</div>

				{/* Title */}
				<h2 id="disclaimer-title" className={styles.title}>
					Important Disclaimer
				</h2>

				{/* Description */}
				<div id="disclaimer-description" className={styles.description}>
					<p className={styles.paragraph}>
						This application is <strong>NOT</strong> affiliated with, endorsed by, or connected to Discord Inc. in any way.
					</p>
					<p className={styles.paragraph}>
						This is a <strong>mock interface</strong> created for development and testing purposes as part of the Robo.js framework.
					</p>
					<p className={styles.paragraphMuted}>
						Discord and the Discord logo are registered trademarks of Discord Inc.
					</p>
				</div>

				{/* Accept Button */}
				<button
					className={styles.acceptButton}
					onClick={handleAccept}
					type="button"
					autoFocus
				>
					I Understand
				</button>
			</div>
		</div>
	)
}

function WarningIcon() {
	return (
		<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
			<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-2h2v2h-2zm0-4V7h2v6h-2z" />
		</svg>
	)
}

export function useDisclaimerAccepted(): boolean {
	const [accepted, setAccepted] = useState(true)

	useEffect(() => {
		const hasAccepted = localStorage.getItem(DISCLAIMER_STORAGE_KEY)
		setAccepted(!!hasAccepted)
	}, [])

	return accepted
}
