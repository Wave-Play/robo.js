import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { usePlayback } from '../../stores/playbackStore'
import { useStageData } from '../../hooks/useStageData'
import { JsonViewer } from './JsonViewer'
import type { StageRESTCallData } from '../../types/stage'
import styles from './NetworkLog.module.css'

interface RESTCall {
	id: string
	seq: number
	timestamp: number
	data: StageRESTCallData
}

interface RouteInfo {
	path: string
	methods: string[]
	key: string
	category: string
}

interface RequestResult {
	status: number
	statusText: string
	headers: Record<string, string>
	body: unknown
	duration: number
	timestamp: number
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
type HttpMethod = (typeof HTTP_METHODS)[number]

/**
 * Network tab - REST client and API call log.
 * Allows making requests with autocomplete and viewing bot API calls.
 */
export function NetworkLog() {
	// Keep usePlayback for raw events access
	const { events } = usePlayback()
	const { sessionId } = useStageData()

	// Detect URL prefix by finding everything before /stage in the current path
	// e.g., /foo/bar/stage/index.html → prefix is /foo/bar
	const urlPrefix = useMemo(() => {
		const pathname = window.location.pathname
		const stageIndex = pathname.indexOf('/stage')
		return stageIndex > 0 ? pathname.slice(0, stageIndex) : ''
	}, [])

	// Request builder state
	const [method, setMethod] = useState<HttpMethod>('GET')
	const [path, setPath] = useState(() => `${urlPrefix}/api/v10/`)
	const [body, setBody] = useState('')
	const [isExecuting, setIsExecuting] = useState(false)
	const [result, setResult] = useState<RequestResult | null>(null)
	const [error, setError] = useState<string | null>(null)

	// Autocomplete state
	const [routes, setRoutes] = useState<RouteInfo[]>([])
	const [showAutocomplete, setShowAutocomplete] = useState(false)
	const [selectedSuggestion, setSelectedSuggestion] = useState(0)
	const inputRef = useRef<HTMLInputElement>(null)
	const autocompleteRef = useRef<HTMLDivElement>(null)

	// Log filter state
	const [filter, setFilter] = useState('')
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const [activeTab, setActiveTab] = useState<'client' | 'log'>('client')

	// Fetch routes on mount
	useEffect(() => {
		const routesUrl = `${urlPrefix}/api/stage/routes`
		console.log('[NetworkLog] Fetching routes from', routesUrl, '(prefix:', urlPrefix || 'none', ')')
		fetch(routesUrl)
			.then((res) => {
				console.log('[NetworkLog] Routes response status:', res.status)
				if (!res.ok) {
					throw new Error(`HTTP ${res.status}: ${res.statusText}`)
				}
				return res.json()
			})
			.then((data) => {
				console.log('[NetworkLog] Routes data received:', data)
				if (data.routes && Array.isArray(data.routes)) {
					// Apply prefix to route paths
					const prefixedRoutes = data.routes.map((route: RouteInfo) => ({
						...route,
						path: urlPrefix + route.path
					}))
					console.log('[NetworkLog] Setting routes:', prefixedRoutes.length, 'routes with prefix:', urlPrefix || 'none')
					setRoutes(prefixedRoutes)
				} else {
					console.warn('[NetworkLog] Invalid routes data format:', data)
				}
			})
			.catch((err) => {
				console.error('[NetworkLog] Failed to fetch routes:', err)
			})
	}, [urlPrefix])

	// Filter suggestions based on input
	const suggestions = useMemo(() => {
		if (!path || path.length < 2) {
			return []
		}
		const lowerPath = path.toLowerCase()
		return routes.filter((r) => r.path.toLowerCase().includes(lowerPath))
	}, [routes, path])

	// Handle path input change
	const handlePathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setPath(e.target.value)
		setShowAutocomplete(true)
		setSelectedSuggestion(0)
	}

