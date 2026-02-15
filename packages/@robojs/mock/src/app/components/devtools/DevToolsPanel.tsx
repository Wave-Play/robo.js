import { useState, useEffect, useCallback, useRef, createContext, useContext, type ReactNode } from 'react'
import { EventLog } from './EventLog'
import { StateViewer } from './StateViewer'
import { NetworkLog } from './NetworkLog'
import { PerformanceMetrics } from './PerformanceMetrics'
import { ToolsPanel } from './ToolsPanel'
import { TestResults } from './TestResults'
import { PermissionsPanel } from './PermissionsPanel'
import { EmojisPanel } from './EmojisPanel'
import { ActivityRpcLog } from './ActivityRpcLog'
import styles from './DevToolsPanel.module.css'

export type Tab = 'events' | 'state' | 'network' | 'performance' | 'tools' | 'permissions' | 'tests' | 'emojis' | 'activity'

const STORAGE_KEY = 'stage_devtools_open'
const HEIGHT_STORAGE_KEY = 'stage_devtools_height'
const DEFAULT_HEIGHT = 400
const MIN_HEIGHT = 200
const MAX_HEIGHT_RATIO = 0.7

// Context for external control of DevTools
interface DevToolsContextValue {
	isOpen: boolean
	toggle: () => void
	open: (tab?: Tab) => void
	close: () => void
	initialTab?: Tab
	/** Currently requested tab - set when open(tab) is called */
	requestedTab?: Tab
	/** Clear the requested tab after it's been applied */
	clearRequestedTab: () => void
	/** Panel height in pixels */
	height: number
	/** Set panel height */
	setHeight: (height: number) => void
	/** Whether panel is maximized */
	isMaximized: boolean
	/** Toggle maximized state */
	toggleMaximize: () => void
}

const DevToolsContext = createContext<DevToolsContextValue | null>(null)

export function useDevTools(): DevToolsContextValue {
	const context = useContext(DevToolsContext)
	if (!context) {
		throw new Error('useDevTools must be used within a DevToolsProvider')
	}
	return context
}

interface DevToolsProviderProps {
	children: ReactNode
	/** Initial tab to show when opening DevTools */
	initialTab?: Tab
	/** Auto-open DevTools on mount */
	autoOpen?: boolean
}

export function DevToolsProvider({ children, initialTab, autoOpen }: DevToolsProviderProps) {
	const [isOpen, setIsOpen] = useState(() => {
		if (autoOpen) return true
		const stored = localStorage.getItem(STORAGE_KEY)
		return stored === 'true'
	})
	const [requestedTab, setRequestedTab] = useState<Tab | undefined>(undefined)
	const [height, setHeightState] = useState(() => {
		const stored = localStorage.getItem(HEIGHT_STORAGE_KEY)
		const parsed = stored ? parseInt(stored, 10) : NaN
		return isNaN(parsed) ? DEFAULT_HEIGHT : Math.max(MIN_HEIGHT, parsed)
	})
	const [isMaximized, setIsMaximized] = useState(false)

	useEffect(() => {
		localStorage.setItem(STORAGE_KEY, String(isOpen))
	}, [isOpen])

	useEffect(() => {
		localStorage.setItem(HEIGHT_STORAGE_KEY, String(height))
	}, [height])

	const toggle = useCallback(() => setIsOpen((o) => !o), [])
	const open = useCallback((tab?: Tab) => {
		if (tab) {
			setRequestedTab(tab)
		}
		setIsOpen(true)
	}, [])
	const close = useCallback(() => setIsOpen(false), [])
	const clearRequestedTab = useCallback(() => setRequestedTab(undefined), [])

	const setHeight = useCallback((newHeight: number) => {
		const maxHeight = window.innerHeight * MAX_HEIGHT_RATIO
		const clamped = Math.min(Math.max(newHeight, MIN_HEIGHT), maxHeight)
		setHeightState(clamped)
	}, [])

	const toggleMaximize = useCallback(() => {
		setIsMaximized((m) => !m)
	}, [])

	return (
		<DevToolsContext.Provider
			value={{
				isOpen,
				toggle,
				open,
				close,
				initialTab,
				requestedTab,
				clearRequestedTab,
				height,
				setHeight,
				isMaximized,
				toggleMaximize
			}}
		>
			{children}
		</DevToolsContext.Provider>
	)
}

