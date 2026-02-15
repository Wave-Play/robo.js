import { useState, useMemo, useRef, useEffect } from 'react'
import { useSession, useSessionDispatch } from '../../stores/sessionStore'
import { JsonViewer } from './JsonViewer'
import type { ActivityRpcLogEntry } from '../../stores/sessionStore'
import styles from './ActivityRpcLog.module.css'

type DirectionFilter = 'all' | 'inbound' | 'outbound'

function formatTime(timestamp: number): string {
	const d = new Date(timestamp)
	return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`
}

export function ActivityRpcLog() {
	const state = useSession()
	const dispatch = useSessionDispatch()
	const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all')
	const [searchText, setSearchText] = useState('')
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const listRef = useRef<HTMLDivElement>(null)
	const autoScrollRef = useRef(true)

	const { activityRpcLog, activityLastReady, activitySubscriptions, activity } = state

	// Filter entries
	const filteredEntries = useMemo(() => {
		let entries = activityRpcLog
		if (directionFilter !== 'all') {
			entries = entries.filter((e) => e.direction === directionFilter)
		}
		if (searchText) {
			const lower = searchText.toLowerCase()
			entries = entries.filter(
				(e) =>
					(e.cmd && e.cmd.toLowerCase().includes(lower)) ||
					(e.evt && e.evt.toLowerCase().includes(lower)) ||
					(e.nonce && e.nonce.toLowerCase().includes(lower))
			)
		}
		return entries
	}, [activityRpcLog, directionFilter, searchText])

	// Find selected entry
	const selectedEntry = useMemo(() => {
		if (!selectedId) return null
		return activityRpcLog.find((e) => e.id === selectedId) ?? null
	}, [selectedId, activityRpcLog])

	// Auto-scroll to latest entry
	useEffect(() => {
		if (autoScrollRef.current && listRef.current) {
			listRef.current.scrollTop = listRef.current.scrollHeight
		}
	}, [filteredEntries.length])

	// Track scroll position to decide auto-scroll
	const handleScroll = () => {
		if (!listRef.current) return
		const { scrollTop, scrollHeight, clientHeight } = listRef.current
		autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 50
	}

	if (!activity?.isOpen) {
		return (
			<div className={styles.container}>
				<div className={styles.empty}>No Activity is currently running. Launch an Activity to see RPC messages.</div>
			</div>
		)
	}

	return (
		<div className={styles.container}>
			{/* Left pane: info sections + log list */}
			<div className={styles.listPane}>
				{/* READY payload summary */}
				{activityLastReady && (
					<div className={styles.infoSection}>
						<div className={styles.infoTitle}>Last READY</div>
						<div className={styles.infoContent}>
							<JsonViewer data={activityLastReady} collapsed={1} />
						</div>
					</div>
				)}

				{/* Active subscriptions */}
				{activitySubscriptions.length > 0 && (
					<div className={styles.infoSection}>
						<div className={styles.infoTitle}>
							Active Subscriptions ({activitySubscriptions.length})
						</div>
						<div className={styles.subscriptionList}>
							{activitySubscriptions.map((sub) => (
								<span key={sub} className={styles.subscriptionTag}>
									{sub}
								</span>
							))}
						</div>
					</div>
				)}

				{/* Filters */}
				<div className={styles.filters}>
					<select
						className={styles.directionFilter}
						value={directionFilter}
						onChange={(e) => setDirectionFilter(e.target.value as DirectionFilter)}
					>
						<option value="all">All</option>
						<option value="inbound">Inbound</option>
						<option value="outbound">Outbound</option>
					</select>
					<input
						className={styles.searchInput}
						type="text"
						placeholder="Filter by cmd/evt..."
						value={searchText}
						onChange={(e) => setSearchText(e.target.value)}
					/>
					<button
						className={styles.clearButton}
						onClick={() => dispatch({ type: 'CLEAR_ACTIVITY_RPC_LOG' })}
					>
						Clear
					</button>
					<span className={styles.count}>{filteredEntries.length}</span>
				</div>

				{/* Log entries */}
				<div className={styles.logList} ref={listRef} onScroll={handleScroll}>
					{filteredEntries.length === 0 ? (
						<div className={styles.empty}>
							{activityRpcLog.length === 0 ? 'Waiting for RPC messages...' : 'No matching entries'}
						</div>
					) : (
						filteredEntries.map((entry) => (
							<LogEntry
								key={entry.id}
								entry={entry}
								isSelected={selectedId === entry.id}
								onClick={() => setSelectedId(selectedId === entry.id ? null : entry.id)}
							/>
						))
					)}
				</div>
			</div>

			{/* Right pane: detail */}
			<div className={styles.detailPane}>
				{selectedEntry ? (
					<>
						<div className={styles.detailHeader}>
							<span
								className={`${styles.direction} ${
									selectedEntry.direction === 'inbound' ? styles.inbound : styles.outbound
								}`}
							>
								{selectedEntry.direction === 'inbound' ? 'IN' : 'OUT'}
							</span>
							{selectedEntry.cmd || selectedEntry.evt || 'Message'}
							{selectedEntry.nonce && (
								<span className={styles.nonce}>nonce: {selectedEntry.nonce}</span>
							)}
						</div>
						<div className={styles.detailContent}>
							<JsonViewer data={selectedEntry.data} collapsed={2} />
						</div>
					</>
				) : (
					<div className={styles.noSelection}>
						<span>Select an entry to view details</span>
					</div>
				)}
			</div>
		</div>
	)
}

function LogEntry({
	entry,
	isSelected,
	onClick
}: {
	entry: ActivityRpcLogEntry
	isSelected: boolean
	onClick: () => void
}) {
	const classes = [
		styles.logEntry,
		isSelected && styles.selected,
		entry.error && styles.error
	]
		.filter(Boolean)
		.join(' ')

	return (
		<div className={classes} onClick={onClick}>
			<span
				className={`${styles.direction} ${
					entry.direction === 'inbound' ? styles.inbound : styles.outbound
				}`}
			>
				{entry.direction === 'inbound' ? 'IN' : 'OUT'}
			</span>
			<span className={styles.timestamp}>{formatTime(entry.timestamp)}</span>
			<span className={styles.command}>
				{entry.cmd || ''}
				{entry.evt && <span className={styles.eventName}> {entry.evt}</span>}
			</span>
			{entry.nonce && <span className={styles.nonce}>{entry.nonce.slice(0, 8)}</span>}
		</div>
	)
}