	// Handle autocomplete keyboard navigation
	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (!showAutocomplete || suggestions.length === 0) {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault()
				executeRequest()
			}
			return
		}

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault()
				setSelectedSuggestion((prev) => Math.min(prev + 1, suggestions.length - 1))
				break
			case 'ArrowUp':
				e.preventDefault()
				setSelectedSuggestion((prev) => Math.max(prev - 1, 0))
				break
			case 'Enter':
				e.preventDefault()
				if (suggestions[selectedSuggestion]) {
					setPath(suggestions[selectedSuggestion].path)
					setShowAutocomplete(false)
				}
				break
			case 'Escape':
				setShowAutocomplete(false)
				break
			case 'Tab':
				if (suggestions[selectedSuggestion]) {
					e.preventDefault()
					setPath(suggestions[selectedSuggestion].path)
					setShowAutocomplete(false)
				}
				break
		}
	}

	// Select suggestion
	const selectSuggestion = (route: RouteInfo) => {
		setPath(route.path)
		setShowAutocomplete(false)
		inputRef.current?.focus()
	}

	// Close autocomplete on click outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (
				autocompleteRef.current &&
				!autocompleteRef.current.contains(e.target as Node) &&
				inputRef.current &&
				!inputRef.current.contains(e.target as Node)
			) {
				setShowAutocomplete(false)
			}
		}
		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [])

	// Execute request
	const executeRequest = useCallback(async () => {
		if (!path || isExecuting) return

		setIsExecuting(true)
		setError(null)
		setResult(null)

		const startTime = performance.now()

		try {
			const headers: Record<string, string> = {
				'Content-Type': 'application/json'
			}

			// Add session token if available
			if (sessionId) {
				headers['Authorization'] = `Bot mock_${sessionId}`
			}

			const options: RequestInit = {
				method,
				headers
			}

			// Add body for non-GET requests
			if (method !== 'GET' && body.trim()) {
				try {
					// Validate JSON
					JSON.parse(body)
					options.body = body
				} catch {
					setError('Invalid JSON in request body')
					setIsExecuting(false)
					return
				}
			}

			const response = await fetch(path, options)
			const duration = performance.now() - startTime

			// Parse response headers
			const responseHeaders: Record<string, string> = {}
			response.headers.forEach((value, key) => {
				responseHeaders[key] = value
			})

			// Parse response body
			let responseBody: unknown
			const contentType = response.headers.get('content-type') || ''
			if (contentType.includes('application/json')) {
				responseBody = await response.json()
			} else {
				responseBody = await response.text()
			}

			setResult({
				status: response.status,
				statusText: response.statusText,
				headers: responseHeaders,
				body: responseBody,
				duration,
				timestamp: Date.now()
			})
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err))
		} finally {
			setIsExecuting(false)
		}
	}, [path, method, body, sessionId, isExecuting])

	// Filter for rest_call events
	const restCalls = useMemo(() => {
		return events
			.filter((e) => e.type === 'rest_call')
			.map((e) => ({
				id: e.id,
				seq: e.seq,
				timestamp: e.timestamp,
				data: e.data as StageRESTCallData
			})) as RESTCall[]
	}, [events])

	// Apply text filter
	const filteredCalls = useMemo(() => {
		if (!filter) return restCalls
		const lowerFilter = filter.toLowerCase()
		return restCalls.filter((call) => {
			const path = call.data.path?.toLowerCase() || ''
			const method = call.data.method?.toLowerCase() || ''
			const endpoint = call.data.endpoint?.toLowerCase() || ''
			return path.includes(lowerFilter) || method.includes(lowerFilter) || endpoint.includes(lowerFilter)
		})
	}, [restCalls, filter])

	// Get selected call details
	const selectedCall = selectedId ? restCalls.find((c) => c.id === selectedId) : null

	// Get method CSS class
	const getMethodClass = (method: string) => {
		switch (method.toUpperCase()) {
			case 'GET':
				return styles.methodGET
			case 'POST':
				return styles.methodPOST
			case 'PATCH':
				return styles.methodPATCH
			case 'PUT':
				return styles.methodPUT
			case 'DELETE':
				return styles.methodDELETE
			default:
				return ''
		}
	}

	// Get status CSS class
	const getStatusClass = (status: number) => {
		if (status >= 200 && status < 300) return styles.status2xx
		if (status >= 300 && status < 400) return styles.status3xx
		if (status >= 400 && status < 500) return styles.status4xx
		return styles.status5xx
	}

	// Format duration
	const formatDuration = (ms: number) => {
		if (ms < 1) return '<1ms'
		if (ms < 1000) return `${Math.round(ms)}ms`
		return `${(ms / 1000).toFixed(2)}s`
	}

	// Format timestamp
	const formatTimestamp = (ts: number) => {
		const date = new Date(ts)
		return date.toLocaleTimeString('en-US', { hour12: false })
	}

	return (
		<div className={styles.container}>
			{/* Tab bar */}
			<div className={styles.tabBar}>
				<button
					className={`${styles.tabButton} ${activeTab === 'client' ? styles.active : ''}`}
					onClick={() => setActiveTab('client')}
				>
					<SendIcon />
					Client
				</button>
				<button
					className={`${styles.tabButton} ${activeTab === 'log' ? styles.active : ''}`}
					onClick={() => setActiveTab('log')}
				>
					<ListIcon />
					Log
					{restCalls.length > 0 && <span className={styles.badge}>{restCalls.length}</span>}
				</button>
			</div>

			{/* Client tab */}
			{activeTab === 'client' && (
				<div className={styles.clientPane}>
					{/* Request builder */}
					<div className={styles.requestBuilder}>
						<div className={styles.requestRow}>
							{/* Method selector */}
							<select
								className={`${styles.methodSelect} ${getMethodClass(method)}`}
								value={method}
								onChange={(e) => setMethod(e.target.value as HttpMethod)}
							>
								{HTTP_METHODS.map((m) => (
									<option key={m} value={m}>
										{m}
									</option>
								))}
							</select>

							{/* Path input with autocomplete */}
							<div className={styles.pathInputWrapper}>
								<input
									ref={inputRef}
									type="text"
									className={styles.pathInput}
									placeholder="/api/v10/channels/:id/messages"
									value={path}
									onChange={handlePathChange}
									onKeyDown={handleKeyDown}
									onFocus={() => setShowAutocomplete(true)}
								/>

								{/* Autocomplete dropdown */}
								{showAutocomplete && suggestions.length > 0 && (
									<div ref={autocompleteRef} className={styles.autocomplete}>
										{suggestions.map((route, index) => (
											<div
												key={route.key}
												className={`${styles.suggestion} ${index === selectedSuggestion ? styles.selected : ''}`}
												onClick={() => selectSuggestion(route)}
											>
												<span className={styles.suggestionPath}>{route.path}</span>
												<span className={styles.suggestionMethods}>
													{route.methods.slice(0, 3).join(' ')}
												</span>
											</div>
										))}
									</div>
								)}
							</div>

							{/* Send button */}
							<button
								className={styles.sendButton}
								onClick={executeRequest}
								disabled={isExecuting || !path}
							>
								{isExecuting ? <SpinnerIcon /> : <SendIcon />}
								Send
							</button>
						</div>

						{/* Body editor for non-GET requests */}
						{method !== 'GET' && (
							<div className={styles.bodyEditor}>
								<label className={styles.bodyLabel}>Request Body (JSON)</label>
								<textarea
									className={styles.bodyTextarea}
									placeholder='{"content": "Hello, world!"}'
									value={body}
									onChange={(e) => setBody(e.target.value)}
									rows={4}
								/>
							</div>
						)}
					</div>

					{/* Response area */}
					<div className={styles.responseArea}>
						{error && (
							<div className={styles.errorBox}>
								<span className={styles.errorIcon}>!</span>
								{error}
							</div>
						)}

						{result && (
							<div className={styles.resultBox}>
								{/* Status line */}
								<div className={styles.statusLine}>
									<span className={`${styles.statusCode} ${getStatusClass(result.status)}`}>
										{result.status} {result.statusText}
									</span>
									<span className={styles.resultDuration}>{formatDuration(result.duration)}</span>
								</div>

								{/* Response body */}
								<div className={styles.responseBody}>
									<div className={styles.responseLabel}>Response</div>
									<JsonViewer data={result.body} collapsed={2} />
								</div>
							</div>
						)}

						{!error && !result && (
							<div className={styles.clientEmpty}>
								<NetworkIcon />
								<p>Enter a path and click Send to make a request</p>
								<p className={styles.hint}>
									Try <code>/api/v10/users/@me</code> or <code>/api/control/sessions</code>
								</p>
							</div>
						)}
					</div>
				</div>
			)}

			{/* Log tab */}
			{activeTab === 'log' && (
				<>
					{restCalls.length === 0 ? (
						<div className={styles.empty}>
							<NetworkIcon />
							<h3 className={styles.title}>No REST Calls</h3>
							<p className={styles.description}>
								REST API calls made by the bot will appear here.
							</p>
						</div>
					) : (
						<>
							{/* Header with filter */}
							<div className={styles.header}>
								<input
									type="text"
									className={styles.filterInput}
									placeholder="Filter by path or method..."
									value={filter}
									onChange={(e) => setFilter(e.target.value)}
								/>
								<button className={styles.clearButton} onClick={() => { setFilter(''); setSelectedId(null) }}>
									Clear
								</button>
							</div>

							{/* Split view: list and detail */}
							<div className={styles.splitView}>
								{/* Request list */}
								<div className={styles.listPane}>
									<div className={styles.requestList}>
										{filteredCalls.map((call) => (
											<div
												key={call.id}
												className={`${styles.logRow} ${selectedId === call.id ? styles.selected : ''}`}
												onClick={() => setSelectedId(call.id)}
											>
												<span className={`${styles.method} ${getMethodClass(call.data.method)}`}>
													{call.data.method}
												</span>
												<span className={styles.path} title={call.data.path}>
													{call.data.path}
												</span>
												<span className={`${styles.status} ${getStatusClass(call.data.statusCode)}`}>
													{call.data.statusCode}
												</span>
												<span className={styles.duration}>{formatDuration(call.data.duration)}</span>
											</div>
										))}
									</div>
								</div>

								{/* Detail pane */}
								{selectedCall && (
									<div className={styles.detailPane}>
										<div className={styles.detailHeader}>
											<span>Request Details</span>
											<button className={styles.closeDetail} onClick={() => setSelectedId(null)}>
												<CloseIcon />
											</button>
										</div>
										<div className={styles.detailContent}>
											{/* Meta info */}
											<div className={styles.detailMeta}>
												<div className={styles.metaItem}>
													<span className={styles.detailLabel}>Method</span>
													<span className={styles.detailValue}>{selectedCall.data.method}</span>
												</div>
												<div className={styles.metaItem}>
													<span className={styles.detailLabel}>Status</span>
													<span className={`${styles.detailValue} ${getStatusClass(selectedCall.data.statusCode)}`}>
														{selectedCall.data.statusCode}
													</span>
												</div>
												<div className={styles.metaItem}>
													<span className={styles.detailLabel}>Duration</span>
													<span className={styles.detailValue}>{formatDuration(selectedCall.data.duration)}</span>
												</div>
											</div>

											{/* Path */}
											<div className={styles.detailSection}>
												<div className={styles.detailLabel}>Path</div>
												<div className={styles.detailValue}>{selectedCall.data.path}</div>
											</div>

											{/* Endpoint (friendly name) */}
											{selectedCall.data.endpoint && (
												<div className={styles.detailSection}>
													<div className={styles.detailLabel}>Endpoint</div>
													<div className={styles.detailValue}>{selectedCall.data.endpoint}</div>
												</div>
											)}

											{/* Timestamp */}
											<div className={styles.detailSection}>
												<div className={styles.detailLabel}>Timestamp</div>
												<div className={styles.detailValue}>{formatTimestamp(selectedCall.data.timestamp)}</div>
											</div>

											{/* Error */}
											{selectedCall.data.error && (
												<div className={styles.detailSection}>
													<div className={styles.detailLabel}>Error</div>
													<div className={styles.detailValue} style={{ color: 'var(--red-light)' }}>
														{selectedCall.data.error}
													</div>
												</div>
											)}

											{/* Request Body */}
											{selectedCall.data.requestBody !== undefined && (
												<div className={styles.detailSection}>
													<div className={styles.detailLabel}>Request Body</div>
													<JsonViewer data={selectedCall.data.requestBody} collapsed={1} />
												</div>
											)}

											{/* Response Body */}
											{selectedCall.data.responseBody !== undefined && (
												<div className={styles.detailSection}>
													<div className={styles.detailLabel}>Response Body</div>
													<JsonViewer data={selectedCall.data.responseBody} collapsed={1} />
												</div>
											)}
										</div>
									</div>
								)}
							</div>
						</>
					)}
				</>
			)}
		</div>
	)
}

