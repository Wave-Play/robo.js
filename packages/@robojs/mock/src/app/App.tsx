import { useState, useEffect, useCallback } from 'react'
import { useSession } from './hooks/useSession'
import { usePlayback } from './stores/playbackStore'
import { AppShell } from './components/layout/AppShell'
import { ConnectionScreen } from './components/layout/ConnectionScreen'
import { ConnectionStatusOverlay } from './components/layout/ConnectionStatusOverlay'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { KeyboardShortcuts } from './components/common/KeyboardShortcuts'
import { Modal } from './components/modals/Modal'
import { DisclaimerModal } from './components/modals/DisclaimerModal'
import { DevToolsPanel } from './components/devtools/DevToolsPanel'
import './styles/discord-theme.css'
import './styles/globals.css'

interface AppProps {
	/** Test results viewing mode - bypasses session requirement */
	testResultsMode?: boolean
}

export default function App({ testResultsMode = false }: AppProps) {
	// UI-only mode: render the mock Discord Friends layout without requiring a Stage session.
	// (This is intentionally static – no routing/logic for tabs, just the UI elements.)
	const UI_ONLY = false

	if (UI_ONLY) {
		return (
			<ErrorBoundary>
				<KeyboardShortcuts />
				<AppShell />
				<DisclaimerModal />
			</ErrorBoundary>
		)
	}

	// Test results mode - show DevTools with Tests tab without requiring session
	if (testResultsMode) {
		return (
			<ErrorBoundary>
				<KeyboardShortcuts />
				<div style={{
					display: 'flex',
					flexDirection: 'column',
					height: '100vh',
					background: 'var(--main-chat-background)'
				}}>
					<div style={{
						flex: 1,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						color: 'var(--text-muted)',
						flexDirection: 'column',
						gap: '16px'
					}}>
						<h2 style={{ margin: 0, color: 'var(--text-bright)' }}>Test Results Viewer</h2>
						<p style={{ margin: 0 }}>View test results in the DevTools panel below</p>
						<p style={{ margin: 0, fontSize: '12px' }}>
							Press <kbd style={{ background: 'var(--sidebar-left-background)', padding: '2px 6px', borderRadius: '4px' }}>Ctrl+Shift+D</kbd> to toggle DevTools
						</p>
					</div>
					<DevToolsPanel />
				</div>
				<DisclaimerModal />
			</ErrorBoundary>
		)
	}

	const { isConnected, sessionId, activeModal, submitModal, closeModal } = useSession()
	const playbackState = usePlayback()
	// Playback mode is active when mode is 'playback' - events may still be loading
	const isInPlaybackMode = playbackState.mode === 'playback'
	const [hasEverConnected, setHasEverConnected] = useState(false)
	const [showConnectionScreen, setShowConnectionScreen] = useState(false)

	// Track when we first connect successfully (or enter playback mode)
	useEffect(() => {
		if ((isConnected || isInPlaybackMode) && !hasEverConnected) {
			setHasEverConnected(true)
			setShowConnectionScreen(false)
		}
	}, [isConnected, isInPlaybackMode, hasEverConnected])

	// Handle "Change Session" - show connection screen overlay
	const handleChangeSession = useCallback(() => {
		setShowConnectionScreen(true)
	}, [])

	// Handle modal submission
	const handleModalSubmit = async (customId: string, components: Parameters<typeof submitModal>[1]) => {
		await submitModal(customId, components)
		closeModal()
	}

	// Show connection screen if never connected (and not in playback mode), or if user explicitly requested it
	if ((!hasEverConnected && !isInPlaybackMode && (!isConnected || !sessionId)) || showConnectionScreen) {
		return (
			<ErrorBoundary>
				{hasEverConnected ? (
					// Show as overlay on top of existing UI
					<>
						<KeyboardShortcuts />
						<AppShell />
						<div style={{ position: 'fixed', inset: 0, background: 'var(--card-background)', zIndex: 9998 }}>
							<ConnectionScreen />
						</div>
					</>
				) : (
					<>
						<ConnectionScreen />
						<DevToolsPanel />
					</>
				)}
				<DisclaimerModal />
			</ErrorBoundary>
		)
	}

	// Show main app shell when connected (or was previously connected)
	return (
		<ErrorBoundary>
			<KeyboardShortcuts />
			<ConnectionStatusOverlay onChangeSession={handleChangeSession} />
			<AppShell />
			{activeModal && <Modal modal={activeModal.modal} onClose={closeModal} onSubmit={handleModalSubmit} />}
			<DisclaimerModal />
		</ErrorBoundary>
	)
}