export function DevToolsPanel() {
	const { isOpen, toggle, initialTab, requestedTab, clearRequestedTab, height, setHeight, isMaximized, toggleMaximize } =
		useDevTools()
	const [activeTab, setActiveTab] = useState<Tab>(initialTab || 'events')
	const [isClosing, setIsClosing] = useState(false)
	const [shouldRender, setShouldRender] = useState(isOpen)
	const isDragging = useRef(false)
	const startY = useRef(0)
	const startHeight = useRef(0)

	// Handle open/close transitions
	useEffect(() => {
		if (isOpen) {
			setShouldRender(true)
			setIsClosing(false)
		} else if (shouldRender) {
			setIsClosing(true)
			const timer = setTimeout(() => {
				setShouldRender(false)
				setIsClosing(false)
			}, 250) // Match animation duration
			return () => clearTimeout(timer)
		}
	}, [isOpen, shouldRender])

	// Handle requested tab changes from context
	useEffect(() => {
		if (requestedTab) {
			setActiveTab(requestedTab)
			clearRequestedTab()
		}
	}, [requestedTab, clearRequestedTab])

	// Keyboard shortcut: Ctrl/Cmd + Shift + D
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
				e.preventDefault()
				toggle()
			}
		}
		document.addEventListener('keydown', handler)
		return () => document.removeEventListener('keydown', handler)
	}, [toggle])

	// Handle resize drag
	const handleResizeStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault()
			isDragging.current = true
			startY.current = e.clientY
			startHeight.current = isMaximized ? window.innerHeight * MAX_HEIGHT_RATIO : height
			document.body.style.cursor = 'ns-resize'
			document.body.style.userSelect = 'none'
		},
		[height, isMaximized]
	)

	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			if (!isDragging.current) return
			const deltaY = startY.current - e.clientY
			const newHeight = startHeight.current + deltaY
			setHeight(newHeight)
		}

		const handleMouseUp = () => {
			if (isDragging.current) {
				isDragging.current = false
				document.body.style.cursor = ''
				document.body.style.userSelect = ''
			}
		}

		document.addEventListener('mousemove', handleMouseMove)
		document.addEventListener('mouseup', handleMouseUp)

		return () => {
			document.removeEventListener('mousemove', handleMouseMove)
			document.removeEventListener('mouseup', handleMouseUp)
		}
	}, [setHeight])

	// Double-click header to toggle maximize
	const handleHeaderDoubleClick = useCallback(() => {
		toggleMaximize()
	}, [toggleMaximize])

	// Don't render if not open and not animating
	if (!shouldRender) {
		return null
	}

	const panelHeight = isMaximized ? `${Math.round(window.innerHeight * MAX_HEIGHT_RATIO)}px` : `${height}px`

	const panelClasses = [styles.panel, isMaximized && styles.maximized, isClosing && styles.closing]
		.filter(Boolean)
		.join(' ')

	return (
		<div className={panelClasses} style={{ height: panelHeight }}>
			{/* Resize handle */}
			<div className={styles.resizeHandle} onMouseDown={handleResizeStart} />

			{/* Header with tabs */}
			<div className={styles.header} onDoubleClick={handleHeaderDoubleClick}>
				<div className={styles.tabs}>
					<button
						className={`${styles.tab} ${activeTab === 'events' ? styles.active : ''}`}
						onClick={() => setActiveTab('events')}
					>
						<EventsIcon />
						Events
					</button>
					<button
						className={`${styles.tab} ${activeTab === 'state' ? styles.active : ''}`}
						onClick={() => setActiveTab('state')}
					>
						<StateIcon />
						State
					</button>
					<button
						className={`${styles.tab} ${activeTab === 'network' ? styles.active : ''}`}
						onClick={() => setActiveTab('network')}
					>
						<NetworkIcon />
						Network
					</button>
					<button
						className={`${styles.tab} ${activeTab === 'performance' ? styles.active : ''}`}
						onClick={() => setActiveTab('performance')}
					>
						<MetricsIcon />
						Performance
					</button>
					<button
						className={`${styles.tab} ${activeTab === 'tools' ? styles.active : ''}`}
						onClick={() => setActiveTab('tools')}
					>
						<ToolsIcon />
						Tools
					</button>
					<button
						className={`${styles.tab} ${activeTab === 'permissions' ? styles.active : ''}`}
						onClick={() => setActiveTab('permissions')}
					>
						<PermissionsIcon />
						Permissions
					</button>
					<button
						className={`${styles.tab} ${activeTab === 'tests' ? styles.active : ''}`}
						onClick={() => setActiveTab('tests')}
					>
						<TestsIcon />
						Tests
					</button>
					<button
						className={`${styles.tab} ${activeTab === 'emojis' ? styles.active : ''}`}
						onClick={() => setActiveTab('emojis')}
					>
						<EmojisIcon />
						Emojis
					</button>
					<button
						className={`${styles.tab} ${activeTab === 'activity' ? styles.active : ''}`}
						onClick={() => setActiveTab('activity')}
					>
						<ActivityIcon />
						Activity
					</button>
				</div>

				<div className={styles.headerControls}>
					<button
						className={styles.maximizeButton}
						onClick={toggleMaximize}
						title={isMaximized ? 'Restore' : 'Maximize'}
					>
						{isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
					</button>
					<button className={styles.closeButton} onClick={toggle} title="Close Dev Tools">
						<CloseIcon />
					</button>
				</div>
			</div>

			{/* Tab content */}
			<div className={styles.content}>
				{activeTab === 'events' && <EventLog />}
				{activeTab === 'state' && <StateViewer />}
				{activeTab === 'network' && <NetworkLog />}
				{activeTab === 'performance' && <PerformanceMetrics />}
				{activeTab === 'tools' && <ToolsPanel />}
				{activeTab === 'permissions' && <PermissionsPanel />}
				{activeTab === 'tests' && <TestResults />}
				{activeTab === 'emojis' && <EmojisPanel />}
				{activeTab === 'activity' && <ActivityRpcLog />}
			</div>
		</div>
	)
}