function NetworkIcon() {
	return (
		<svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor" opacity="0.3">
			<path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm7.5-6.923c-.67.204-1.335.82-1.887 1.855-.143.268-.276.56-.395.872.705.157 1.472.257 2.282.287V1.077zM4.249 3.539c.142-.384.304-.744.481-1.078a6.7 6.7 0 0 1 .597-.933A7.01 7.01 0 0 0 3.051 3.05c.362.184.763.349 1.198.49zM3.509 7.5c.036-1.07.188-2.087.436-3.008a9.124 9.124 0 0 1-1.565-.667A6.964 6.964 0 0 0 1.018 7.5h2.49zm1.4-2.741a12.344 12.344 0 0 0-.4 2.741H7.5V5.091c-.91-.03-1.783-.145-2.591-.332zM8.5 5.09V7.5h2.99a12.342 12.342 0 0 0-.399-2.741c-.808.187-1.681.301-2.591.332zM4.51 8.5c.035.987.176 1.914.399 2.741A13.612 13.612 0 0 1 7.5 10.91V8.5H4.51zm3.99 0v2.409c.91.03 1.783.145 2.591.332.223-.827.364-1.754.4-2.741H8.5zm-3.282 3.696c.12.312.252.604.395.872.552 1.035 1.218 1.65 1.887 1.855V11.91c-.81.03-1.577.13-2.282.287zm.11 2.276a6.696 6.696 0 0 1-.598-.933 8.853 8.853 0 0 1-.481-1.079 8.38 8.38 0 0 0-1.198.49 7.01 7.01 0 0 0 2.276 1.522zm-1.383-2.964A13.36 13.36 0 0 1 3.508 8.5h-2.49a6.963 6.963 0 0 0 1.362 3.675c.47-.258.995-.482 1.565-.667zm6.728 2.964a7.009 7.009 0 0 0 2.275-1.521 8.376 8.376 0 0 0-1.197-.49 8.853 8.853 0 0 1-.481 1.078 6.688 6.688 0 0 1-.597.933zM8.5 11.909v3.014c.67-.204 1.335-.82 1.887-1.855.143-.268.276-.56.395-.872A12.63 12.63 0 0 0 8.5 11.91zm3.555-.401c.57.185 1.095.409 1.565.667A6.963 6.963 0 0 0 14.982 8.5h-2.49a13.36 13.36 0 0 1-.437 3.008zM14.982 7.5a6.963 6.963 0 0 0-1.362-3.675c-.47.258-.995.482-1.565.667.248.92.4 1.938.437 3.008h2.49zM11.27 2.461c.177.334.339.694.482 1.078a8.368 8.368 0 0 0 1.196-.49 7.01 7.01 0 0 0-2.275-1.52c.218.283.418.597.597.932zm-.488 1.343a7.765 7.765 0 0 0-.395-.872C9.835 1.897 9.17 1.282 8.5 1.077V4.09c.81-.03 1.577-.13 2.282-.287z" />
		</svg>
	)
}

function SendIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.314.037a.5.5 0 0 1 .54.11ZM6.636 10.07l2.761 4.338L14.13 2.576 6.636 10.07Zm6.787-8.201L1.591 6.602l4.339 2.76 7.494-7.493Z" />
		</svg>
	)
}

function ListIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path fillRule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z" />
		</svg>
	)
}

function SpinnerIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className={styles.spinner}>
			<path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z" />
			<path fillRule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z" />
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
