import { useState, useCallback, useRef, useEffect } from 'react'
import { useLogsFilters } from '../../stores/logsStore'
import type { SessionLogLevel } from '../../../types/index.js'
import styles from './LogSearchBar.module.css'

// Log level metadata for display
const LOG_LEVELS: { level: SessionLogLevel; label: string; color: string }[] = [
	{ level: 'trace', label: 'TRACE', color: '#808090' },
	{ level: 'debug', label: 'DEBUG', color: '#3b82f6' },
	{ level: 'info', label: 'INFO', color: '#22c55e' },
	{ level: 'warn', label: 'WARN', color: '#f59e0b' },
	{ level: 'error', label: 'ERROR', color: '#ef4444' }
]

interface LogSearchBarProps {
	className?: string
}

export function LogSearchBar({ className }: LogSearchBarProps) {
	const { filters, setSearchFilter, setLevelFilter, setSessionFilter } = useLogsFilters()
	const [isDropdownOpen, setIsDropdownOpen] = useState(false)
	const [inputValue, setInputValue] = useState('')
	const dropdownRef = useRef<HTMLDivElement>(null)
	const inputRef = useRef<HTMLInputElement>(null)

	// Sync input value with filters (for external changes)
	useEffect(() => {
		// Build display value from current filters
		const value = filters.search
		// If level filter is active, we show it as a chip, not in the input
		setInputValue(value)
	}, [filters.search])

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
				setIsDropdownOpen(false)
			}
		}

		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [])

	const handleInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = e.target.value
			setInputValue(value)

			// Parse query syntax: session:xxx
			const sessionMatch = value.match(/session:(\S+)/i)
			if (sessionMatch) {
				const sessionId = sessionMatch[1]
				setSessionFilter(sessionId)
				const remainingText = value.replace(/session:\S+\s*/i, '').trim()
				setSearchFilter(remainingText)
				setInputValue(remainingText)
				return
			}

			// Parse query syntax: level=info, level=debug, etc.
			const levelMatch = value.match(/level=(\w+)/i)
			if (levelMatch) {
				const levelStr = levelMatch[1].toLowerCase()
				const validLevel = LOG_LEVELS.find((l) => l.level === levelStr)
				if (validLevel) {
					// Set level filter and remove from search text
					setLevelFilter(new Set([validLevel.level]))
					const remainingText = value.replace(/level=\w+\s*/i, '').trim()
					setSearchFilter(remainingText)
					setInputValue(remainingText)
					return
				}
			}

			setSearchFilter(value)
		},
		[setSearchFilter, setLevelFilter, setSessionFilter]
	)

	const handleInputFocus = useCallback(() => {
		setIsDropdownOpen(true)
	}, [])

	const handleClearAll = useCallback(() => {
		setInputValue('')
		setSearchFilter('')
		setLevelFilter(new Set())
		setSessionFilter(null)
		inputRef.current?.focus()
	}, [setSearchFilter, setLevelFilter, setSessionFilter])

	const handleLevelSelect = useCallback(
		(level: SessionLogLevel) => {
			// Toggle level in filter
			const newLevels = new Set(filters.levels)
			if (newLevels.has(level)) {
				newLevels.delete(level)
			} else {
				newLevels.add(level)
			}
			setLevelFilter(newLevels)
			setIsDropdownOpen(false)
			inputRef.current?.focus()
		},
		[filters.levels, setLevelFilter]
	)

	const handleRemoveLevelChip = useCallback(
		(level: SessionLogLevel) => {
			const newLevels = new Set(filters.levels)
			newLevels.delete(level)
			setLevelFilter(newLevels)
		},
		[filters.levels, setLevelFilter]
	)

	const handleRemoveSessionChip = useCallback(() => {
		setSessionFilter(null)
	}, [setSessionFilter])

	const hasActiveFilters = filters.levels.size > 0 || filters.search.length > 0 || filters.sessionId !== null

	return (
		<div className={`${styles.container} ${className || ''}`} ref={dropdownRef}>
			<div className={styles.searchBox}>
				<SearchIcon />

				{/* Active filter chips */}
				{(filters.levels.size > 0 || filters.sessionId) && (
					<div className={styles.chips}>
						{/* Session chip */}
						{filters.sessionId && (
							<span
								className={styles.chip}
								style={{ '--chip-color': '#7289da' } as React.CSSProperties}
							>
								session:{filters.sessionId.length > 12 ? filters.sessionId.slice(0, 12) + '...' : filters.sessionId}
								<button
									className={styles.chipRemove}
									onClick={handleRemoveSessionChip}
									aria-label="Remove session filter"
								>
									<CloseIcon />
								</button>
							</span>
						)}
						{/* Level chips */}
						{Array.from(filters.levels).map((level) => {
							const meta = LOG_LEVELS.find((l) => l.level === level)
							return (
								<span
									key={level}
									className={styles.chip}
									style={{ '--chip-color': meta?.color } as React.CSSProperties}
								>
									level={level}
									<button
										className={styles.chipRemove}
										onClick={() => handleRemoveLevelChip(level)}
										aria-label={`Remove ${level} filter`}
									>
										<CloseIcon />
									</button>
								</span>
							)
						})}
					</div>
				)}

				<input
					ref={inputRef}
					type="text"
					className={styles.input}
					placeholder={filters.levels.size > 0 || filters.sessionId ? 'Search...' : 'Search logs or type level=info, session:xxx...'}
					value={inputValue}
					onChange={handleInputChange}
					onFocus={handleInputFocus}
				/>

				{hasActiveFilters && (
					<button className={styles.clearButton} onClick={handleClearAll} title="Clear all filters">
						<CloseIcon />
					</button>
				)}
			</div>

			{/* Dropdown with filter options */}
			{isDropdownOpen && (
				<div className={styles.dropdown}>
					<div className={styles.dropdownSection}>
						<span className={styles.dropdownLabel}>Filter by level</span>
						{LOG_LEVELS.map(({ level, label, color }) => {
							const isActive = filters.levels.has(level)
							return (
								<button
									key={level}
									className={`${styles.dropdownItem} ${isActive ? styles.active : ''}`}
									onClick={() => handleLevelSelect(level)}
								>
									<span className={styles.levelDot} style={{ background: color }} />
									<span className={styles.levelLabel}>{label}</span>
									{isActive && <CheckIcon />}
								</button>
							)
						})}
					</div>

					<div className={styles.dropdownHint}>
						Tip: Type <code>level=info</code> or <code>session:xxx</code> to filter
					</div>
				</div>
			)}
		</div>
	)
}

// Icons
function SearchIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className={styles.searchIcon}>
			<path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z" />
		</svg>
	)
}

function CloseIcon() {
	return (
		<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
			<path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
		</svg>
	)
}

function CheckIcon() {
	return (
		<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className={styles.checkIcon}>
			<path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
		</svg>
	)
}