// Icons
function EventsIcon() {
	return (
		<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
			<path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h11A1.5 1.5 0 0 1 15 2.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 13.5v-11zM3 4v1h10V4H3zm0 3v1h10V7H3zm0 3v1h5v-1H3z" />
		</svg>
	)
}

function StateIcon() {
	return (
		<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
			<path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H4zm0 1h8a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z" />
			<path d="M5 3h6v1H5V3zm0 3h6v1H5V6zm0 3h4v1H5V9z" />
		</svg>
	)
}

function MetricsIcon() {
	return (
		<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
			<path d="M4 11H2v3h2v-3zm5-4H7v7h2V7zm5-5h-2v12h2V2z" />
		</svg>
	)
}

function ToolsIcon() {
	return (
		<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
			<path d="M5 0v1h1v5.2L2 14v1h12v-1l-4-7.8V1h1V0H5zm2 1h2v5.4l3.5 6.6h-9L7 6.4V1z" />
		</svg>
	)
}

function PermissionsIcon() {
	return (
		<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
			<path d="M5.338 1.59a61.44 61.44 0 0 0-2.837.856.481.481 0 0 0-.328.39c-.554 4.157.726 7.19 2.253 9.188a10.725 10.725 0 0 0 2.287 2.233c.346.244.652.42.893.533.12.057.218.095.293.118a.55.55 0 0 0 .101.025.615.615 0 0 0 .1-.025c.076-.023.174-.061.294-.118.24-.113.547-.29.893-.533a10.726 10.726 0 0 0 2.287-2.233c1.527-1.997 2.807-5.031 2.253-9.188a.48.48 0 0 0-.328-.39c-.651-.213-1.75-.56-2.837-.855C9.552 1.29 8.531 1.067 8 1.067c-.53 0-1.552.223-2.662.524zM5.072.56C6.157.265 7.31 0 8 0s1.843.265 2.928.56c1.11.3 2.229.655 2.887.87a1.54 1.54 0 0 1 1.044 1.262c.596 4.477-.787 7.795-2.465 9.99a11.775 11.775 0 0 1-2.517 2.453 7.159 7.159 0 0 1-1.048.625c-.28.132-.581.24-.829.24s-.548-.108-.829-.24a7.158 7.158 0 0 1-1.048-.625 11.777 11.777 0 0 1-2.517-2.453C1.928 10.487.545 7.169 1.141 2.692A1.54 1.54 0 0 1 2.185 1.43 62.456 62.456 0 0 1 5.072.56z" />
		</svg>
	)
}

function TestsIcon() {
	return (
		<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
			<path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z" />
			<path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z" />
		</svg>
	)
}

