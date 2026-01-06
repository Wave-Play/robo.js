import { useState, useEffect, useCallback } from 'react'
import { useSession } from '../../hooks/useSession'
import { normalizeStageSessionId } from '../../utils'
import styles from './ConnectionScreen.module.css'

// Detect if user is on macOS
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)

export function ConnectionScreen() {
	const { sessionId, isConnecting, error, setSessionId, connect, hasGivenUp, isSessionInvalid, retryCount, retry } = useSession()
	const [inputValue, setInputValue] = useState(sessionId || '')
	const [isCreating, setIsCreating] = useState(false)
	const [createError, setCreateError] = useState<string | null>(null)

	// Extract token from URL on mount and auto-connect
	useEffect(() => {
		const params = new URLSearchParams(window.location.search)
		const token = params.get('token')
		if (token && !sessionId) {
			const cleanToken = normalizeStageSessionId(token)
			setInputValue(cleanToken)
			setSessionId(cleanToken)
			// Small delay to ensure state is updated before connecting
			setTimeout(() => connect(), 50)
		}
	}, []) // Run only on mount

	// Detect API prefix from current URL
	const getApiPrefix = useCallback(() => {
		const pathname = window.location.pathname
		const stageIndex = pathname.indexOf('/stage')
		return stageIndex !== -1 ? pathname.slice(0, stageIndex) : ''
	}, [])

	// Create a new session via control API
	const createNewSession = useCallback(async () => {
		setIsCreating(true)
		setCreateError(null)

		try {
			const prefix = getApiPrefix()
			const response = await fetch(`${prefix}/api/control/sessions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			})

			if (!response.ok) {
				throw new Error(`Failed to create session: ${response.statusText}`)
			}

			const data = await response.json()
			const newSessionId = data.sessionId || data.id || data.session_id

			if (newSessionId) {
				setInputValue(newSessionId)
				// Focus the input after creating
				const input = document.querySelector('input[type="text"]') as HTMLInputElement
				input?.focus()
			} else {
				throw new Error('No session ID returned')
			}
		} catch (err) {
			setCreateError(err instanceof Error ? err.message : 'Failed to create session')
		} finally {
			setIsCreating(false)
		}
	}, [getApiPrefix])

	// Keyboard shortcut: Cmd/Ctrl+K to create new session
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault()
				if (!isCreating && !isConnecting) {
					createNewSession()
				}
			}
		}

		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [createNewSession, isCreating, isConnecting])

	const handleConnect = () => {
		if (inputValue.trim()) {
			const cleanSessionId = normalizeStageSessionId(inputValue)
			setInputValue(cleanSessionId)
			setSessionId(cleanSessionId)
			// Small delay to ensure state is updated
			setTimeout(() => connect(), 0)
		}
	}

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			handleConnect()
		}
	}

	return (
		<div className={styles.container}>
			<div className={styles.card}>
				<div className={styles.logo}>
					<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
						<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
					</svg>
				</div>

				<h1 className={styles.title}>Stage</h1>
				<p className={styles.subtitle}>Discord Gateway Mock Server</p>

				<div className={styles.form}>
					<label className={styles.label}>Session ID</label>
					<input
						type="text"
						className={styles.input}
						placeholder="Enter session ID (e.g., sess_abc123)"
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onKeyDown={handleKeyDown}
						disabled={isConnecting || isCreating}
					/>

					<button className={styles.button} onClick={handleConnect} disabled={isConnecting || !inputValue.trim()}>
						{isConnecting ? (
							<>
								<span className={styles.spinner} />
								Connecting...
							</>
						) : (
							'Connect'
						)}
					</button>

					{/* Session invalid state - stale token */}
					{isSessionInvalid && (
						<div className={styles.sessionInvalid}>
							<div className={styles.warningIcon}>⚠️</div>
							<p className={styles.invalidTitle}>Session no longer exists</p>
							<p className={styles.invalidHint}>The server may have restarted. Check your terminal for the new Stage URL.</p>
						</div>
					)}

					{/* Given up state - connection issues after max retries */}
					{hasGivenUp && !isSessionInvalid && (
						<div className={styles.givenUp}>
							<p className={styles.givenUpTitle}>Connection lost</p>
							<p className={styles.givenUpHint}>Failed after {retryCount} attempts</p>
							<button className={styles.retryButton} onClick={retry}>
								Retry Connection
							</button>
						</div>
					)}

					{/* Regular error (not session invalid or given up) */}
					{(error || createError) && !isSessionInvalid && !hasGivenUp && (
						<div className={styles.error}>{error || createError}</div>
					)}
				</div>

				<div className={styles.help}>
					<p>
						Press <kbd className={styles.kbd}>{isMac ? '⌘' : 'Ctrl+'}K</kbd> to create a new session
					</p>
				</div>
			</div>
		</div>
	)
}