function NetworkIcon() {
	return (
		<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
			<path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm7.5-6.923c-.67.204-1.335.82-1.887 1.855A7.97 7.97 0 0 0 5.145 4H7.5V1.077zM4.09 4a9.267 9.267 0 0 1 .64-1.539 6.7 6.7 0 0 1 .597-.933A7.025 7.025 0 0 0 2.255 4H4.09zm-.582 3.5c.03-.877.138-1.718.312-2.5H1.674a6.958 6.958 0 0 0-.656 2.5h2.49zM4.847 5a12.5 12.5 0 0 0-.338 2.5H7.5V5H4.847zM8.5 5v2.5h2.99a12.495 12.495 0 0 0-.337-2.5H8.5zM4.51 8.5a12.5 12.5 0 0 0 .337 2.5H7.5V8.5H4.51zm3.99 0V11h2.653c.187-.765.306-1.608.338-2.5H8.5zM5.145 12c.138.386.295.744.468 1.068.552 1.035 1.218 1.65 1.887 1.855V12H5.145zm.182 2.472a6.696 6.696 0 0 1-.597-.933A9.268 9.268 0 0 1 4.09 12H2.255a7.024 7.024 0 0 0 3.072 2.472zM3.82 11a13.652 13.652 0 0 1-.312-2.5h-2.49c.062.89.291 1.733.656 2.5H3.82zm6.853 3.472A7.024 7.024 0 0 0 13.745 12H11.91a9.27 9.27 0 0 1-.64 1.539 6.688 6.688 0 0 1-.597.933zM8.5 12v2.923c.67-.204 1.335-.82 1.887-1.855.173-.324.33-.682.468-1.068H8.5zm3.68-1h2.146c.365-.767.594-1.61.656-2.5h-2.49a13.65 13.65 0 0 1-.312 2.5zm2.802-3.5a6.959 6.959 0 0 0-.656-2.5H12.18c.174.782.282 1.623.312 2.5h2.49zM11.27 2.461c.247.464.462.98.64 1.539h1.835a7.024 7.024 0 0 0-3.072-2.472c.218.284.418.598.597.933z" />
		</svg>
	)
}

function CloseIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
		</svg>
	)
}

function MaximizeIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path d="M5.828 10.172a.5.5 0 0 0-.707 0l-4.096 4.096V11.5a.5.5 0 0 0-1 0v3.975a.5.5 0 0 0 .5.5H4.5a.5.5 0 0 0 0-1H1.732l4.096-4.096a.5.5 0 0 0 0-.707zm4.344-4.344a.5.5 0 0 0 .707 0l4.096-4.096V4.5a.5.5 0 1 0 1 0V.525a.5.5 0 0 0-.5-.5H11.5a.5.5 0 0 0 0 1h2.768l-4.096 4.096a.5.5 0 0 0 0 .707z" />
		</svg>
	)
}

function RestoreIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path d="M5.828 10.172a.5.5 0 0 0-.707-.707l-4.096 4.096V10.5a.5.5 0 0 0-1 0v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 0-1H1.732l4.096-4.096zm4.344-4.344a.5.5 0 0 0 .707.707l4.096-4.096V5.5a.5.5 0 1 0 1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 0 0 1h2.768l-4.096 4.096z" />
		</svg>
	)
}

function EmojisIcon() {
	return (
		<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
			<path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z" />
			<path d="M4.285 9.567a.5.5 0 0 1 .683.183A3.498 3.498 0 0 0 8 11.5a3.498 3.498 0 0 0 3.032-1.75.5.5 0 1 1 .866.5A4.498 4.498 0 0 1 8 12.5a4.498 4.498 0 0 1-3.898-2.25.5.5 0 0 1 .183-.683zM7 6.5C7 7.328 6.552 8 6 8s-1-.672-1-1.5S5.448 5 6 5s1 .672 1 1.5zm4 0c0 .828-.448 1.5-1 1.5s-1-.672-1-1.5S9.448 5 10 5s1 .672 1 1.5z" />
		</svg>
	)
}

function ActivityIcon() {
	return (
		<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
			<path d="M6.5 1A1.5 1.5 0 0 0 5 2.5V3H1.5A1.5 1.5 0 0 0 0 4.5v8A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 14.5 3H11v-.5A1.5 1.5 0 0 0 9.5 1h-3zM6 2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V3H6v-.5zM1.5 4h13a.5.5 0 0 1 .5.5V7H1V4.5a.5.5 0 0 1 .5-.5zM1 8h14v4.5a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5V8z" />
		</svg>
	)
}
