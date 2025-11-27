import { RoadmapProvider } from './base.js'
import type {
	ColumnConfig,
	CreateCardInput,
	CreateCardResult,
	DateRangeFilter,
	ProviderConfig,
	ProviderInfo,
	RoadmapCard,
	RoadmapColumn,
	UpdateCardInput,
	UpdateCardResult
} from '../types.js'
import { roadmapLogger } from '../core/logger.js'

const DEFAULT_JQL = '(issuetype = Epic AND (labels NOT IN ("Private") OR labels IS EMPTY)) OR labels IN ("Public")'
const DEFAULT_MAX_RESULTS = 100

/**
 * Configuration shape for the {@link JiraProvider}.
 *
 * @remarks
 * Values can be provided directly on the config object, through the `options` bag, or via
 * environment variables. Explicit config values take precedence, followed by option values, with
 * environment variables acting as the final fallback. Missing required credentials will be surfaced
 * during {@link JiraProvider.validateConfig}.
 */
export interface JiraProviderConfig extends ProviderConfig {
	/**
	 * Fully qualified Jira Cloud base URL, e.g., `https://example.atlassian.net`.
	 */
	readonly url?: string
	/**
	 * Atlassian account email used for API authentication.
	 */
	readonly email?: string
	/**
	 * Jira API token associated with the Atlassian account.
	 */
	readonly apiToken?: string
	/**
	 * Optional JQL query to scope the issues returned by the provider.
	 */
	readonly jql?: string
	/**
	 * Maximum number of issues to fetch per page when paging Jira search results.
	 */
	readonly maxResults?: number
	/**
	 * Jira project key for creating issues (e.g., 'PROJ').
	 */
	readonly projectKey?: string
	/**
	 * Default issue type name for created issues (e.g., 'Epic', 'Task').
	 * Defaults to 'Task' if not specified.
	 */
	readonly defaultIssueType?: string
	/**
	 * Provider options bag allowing runtime overrides via plugin configuration.
	 */
	readonly options: ProviderConfig['options'] & {
		readonly url?: string
		readonly email?: string
		readonly apiToken?: string
		readonly jql?: string
		readonly maxResults?: number
		readonly projectKey?: string
		readonly defaultIssueType?: string
		/**
		 * Custom column definitions and status-to-column mappings.
		 *
		 * If provided, replaces the default three-column structure (Backlog, In Progress, Done).
		 * Supports many-to-one mappings (multiple statuses to one column) and null mappings
		 * (status tracked but not synced to forum).
		 */
		readonly columnConfig?: ColumnConfig
	}
}

interface ResolvedJiraConfig {
	readonly url: string
	readonly email: string
	readonly apiToken: string
	readonly jql: string
	readonly maxResults: number
	readonly projectKey: string
	readonly defaultIssueType: string
}

interface JiraSearchResponse {
	readonly issues: readonly JiraIssue[]
	readonly isLast: boolean
	readonly nextPageToken?: string
}

interface JiraIssue {
	readonly id: string
	readonly key: string
	readonly self: string
	readonly fields: JiraFields
}

interface JiraFields {
	readonly summary?: string
	readonly description?: unknown
	readonly labels?: readonly string[]
	readonly status?: JiraStatus
	readonly assignee?: JiraUser | null
	readonly updated?: string
}

interface JiraStatus {
	readonly name?: string
	readonly statusCategory?: {
		readonly name?: string
	} | null
}

interface JiraUser {
	readonly accountId?: string
	readonly displayName?: string
	readonly avatarUrls?: {
		readonly [size: string]: string | undefined
	}
}

/**
 * Atlassian Document Format (ADF) node types.
 * @see https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/
 */
type AdfTextNode = {
	readonly type: 'text'
	readonly text: string
}

type AdfHardBreakNode = {
	readonly type: 'hardBreak' | 'lineBreak'
}

type AdfParagraphNode = {
	readonly type: 'paragraph'
	readonly content?: readonly AdfNode[]
}

type AdfHeadingNode = {
	readonly type: 'heading'
	readonly content?: readonly AdfNode[]
}

type AdfListNode = {
	readonly type: 'bulletList' | 'orderedList'
	readonly content?: readonly AdfNode[]
}

type AdfListItemNode = {
	readonly type: 'listItem'
	readonly content?: readonly AdfNode[]
}

type AdfCodeBlockNode = {
	readonly type: 'codeBlock'
	readonly content?: readonly AdfNode[]
}

type AdfDocNode = {
	readonly type: 'doc'
	readonly content?: readonly AdfNode[]
}

type AdfUnknownNode = {
	readonly type?: string
	readonly content?: readonly AdfNode[]
	readonly [key: string]: unknown
}

type AdfNode =
	| AdfTextNode
	| AdfHardBreakNode
	| AdfParagraphNode
	| AdfHeadingNode
	| AdfListNode
	| AdfListItemNode
	| AdfCodeBlockNode
	| AdfDocNode
	| AdfUnknownNode

/**
 * Jira provider that connects to Jira Cloud instances via REST API v3.
 *
 * Authenticates using email and API token, executes JQL queries to fetch issues,
 * and maps them to roadmap cards.
 *
 * @example
 * ```ts
 * const provider = new JiraProvider({
 *   type: 'jira',
 *   options: {
 *     url: process.env.JIRA_URL,
 *     email: process.env.JIRA_EMAIL,
 *     apiToken: process.env.JIRA_API_TOKEN,
 *   },
 * });
 * ```
 */
export class JiraProvider extends RoadmapProvider<JiraProviderConfig> {
	private resolvedConfig: ResolvedJiraConfig & { columnConfig?: ColumnConfig } = this.resolveConfig()
	private issueTypesCache: { types: readonly string[]; timestamp: number } | null = null
	private labelsCache: { labels: readonly string[]; timestamp: number } | null = null
	private dateRangeCache: Map<string, { cards: readonly RoadmapCard[]; timestamp: number }> = new Map()

	public constructor(config: JiraProviderConfig) {
		super(config)
		this.resolvedConfig = this.resolveConfig()
	}

	/**
	 * Returns the configured status-to-column mapping, if any.
	 *
	 * @returns Status mapping record or undefined if using defaults.
	 */
	public override getStatusMapping(): Record<string, string | null> | undefined {
		return this.resolvedConfig.columnConfig?.statusMapping
	}

	/**
	 * Validates the resolved Jira configuration, emitting structured log output for any failures.
	 *
	 * @param config - Optional override used mainly for testing.
	 * @returns `true` when the configuration satisfies the minimum requirements.
	 */
	public override validateConfig(config: JiraProviderConfig = this.config): boolean {
		const resolved = this.resolveConfig(config)
		let isValid = true

		if (!resolved.url) {
			roadmapLogger.error('JIRA_URL is not configured.')
			isValid = false
		} else if (!this.isValidUrl(resolved.url)) {
			roadmapLogger.error(`JIRA_URL must be a valid URL. Received: ${resolved.url}`)
			isValid = false
		}

		if (!resolved.email) {
			roadmapLogger.error('JIRA_EMAIL is not configured.')
			isValid = false
		} else if (!resolved.email.includes('@')) {
			roadmapLogger.error(`JIRA_EMAIL must be a valid email address. Received: ${resolved.email}`)
			isValid = false
		}

		if (!resolved.apiToken) {
			roadmapLogger.error('JIRA_API_TOKEN is not configured.')
			isValid = false
		}

		if (!resolved.projectKey || !resolved.projectKey.trim()) {
			roadmapLogger.error('JIRA_PROJECT_KEY is not configured. This is required for creating cards.')
			isValid = false
		}

		if (resolved.defaultIssueType && resolved.defaultIssueType.trim()) {
			const knownTypes = ['Epic', 'Story', 'Task', 'Bug', 'Subtask']
			if (!knownTypes.includes(resolved.defaultIssueType)) {
				roadmapLogger.warn(
					`JIRA_DEFAULT_ISSUE_TYPE "${resolved.defaultIssueType}" is not a standard Jira issue type. Known types: ${knownTypes.join(', ')}`
				)
			}
		}

		return isValid
	}

	/**
	 * Initializes the provider and verifies Jira connectivity.
	 *
	 * @throws Error if configuration is invalid or authentication fails.
	 */
	public override async init(): Promise<void> {
		this.resolvedConfig = this.resolveConfig()

		if (!this.validateConfig()) {
			throw new Error('Jira provider configuration is invalid. Check logs for details.')
		}

		const { url, email } = this.resolvedConfig
		roadmapLogger.debug(`Initializing Jira provider for ${url}`)

		try {
			const response = await fetch(`${url}/rest/api/3/myself`, {
				method: 'GET',
				headers: this.buildAuthHeaders()
			})

			if (!response.ok) {
				if (response.status === 401) {
					throw new Error('Authentication with Jira failed. Verify email and API token.')
				}

				const message = await this.safeReadError(response)
				throw new Error(`Failed to initialize Jira provider (status ${response.status}): ${message}`)
			}

			roadmapLogger.debug(`Authenticated with Jira as ${email}`)
		} catch (error) {
			roadmapLogger.error(`Unable to initialize Jira provider: ${(error as Error).message}`)
			throw error
		}
	}

	/**
	 * Fetches all Jira issues matching the configured JQL query.
	 *
	 * @returns Array of roadmap cards mapped from Jira issues.
	 * @throws Error if authentication fails or query is invalid.
	 */
	public override async fetchCards(): Promise<readonly RoadmapCard[]> {
		const { url, maxResults } = this.resolvedConfig
		const searchEndpoint = `${url}/rest/api/3/search/jql`

		let nextPageToken: string | undefined = undefined
		let pageNumber = 0
		let finalPageReached = false
		const cards: RoadmapCard[] = []

		roadmapLogger.debug(`Fetching Jira issues using JQL: ${this.resolvedConfig.jql}`)

		do {
			// Build request payload with JQL and pagination
			const payload: Record<string, unknown> = {
				jql: this.resolvedConfig.jql,
				maxResults,
				fields: ['summary', 'description', 'labels', 'status', 'assignee', 'updated']
			}

			// Add pagination token if present
			if (typeof nextPageToken === 'string') {
				payload.nextPageToken = nextPageToken
			}

			let response: Response

			try {
				response = await fetch(searchEndpoint, {
					method: 'POST',
					headers: {
						...this.buildAuthHeaders(),
						'Content-Type': 'application/json',
						Accept: 'application/json'
					},
					body: JSON.stringify(payload)
				})
			} catch (error) {
				const message = (error as Error).message
				roadmapLogger.error(`Network error while querying Jira: ${message}`)
				throw new Error(`Unable to reach Jira. Confirm network connectivity. Reason: ${message}`)
			}

			if (!response.ok) {
				const errorMessage = await this.safeReadError(response)

				if (response.status === 401) {
					throw new Error('Jira authentication failed during issue retrieval.')
				}

				if (response.status === 400) {
					throw new Error(`Jira rejected the JQL query: ${errorMessage}`)
				}

				throw new Error(`Unexpected Jira API response (status ${response.status}): ${errorMessage}`)
			}

			const data = (await response.json()) as JiraSearchResponse

			if (!Array.isArray(data.issues)) {
				throw new Error('Malformed Jira response: missing issues array.')
			}

			pageNumber += 1

			// Map each issue to RoadmapCard, skip failures
			for (const issue of data.issues) {
				try {
					cards.push(this.mapIssueToCard(issue))
				} catch (error) {
					roadmapLogger.warn(`Failed to map Jira issue ${issue?.key ?? issue?.id}: ${(error as Error).message}`)
				}
			}

			// Extract pagination info
			nextPageToken = data.nextPageToken
			finalPageReached = data.isLast || typeof nextPageToken !== 'string'

			roadmapLogger.debug(
				`Fetched ${data.issues.length} issues on page ${pageNumber} (isLast=${data.isLast}, nextPageToken=${typeof nextPageToken === 'string' ? nextPageToken : 'none'})`
			)
		} while (!finalPageReached)

		roadmapLogger.info(
			`Fetched ${cards.length} Jira issues across ${pageNumber} page(s); final page reached: ${finalPageReached}`
		)

		return cards
	}

	/**
	 * Returns standard Jira workflow columns (Backlog, In Progress, Done).
	 *
	 * @returns Array of column definitions.
	 */
	public override async getColumns(): Promise<readonly RoadmapColumn[]> {
		// Check for custom column configuration
		const columnConfig = this.resolvedConfig.columnConfig
		if (columnConfig?.columns && columnConfig.columns.length > 0) {
			return columnConfig.columns.map((col) => ({
				id: col.id,
				name: col.name,
				order: col.order,
				archived: col.archived ?? false,
				createForum: col.createForum ?? (col.archived ? false : true)
			}))
		}

		// Default columns
		return [
			{ id: 'backlog', name: 'Backlog', order: 0, archived: false, createForum: true },
			{ id: 'in-progress', name: 'In Progress', order: 1, archived: false, createForum: true },
			{ id: 'done', name: 'Done', order: 2, archived: true, createForum: true }
		]
	}

	/**
	 * Retrieves available issue types from Jira (excludes subtasks).
	 *
	 * Results are cached for 5 minutes. Returns standard types on failure.
	 *
	 * @returns Array of issue type names (e.g., ['Task', 'Story', 'Bug', 'Epic']).
	 */
	public override async getIssueTypes(): Promise<readonly string[]> {
		const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
		const FALLBACK_TYPES = ['Task', 'Story', 'Bug', 'Epic'] as const

		// Check cache
		if (this.issueTypesCache && Date.now() - this.issueTypesCache.timestamp < CACHE_TTL) {
			roadmapLogger.debug(`Returning cached issue types (${this.issueTypesCache.types.length} types)`)
			return this.issueTypesCache.types
		}

		try {
			const { url } = this.resolvedConfig
			roadmapLogger.debug('Fetching issue types from Jira API')

			const response = await fetch(`${url}/rest/api/3/issuetype`, {
				method: 'GET',
				headers: {
					...this.buildAuthHeaders(),
					Accept: 'application/json'
				}
			})

			if (!response.ok) {
				if (response.status === 401) {
					roadmapLogger.error('Authentication failed while fetching issue types')
					throw new Error('Jira authentication failed during issue type retrieval.')
				}

				const errorMessage = await this.safeReadError(response)
				throw new Error(`Failed to fetch issue types (status ${response.status}): ${errorMessage}`)
			}

			const issueTypes = (await response.json()) as Array<{
				id: string
				name: string
				description?: string
				subtask: boolean
			}>

			if (!Array.isArray(issueTypes)) {
				throw new Error('Malformed Jira response: expected array of issue types')
			}

			// Filter out subtasks and extract names
			const typeNames = issueTypes.filter((type) => !type.subtask).map((type) => type.name)

			// Cache results
			this.issueTypesCache = {
				types: typeNames,
				timestamp: Date.now()
			}

			roadmapLogger.debug(`Fetched and cached ${typeNames.length} issue types from Jira`)

			return typeNames
		} catch (error) {
			roadmapLogger.error(`Failed to fetch issue types from Jira: ${(error as Error).message}`)
			roadmapLogger.warn(`Returning fallback issue types: ${FALLBACK_TYPES.join(', ')}`)

			return [...FALLBACK_TYPES]
		}
	}

	/**
	 * Retrieves available labels from Jira.
	 *
	 * Results are cached for 5 minutes. Returns empty array on failure.
	 *
	 * @returns Array of label names.
	 */
	public override async getLabels(): Promise<readonly string[]> {
		const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

		// Check cache
		if (this.labelsCache && Date.now() - this.labelsCache.timestamp < CACHE_TTL) {
			roadmapLogger.debug(`Returning cached labels (${this.labelsCache.labels.length} labels)`)
			return this.labelsCache.labels
		}

		try {
			const { url } = this.resolvedConfig
			roadmapLogger.debug('Fetching labels from Jira API')

			// Fetch labels with pagination
			let allLabels: string[] = []
			let startAt = 0
			let isLast = false
			let pageCount = 0

			while (!isLast) {
				pageCount++
				const response = await fetch(`${url}/rest/api/3/label?startAt=${startAt}&maxResults=100`, {
					method: 'GET',
					headers: {
						...this.buildAuthHeaders(),
						Accept: 'application/json'
					}
				})

				if (!response.ok) {
					if (response.status === 401) {
						roadmapLogger.error('Authentication failed while fetching labels')
						throw new Error('Jira authentication failed during label retrieval.')
					}

					const errorMessage = await this.safeReadError(response)
					throw new Error(`Failed to fetch labels (status ${response.status}): ${errorMessage}`)
				}

				const data = (await response.json()) as {
					values: string[]
					isLast: boolean
					startAt: number
					maxResults: number
					total: number
				}

				if (!Array.isArray(data.values)) {
					throw new Error('Malformed Jira response: expected values array')
				}

				// Guard against infinite loop from malformed responses
				if (data.maxResults <= 0) {
					roadmapLogger.warn('Malformed Jira response: maxResults <= 0. Stopping pagination.')
					isLast = true
				}

				// Concatenate labels from this page
				allLabels = allLabels.concat(data.values)

				// Update pagination state
				if (!isLast && data.maxResults > 0) {
					isLast = data.isLast
					startAt += data.maxResults
				} else {
					isLast = true
				}
			}

			// Deduplicate labels (case-insensitive) and sort
			const labelMap = new Map<string, string>()
			for (const label of allLabels) {
				const lowerLabel = label.toLowerCase()
				if (!labelMap.has(lowerLabel)) {
					labelMap.set(lowerLabel, label)
				}
			}
			const processedLabels = Array.from(labelMap.values()).sort((a, b) =>
				a.localeCompare(b, undefined, { sensitivity: 'base' })
			)

			// Cache results
			this.labelsCache = {
				labels: processedLabels,
				timestamp: Date.now()
			}

			roadmapLogger.debug(`Fetched and cached ${processedLabels.length} labels from Jira across ${pageCount} page(s)`)

			return processedLabels
		} catch (error) {
			roadmapLogger.error(`Failed to fetch labels from Jira: ${(error as Error).message}`)

			return []
		}
	}

	/**
	 * Fetches Jira issues filtered by date range.
	 *
	 * Supports filtering by 'created' or 'updated' fields (defaults to 'updated').
	 * Accepts Date objects or ISO 8601 strings. Results are cached for 5 minutes.
	 *
	 * @param filter - Date range criteria (startDate, endDate, dateField).
	 * @returns Array of matching cards, or empty array on error.
	 *
	 * @example
	 * ```ts
	 * const cards = await provider.fetchCardsByDateRange({
	 *   startDate: '2025-01-01',
	 *   endDate: '2025-01-31',
	 *   dateField: 'updated'
	 * });
	 * ```
	 */
	public override async fetchCardsByDateRange(filter: DateRangeFilter): Promise<readonly RoadmapCard[]> {
		const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

		try {
			// If no date filters are provided, delegate to fetchCards()
			if (!filter.startDate && !filter.endDate) {
				roadmapLogger.debug('No date filters provided, delegating to fetchCards()')
				return await this.fetchCards()
			}

			// Helper to format dates as YYYY-MM-DD for JQL
			const formatDateForJql = (date: Date | string): string => {
				if (date instanceof Date) {
					// Extract YYYY-MM-DD from ISO string
					return date.toISOString().split('T')[0]
				}

				// Handle ISO string input
				if (typeof date === 'string') {
					// If already in YYYY-MM-DD format, return as-is
					if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
						return date
					}

					// Extract date portion from ISO 8601 timestamp
					const match = date.match(/^(\d{4}-\d{2}-\d{2})/)
					if (match) {
						return match[1]
					}

					// Fallback: try to parse and format
					const parsed = new Date(date)
					if (!isNaN(parsed.getTime())) {
						return parsed.toISOString().split('T')[0]
					}
				}

				throw new Error(`Invalid date format: ${date}`)
			}

			// Determine date field (default to 'updated')
			const dateField = filter.dateField ?? 'updated'
			// Normalize dates for cache key
			const normalizedStart = filter.startDate ? formatDateForJql(filter.startDate) : undefined
			const normalizedEnd = filter.endDate ? formatDateForJql(filter.endDate) : undefined
			const cacheKey = `${dateField}:${normalizedStart ?? 'none'}:${normalizedEnd ?? 'none'}`

			// Check cache
			const cached = this.dateRangeCache.get(cacheKey)
			if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
				roadmapLogger.debug(
					`Returning cached date range query results (${cached.cards.length} cards, key=${cacheKey})`
				)

				return cached.cards
			}

			// Validate date range if both dates provided
			if (filter.startDate && filter.endDate) {
				const start = filter.startDate instanceof Date ? filter.startDate : new Date(filter.startDate)
				const end = filter.endDate instanceof Date ? filter.endDate : new Date(filter.endDate)

				if (start > end) {
					roadmapLogger.warn(
						'Invalid date range: startDate (%s) is after endDate (%s). Returning empty array.',
						filter.startDate,
						filter.endDate
					)

					return []
				}
			}

			// Build JQL query with date filters
			const baseJql = this.resolvedConfig.jql
			const jqlConditions: string[] = [baseJql]

			// Add start date condition
			if (filter.startDate) {
				const formattedStart = formatDateForJql(filter.startDate)
				jqlConditions.push(`${dateField} >= '${formattedStart}'`)
			}

			// Add end date condition
			if (filter.endDate) {
				const formattedEnd = formatDateForJql(filter.endDate)
				jqlConditions.push(`${dateField} <= '${formattedEnd}'`)
			}

			// Add ORDER BY clause
			const jql = jqlConditions.join(' AND ') + ` ORDER BY ${dateField} DESC`

			roadmapLogger.debug(`Fetching Jira issues with date range filter. JQL: ${jql}`)

			// Fetch issues with pagination (same pattern as fetchCards)
			const { url, maxResults } = this.resolvedConfig
			const searchEndpoint = `${url}/rest/api/3/search/jql`

			let nextPageToken: string | undefined = undefined
			let pageNumber = 0
			let finalPageReached = false
			const cards: RoadmapCard[] = []

			do {
				const payload: Record<string, unknown> = {
					jql,
					maxResults,
					fields: ['summary', 'description', 'labels', 'status', 'assignee', 'updated']
				}

				if (typeof nextPageToken === 'string') {
					payload.nextPageToken = nextPageToken
				}

				let response: Response

				try {
					response = await fetch(searchEndpoint, {
						method: 'POST',
						headers: {
							...this.buildAuthHeaders(),
							'Content-Type': 'application/json',
							Accept: 'application/json'
						},
						body: JSON.stringify(payload)
					})
				} catch (error) {
					const message = (error as Error).message
					roadmapLogger.error(`Network error while querying Jira with date range filter: ${message}`)
					throw new Error(`Unable to reach Jira. Confirm network connectivity. Reason: ${message}`)
				}

				if (!response.ok) {
					const errorMessage = await this.safeReadError(response)

					if (response.status === 401) {
						throw new Error('Jira authentication failed during date range query.')
					}

					if (response.status === 400) {
						throw new Error(`Jira rejected the JQL query with date filters: ${errorMessage}`)
					}

					throw new Error(`Unexpected Jira API response (status ${response.status}): ${errorMessage}`)
				}

				const data = (await response.json()) as JiraSearchResponse

				if (!Array.isArray(data.issues)) {
					throw new Error('Malformed Jira response: missing issues array.')
				}

				pageNumber += 1

				for (const issue of data.issues) {
					try {
						cards.push(this.mapIssueToCard(issue))
					} catch (error) {
						roadmapLogger.warn(`Failed to map Jira issue ${issue?.key ?? issue?.id}: ${(error as Error).message}`)
					}
				}

				nextPageToken = data.nextPageToken
				finalPageReached = data.isLast || typeof nextPageToken !== 'string'

				roadmapLogger.debug(
					`Fetched ${data.issues.length} issues on page ${pageNumber} (isLast=${data.isLast}, nextPageToken=${typeof nextPageToken === 'string' ? nextPageToken : 'none'})`
				)
			} while (!finalPageReached)

			// Cache results
			this.dateRangeCache.set(cacheKey, {
				cards,
				timestamp: Date.now()
			})

			roadmapLogger.info(
				`Fetched ${cards.length} Jira issues with date range filter across ${pageNumber} page(s). Filter: startDate=${filter.startDate ?? 'none'}, endDate=${filter.endDate ?? 'none'}, dateField=${dateField}`
			)

			return cards
		} catch (error) {
			roadmapLogger.error(
				`Failed to fetch cards by date range (startDate=${filter.startDate ?? 'none'}, endDate=${filter.endDate ?? 'none'}, dateField=${filter.dateField ?? 'updated'}): ${(error as Error).message}`
			)

			return []
		}
	}

	/**
	 * Returns provider metadata and capabilities.
	 *
	 * @returns Provider information including name, version, and capabilities.
	 *
	 * @example
	 * ```ts
	 * const info = await provider.getProviderInfo();
	 * console.log(info.name); // 'Jira'
	 * ```
	 */
	public override async getProviderInfo(): Promise<ProviderInfo> {
		const { url, jql } = this.resolvedConfig

		return {
			name: 'Jira',
			version: '1.0.0',
			capabilities: ['cards', 'columns', 'labels', 'assignees', 'create', 'get', 'update'],
			metadata: {
				jiraUrl: url,
				jqlQuery: jql
			}
		}
	}

	/**
	 * Retrieves a single Jira issue by its key.
	 *
	 * @param cardId - Jira issue key (e.g., 'PROJ-123').
	 * @returns RoadmapCard if found, null if not found.
	 * @throws Error if authentication fails or network errors occur.
	 *
	 * @example
	 * ```ts
	 * const card = await provider.getCard('PROJ-123');
	 * if (card) console.log(card.title);
	 * ```
	 */
	public override async getCard(cardId: string): Promise<RoadmapCard | null> {
		try {
			// Validate input
			if (!cardId || !cardId.trim()) {
				throw new Error('Card ID (Jira issue key) is required')
			}

			const { url } = this.resolvedConfig
			roadmapLogger.debug('Fetching Jira issue: %s', cardId)

			const response = await fetch(
				`${url}/rest/api/3/issue/${cardId}?fields=summary,description,labels,status,assignee,updated`,
				{
					method: 'GET',
					headers: {
						...this.buildAuthHeaders(),
						Accept: 'application/json'
					}
				}
			)

			if (response.status === 404) {
				roadmapLogger.warn('Jira issue not found: %s', cardId)

				return null
			}

			if (!response.ok) {
				const errorMessage = await this.safeReadError(response)

				if (response.status === 401) {
					throw new Error('Jira authentication failed during issue retrieval.')
				}

				throw new Error(`Failed to fetch Jira issue (status ${response.status}): ${errorMessage}`)
			}

			const issue = (await response.json()) as JiraIssue
			const card = this.mapIssueToCard(issue)

			roadmapLogger.info('Fetched Jira issue: %s', cardId)

			return card
		} catch (error) {
			// Re-throw auth and network errors, but return null for not found
			if ((error as Error).message.includes('not found')) {
				return null
			}

			throw error
		}
	}

	/**
	 * Creates a new Jira issue.
	 *
	 * Converts plain text description to ADF. If column is not 'Backlog', transitions the issue
	 * to the appropriate status. Only the first assignee is used (Jira limitation).
	 *
	 * @param input - Card data (title, description, column, labels, assignees, issueType).
	 * @returns CreateCardResult with success status and created card.
	 *
	 * @example
	 * ```ts
	 * const result = await provider.createCard({
	 *   title: 'New Feature',
	 *   description: 'Add user authentication',
	 *   column: 'In Progress',
	 *   labels: ['feature']
	 * });
	 * ```
	 */
	public override async createCard(input: CreateCardInput): Promise<CreateCardResult> {
		try {
			// Validate input
			if (!input.title || !input.title.trim()) {
				throw new Error('Title is required')
			}

			const { projectKey, defaultIssueType } = this.resolvedConfig

			// Determine issue type: prioritize input.issueType over defaultIssueType
			const issueTypeToUse = input.issueType && input.issueType.trim() ? input.issueType.trim() : defaultIssueType
			roadmapLogger.debug(
				'Using issue type "%s" (source: %s)',
				issueTypeToUse,
				input.issueType && input.issueType.trim() ? 'input' : 'config'
			)

			// Validate issue type if provided by user
			if (input.issueType && input.issueType.trim()) {
				const availableTypes = await this.getIssueTypes()
				if (!availableTypes.includes(issueTypeToUse)) {
					throw new Error(`Invalid issue type "${issueTypeToUse}". Valid types: ${availableTypes.join(', ')}`)
				}
			}

			if (!projectKey) {
				throw new Error('JIRA_PROJECT_KEY is not configured. Set it in environment variables or plugin options.')
			}

			// Validate column
			const columns = await this.getColumns()
			const validColumn = columns.find((col) => col.name === input.column)
			if (!validColumn) {
				const columnNames = columns.map((col) => col.name).join(', ')
				throw new Error(`Invalid column "${input.column}". Valid columns: ${columnNames}`)
			}

			roadmapLogger.debug(
				'Creating Jira issue: %s (column: %s, issueType: %s)',
				input.title,
				input.column,
				issueTypeToUse
			)

			// Build Jira issue payload
			const fields: Record<string, unknown> = {
				project: { key: projectKey },
				issuetype: { name: issueTypeToUse },
				summary: input.title,
				description: this.convertPlainTextToAdf(input.description),
				labels: input.labels || []
			}

			// Map assignees if provided
			if (input.assignees && input.assignees.length > 0) {
				const firstAssignee = input.assignees[0]
				if (firstAssignee.id) {
					fields.assignee = { accountId: firstAssignee.id }
					roadmapLogger.debug('Assigning issue to accountId: %s', firstAssignee.id)
				}

				// Warn if multiple assignees provided
				if (input.assignees.length > 1) {
					roadmapLogger.warn(
						'Multiple assignees provided (%d), but Jira only supports one assignee. Using first assignee: %s',
						input.assignees.length,
						firstAssignee.name
					)
				}
			}

			const payload: Record<string, unknown> = {
				fields
			}

			// Create the issue
			const { url } = this.resolvedConfig
			const createResponse = await fetch(`${url}/rest/api/3/issue`, {
				method: 'POST',
				headers: {
					...this.buildAuthHeaders(),
					'Content-Type': 'application/json',
					Accept: 'application/json'
				},
				body: JSON.stringify(payload)
			})

			if (!createResponse.ok) {
				const errorMessage = await this.safeReadError(createResponse)

				if (createResponse.status === 401) {
					throw new Error('Jira authentication failed during issue creation.')
				}

				if (createResponse.status === 400) {
					throw new Error(`Jira rejected the issue data: ${errorMessage}`)
				}

				throw new Error(`Failed to create Jira issue (status ${createResponse.status}): ${errorMessage}`)
			}

			const createData = (await createResponse.json()) as { id: string; key: string; self: string }
			const issueKey = createData.key

			roadmapLogger.debug('Created Jira issue: %s', issueKey)

			// Transition issue to target status if not Backlog
			if (input.column !== 'Backlog') {
				await this.transitionIssueToColumn(issueKey, input.column)
			}

			// Fetch the created issue with full details
			const issueResponse = await fetch(
				`${url}/rest/api/3/issue/${issueKey}?fields=summary,description,labels,status,assignee,updated,issuetype`,
				{
					method: 'GET',
					headers: {
						...this.buildAuthHeaders(),
						Accept: 'application/json'
					}
				}
			)

			if (!issueResponse.ok) {
				throw new Error(`Failed to fetch created issue: ${await this.safeReadError(issueResponse)}`)
			}

			const issue = (await issueResponse.json()) as JiraIssue
			const card = this.mapIssueToCard(issue)

			roadmapLogger.info('Successfully created Jira issue: %s (%s)', issueKey, input.title)

			return {
				card,
				success: true,
				message: `Issue ${issueKey} created successfully`
			}
		} catch (error) {
			const errorMessage = (error as Error).message
			roadmapLogger.error('Failed to create Jira issue: %s', errorMessage)

			// Build partial card for debugging
			const partialCard: RoadmapCard = {
				id: 'unknown',
				title: input.title,
				description: input.description,
				labels: input.labels || [],
				column: input.column,
				assignees: [],
				url: this.resolvedConfig.url,
				updatedAt: new Date()
			}

			return {
				card: partialCard,
				success: false,
				message: errorMessage
			}
		}
	}

	/**
	 * Updates an existing Jira issue (partial update).
	 *
	 * Only provided fields are updated. If column changes, transitions the issue to the new status.
	 * Only the first assignee is used (Jira limitation).
	 *
	 * @param cardId - Jira issue key (e.g., 'PROJ-123').
	 * @param input - Partial card data to update.
	 * @returns UpdateCardResult with success status and updated card.
	 *
	 * @example
	 * ```ts
	 * const result = await provider.updateCard('PROJ-123', { column: 'Done' });
	 * console.log(result.success);
	 * ```
	 */
	public override async updateCard(cardId: string, input: UpdateCardInput): Promise<UpdateCardResult> {
		try {
			// Validate input
			if (!cardId || !cardId.trim()) {
				throw new Error('Card ID (Jira issue key) is required')
			}

			// Check at least one field is provided
			if (!input.title && !input.description && !input.column && !input.labels && !input.assignees) {
				throw new Error('At least one field must be provided for update')
			}

			// Validate column if provided
			if (input.column) {
				const columns = await this.getColumns()
				const validColumn = columns.find((col) => col.name === input.column)
				if (!validColumn) {
					const columnNames = columns.map((col) => col.name).join(', ')
					throw new Error(`Invalid column "${input.column}". Valid columns: ${columnNames}`)
				}
			}

			const { url } = this.resolvedConfig
			roadmapLogger.debug('Updating Jira issue: %s', cardId)

			// Build update payload with only provided fields
			const fields: Record<string, unknown> = {}

			if (input.title) {
				fields.summary = input.title
			}

			if (input.description !== undefined) {
				fields.description = this.convertPlainTextToAdf(input.description)
			}

			if (input.labels) {
				fields.labels = input.labels
			}

			if (input.assignees && input.assignees.length > 0) {
				const firstAssignee = input.assignees[0]
				if (firstAssignee.id) {
					fields.assignee = { accountId: firstAssignee.id }
					roadmapLogger.debug('Assigning issue to accountId: %s', firstAssignee.id)
				}

				// Warn if multiple assignees provided
				if (input.assignees.length > 1) {
					roadmapLogger.warn(
						'Multiple assignees provided (%d), but Jira only supports one assignee. Using first assignee: %s',
						input.assignees.length,
						firstAssignee.name
					)
				}
			}

			// Update the issue
			const updatePayload: Record<string, unknown> = {
				fields
			}

			const updateResponse = await fetch(`${url}/rest/api/3/issue/${cardId}`, {
				method: 'PUT',
				headers: {
					...this.buildAuthHeaders(),
					'Content-Type': 'application/json',
					Accept: 'application/json'
				},
				body: JSON.stringify(updatePayload)
			})

			if (updateResponse.status === 404) {
				throw new Error(`Jira issue not found: ${cardId}`)
			}

			if (!updateResponse.ok) {
				const errorMessage = await this.safeReadError(updateResponse)

				if (updateResponse.status === 401) {
					throw new Error('Jira authentication failed during issue update.')
				}

				if (updateResponse.status === 400) {
					throw new Error(`Jira rejected the issue data: ${errorMessage}`)
				}

				throw new Error(`Failed to update Jira issue (status ${updateResponse.status}): ${errorMessage}`)
			}

			roadmapLogger.debug('Updated Jira issue: %s', cardId)

			// Handle column/status change if provided
			if (input.column) {
				await this.transitionIssueToColumn(cardId, input.column)
			}

			// Fetch the updated issue with full details
			const issueResponse = await fetch(
				`${url}/rest/api/3/issue/${cardId}?fields=summary,description,labels,status,assignee,updated`,
				{
					method: 'GET',
					headers: {
						...this.buildAuthHeaders(),
						Accept: 'application/json'
					}
				}
			)

			if (!issueResponse.ok) {
				throw new Error(`Failed to fetch updated issue: ${await this.safeReadError(issueResponse)}`)
			}

			const issue = (await issueResponse.json()) as JiraIssue
			const card = this.mapIssueToCard(issue)

			roadmapLogger.info('Successfully updated Jira issue: %s', cardId)

			return {
				card,
				success: true,
				message: `Issue ${cardId} updated successfully`
			}
		} catch (error) {
			const errorMessage = (error as Error).message
			roadmapLogger.error('Failed to update Jira issue: %s', errorMessage)

			// Try to get current card for debugging
			let card: RoadmapCard | null = null
			try {
				card = await this.getCard(cardId)
			} catch {
				// Ignore errors getting the card
			}

			// Build partial card with input data for debugging
			const partialCard: RoadmapCard = card ?? {
				id: cardId,
				title: input.title ?? 'Unknown',
				description: input.description ?? '',
				labels: input.labels ?? [],
				column: input.column ?? 'Unknown',
				assignees: input.assignees ?? [],
				url: `${this.resolvedConfig.url}/browse/${cardId}`,
				updatedAt: new Date()
			}

			return {
				card: partialCard,
				success: false,
				message: errorMessage
			}
		}
	}

	/**
	 * Resolves configuration from explicit values, plugin options, and environment variables (in that order).
	 */
	private resolveConfig(config: JiraProviderConfig = this.config): ResolvedJiraConfig & { columnConfig?: ColumnConfig } {
		// Read values from environment variables
		const envUrl = process.env.JIRA_URL
		const envEmail = process.env.JIRA_EMAIL
		const envToken = process.env.JIRA_API_TOKEN
		const envJql = process.env.JIRA_JQL
		const envMaxResults = process.env.JIRA_MAX_RESULTS
		const envProjectKey = process.env.JIRA_PROJECT_KEY
		const envDefaultIssueType = process.env.JIRA_DEFAULT_ISSUE_TYPE

		// Read values from plugin options
		const optionUrl = this.readString(config.options?.url)
		const optionEmail = this.readString(config.options?.email)
		const optionToken = this.readString(config.options?.apiToken)
		const optionJql = this.readString(config.options?.jql)
		const optionMaxResults = this.readNumber(config.options?.maxResults)
		const optionProjectKey = this.readString(config.options?.projectKey)
		const optionDefaultIssueType = this.readString(config.options?.defaultIssueType)

		// Read explicit config values
		const explicitUrl = this.readString(config.url)
		const explicitEmail = this.readString(config.email)
		const explicitToken = this.readString(config.apiToken)
		const explicitJql = this.readString(config.jql)
		const explicitMaxResults = this.readNumber(config.maxResults)
		const explicitProjectKey = this.readString(config.projectKey)
		const explicitDefaultIssueType = this.readString(config.defaultIssueType)

		// Apply precedence: explicit > options > env, with normalization
		const resolvedUrl = this.normalizeUrl(explicitUrl ?? optionUrl ?? envUrl ?? '')
		const resolvedEmail = explicitEmail ?? optionEmail ?? envEmail ?? ''
		const resolvedToken = explicitToken ?? optionToken ?? envToken ?? ''
		const resolvedJql = explicitJql ?? optionJql ?? envJql ?? DEFAULT_JQL
		const resolvedProjectKey = explicitProjectKey ?? optionProjectKey ?? envProjectKey ?? ''
		const resolvedDefaultIssueType = explicitDefaultIssueType ?? optionDefaultIssueType ?? envDefaultIssueType ?? 'Task'

		const resolvedMaxResults = this.normalizeMaxResults(
			explicitMaxResults ??
				optionMaxResults ??
				(envMaxResults ? Number(envMaxResults) : undefined) ??
				DEFAULT_MAX_RESULTS
		)

		// Resolve column configuration from options
		const columnConfig = config.options?.columnConfig

		return {
			url: resolvedUrl,
			email: resolvedEmail,
			apiToken: resolvedToken,
			jql: resolvedJql,
			maxResults: resolvedMaxResults,
			projectKey: resolvedProjectKey,
			defaultIssueType: resolvedDefaultIssueType,
			...(columnConfig ? { columnConfig } : {})
		}
	}

	/**
	 * Builds Basic authentication headers using email and API token.
	 */
	private buildAuthHeaders(): Record<string, string> {
		const { email, apiToken } = this.resolvedConfig
		const token = Buffer.from(`${email}:${apiToken}`).toString('base64')

		return {
			Authorization: `Basic ${token}`
		}
	}

	/**
	 * Converts a Jira issue to a RoadmapCard with ADF-to-text conversion.
	 *
	 * @param issue - Jira issue object
	 */
	private mapIssueToCard(issue: JiraIssue): RoadmapCard {
		const { fields } = issue

		const title = fields.summary ?? issue.key
		const description = this.convertAdfToPlainText(fields.description)
		const labels = Array.isArray(fields.labels) ? [...fields.labels] : []
		const originalStatus = fields.status?.name ?? 'Unknown'
		const column = this.mapStatusToColumn(fields.status)
		const assignees = this.mapAssignee(fields.assignee)
		const url = `${this.resolvedConfig.url}/browse/${issue.key}`
		const updatedAt = fields.updated ? new Date(fields.updated) : new Date()

		const existingMetadata = (issue as unknown as { metadata?: Record<string, unknown> })?.metadata || {}
		
		return {
			id: issue.key,
			title,
			description,
			labels,
			column,
			assignees,
			url,
			updatedAt,
			metadata: {
				...existingMetadata,
				originalStatus: originalStatus,
				issue
			}
		}
	}

	/**
	 * Maps Jira assignee to RoadmapCard assignees array (single assignee).
	 *
	 * @remarks
	 * **Critical: Redaction Contract**
	 * The `name` field is set to Jira's `displayName` and must never be displayed directly
	 * to end users. It is intended to be used only as a key for guild-specific mapping to
	 * Discord user identities via the assignee mapping system. UI/Discord surfaces must
	 * not render `name` directly unless it has been redacted or mapped to a Discord user.
	 * For Jira providers, this field holds the provider display name and is not a safe public
	 * identifier unless redacted or mapped to Discord.
	 */
	private mapAssignee(assignee?: JiraUser | null): RoadmapCard['assignees'] {
		if (!assignee) {
			return []
		}

		const id = assignee.accountId ?? 'unassigned'
		const name = assignee.displayName ?? 'Unassigned'
		const avatarUrl = assignee.avatarUrls?.['48x48'] ?? assignee.avatarUrls?.['32x32'] ?? assignee.avatarUrls?.['24x24']

		return [
			{
				id,
				name,
				...(avatarUrl ? { avatarUrl } : {})
			}
		]
	}

	/**
	 * Maps Jira status to roadmap column using configured mapping or default logic.
	 *
	 * @param status - Jira status object
	 * @returns Column name to map to (provider-level mapping only; guild overrides applied in sync engine)
	 */
	private mapStatusToColumn(status?: JiraStatus): string {
		if (!status) {
			return 'Backlog'
		}

		const statusName = status.name ?? ''
		
		// Try to resolve using provider-level mapping (guild overrides handled in sync engine)
		const resolved = this.resolveColumn(statusName)
		if (resolved !== undefined) {
			// If resolved to null, that means track without forum - use default column for now
			// The sync engine will handle null mappings separately
			if (resolved === null) {
				return 'Backlog' // Fallback, but sync engine should handle null
			}
			return resolved
		}

		// Default mapping logic (backward compatibility)
		const normalized = statusName.toLowerCase()

		// Check for 'backlog' in status name
		if (normalized.includes('backlog')) {
			return 'Backlog'
		}

		// Map by status category
		const category = status.statusCategory?.name?.toLowerCase()

		switch (category) {
			case 'to do':
				return 'Backlog'
			case 'in progress':
				return 'In Progress'
			case 'done':
				return 'Done'
			default:
				break
		}

		// Fallback: check status name patterns
		if (normalized.includes('todo') || normalized.includes('to do')) {
			return 'Backlog'
		}

		if (normalized.includes('progress') || normalized.includes('doing')) {
			return 'In Progress'
		}

		if (normalized.includes('done') || normalized.includes('complete') || normalized.includes('closed')) {
			return 'Done'
		}

		return 'Backlog'
	}

	/**
	 * Converts Atlassian Document Format (ADF) to plain text using recursive visitor pattern.
	 */
	private convertAdfToPlainText(adf: unknown): string {
		if (typeof adf === 'string') {
			return adf
		}

		if (!adf || typeof adf !== 'object') {
			return ''
		}

		const segments: string[] = []

		// Recursive visitor to traverse ADF nodes
		const visit = (node: AdfNode, depth = 0): void => {
			if (!node || typeof node !== 'object') {
				return
			}

			const type = node.type

			// Handle text nodes
			if (type === 'text') {
				const text = 'text' in node && typeof node.text === 'string' ? node.text : ''
				segments.push(text)
				return
			}

			// Handle line breaks
			if (type === 'hardBreak' || type === 'lineBreak') {
				segments.push('\n')
				return
			}

			// Handle paragraphs
			if (type === 'paragraph') {
				if ('content' in node && Array.isArray(node.content)) {
					for (const child of node.content) {
						visit(child, depth)
					}
				}
				segments.push('\n')
				return
			}

			// Handle headings
			if (type === 'heading') {
				if ('content' in node && Array.isArray(node.content)) {
					for (const child of node.content) {
						visit(child, depth)
					}
				}
				segments.push('\n\n')
				return
			}

			// Handle lists (bullet and ordered)
			if (type === 'bulletList' || type === 'orderedList') {
				if ('content' in node && Array.isArray(node.content)) {
					node.content.forEach((item: AdfNode, index: number) => {
						const prefix = type === 'orderedList' ? `${index + 1}. ` : '- '
						segments.push(prefix)
						visit(item, depth + 1)
						const lastSegment = segments[segments.length - 1] ?? ''
						if (!lastSegment.endsWith('\n')) {
							segments.push('\n')
						}
					})
				}
				return
			}

			// Handle list items
			if (type === 'listItem') {
				if ('content' in node && Array.isArray(node.content)) {
					for (const child of node.content) {
						visit(child, depth)
					}
				}
				const lastSegment = segments[segments.length - 1] ?? ''
				if (!lastSegment.endsWith('\n')) {
					segments.push('\n')
				}
				return
			}

			// Handle code blocks
			if (type === 'codeBlock') {
				segments.push('\n')
				if ('content' in node && Array.isArray(node.content)) {
					for (const child of node.content) {
						visit(child, depth)
					}
				}
				segments.push('\n')
				return
			}

			// Handle document root
			if (type === 'doc' && 'content' in node && Array.isArray(node.content)) {
				for (const child of node.content) {
					visit(child, depth)
				}
				return
			}

			// Handle unknown nodes with content
			if ('content' in node && Array.isArray(node.content)) {
				for (const child of node.content) {
					visit(child, depth)
				}
				return
			}
		}

		try {
			visit(adf as AdfNode)
			return segments
				.join('')
				.replace(/\n{3,}/g, '\n\n')
				.trim()
		} catch {
			return typeof adf === 'string' ? adf : JSON.stringify(adf)
		}
	}

	/**
	 * Converts plain text to Atlassian Document Format (ADF).
	 *
	 * @remarks
	 * This is a basic implementation that converts plain text to ADF by splitting on newlines
	 * and creating paragraph nodes. This is the inverse of {@link convertAdfToPlainText}.
	 *
	 * @param text - The plain text to convert.
	 * @returns The ADF representation of the text.
	 */
	private convertPlainTextToAdf(text: string): unknown {
		if (!text || !text.trim()) {
			return {
				type: 'doc',
				version: 1,
				content: []
			}
		}

		// Split by newlines and create paragraph nodes
		const lines = text.split('\n').filter((line) => line.trim())
		const content = lines.map((line) => ({
			type: 'paragraph',
			content: [
				{
					type: 'text',
					text: line
				}
			]
		}))

		return {
			type: 'doc',
			version: 1,
			content
		}
	}

	/**
	 * Transitions a Jira issue to a target column by finding and executing the appropriate transition.
	 *
	 * @remarks
	 * This method fetches available transitions for the issue and finds one that moves it to
	 * the target status. If no suitable transition is found, a warning is logged but no error
	 * is thrown.
	 *
	 * @param issueKey - The Jira issue key (e.g., 'PROJ-123').
	 * @param targetColumn - The target column name (e.g., 'In Progress', 'Done').
	 */
	private async transitionIssueToColumn(issueKey: string, targetColumn: string): Promise<void> {
		try {
			const { url } = this.resolvedConfig

			// Map column to Jira status name
			const targetStatus = this.mapColumnToStatus(targetColumn)

			roadmapLogger.debug('Transitioning issue %s to status: %s', issueKey, targetStatus)

			// Get available transitions
			const transitionsResponse = await fetch(`${url}/rest/api/3/issue/${issueKey}/transitions`, {
				method: 'GET',
				headers: {
					...this.buildAuthHeaders(),
					Accept: 'application/json'
				}
			})

			if (!transitionsResponse.ok) {
				throw new Error(`Failed to fetch transitions: ${await this.safeReadError(transitionsResponse)}`)
			}

			const transitionsData = (await transitionsResponse.json()) as {
				transitions: Array<{
					id: string
					name: string
					to: { name: string; statusCategory?: { name?: string } }
				}>
			}

			// Find transition that moves to target status
			const transition = transitionsData.transitions.find((t) => {
				const toStatusName = t.to.name?.toLowerCase() ?? ''
				const toStatusCategory = t.to.statusCategory?.name?.toLowerCase() ?? ''

				// Try to match by status name or category
				return (
					toStatusName.includes(targetStatus.toLowerCase()) || toStatusCategory.includes(targetStatus.toLowerCase())
				)
			})

			if (!transition) {
				roadmapLogger.warn(
					'No transition found for issue %s to status %s. Available transitions: %s',
					issueKey,
					targetStatus,
					transitionsData.transitions.map((t) => t.name).join(', ')
				)
				return
			}

			// Execute the transition
			const executeResponse = await fetch(`${url}/rest/api/3/issue/${issueKey}/transitions`, {
				method: 'POST',
				headers: {
					...this.buildAuthHeaders(),
					'Content-Type': 'application/json',
					Accept: 'application/json'
				},
				body: JSON.stringify({
					transition: { id: transition.id }
				})
			})

			if (!executeResponse.ok) {
				throw new Error(`Failed to execute transition: ${await this.safeReadError(executeResponse)}`)
			}

			roadmapLogger.debug('Successfully transitioned issue %s to %s', issueKey, targetStatus)
		} catch (error) {
			roadmapLogger.warn('Failed to transition issue %s: %s', issueKey, (error as Error).message)
		}
	}

	/**
	 * Maps a roadmap column name to a Jira status name.
	 *
	 * @remarks
	 * This is the inverse of {@link mapStatusToColumn}.
	 *
	 * @param column - The column name (e.g., 'Backlog', 'In Progress', 'Done').
	 * @returns The Jira status name.
	 */
	private mapColumnToStatus(column: string): string {
		switch (column) {
			case 'Backlog':
				return 'To Do'
			case 'In Progress':
				return 'In Progress'
			case 'Done':
				return 'Done'
			default:
				return 'To Do'
		}
	}

	/**
	 * Removes trailing slashes from URL.
	 */
	private normalizeUrl(url: string): string {
		return url.replace(/\/+$/, '')
	}

	/**
	 * Validates URL format using URL constructor.
	 */
	private isValidUrl(candidate: string): boolean {
		try {
			new URL(candidate)
			return true
		} catch {
			return false
		}
	}

	/**
	 * Extracts trimmed string value or undefined.
	 */
	private readString(value: unknown): string | undefined {
		return typeof value === 'string' && value.trim() ? value.trim() : undefined
	}

	/**
	 * Extracts finite number value from number or string, or undefined.
	 */
	private readNumber(value: unknown): number | undefined {
		if (typeof value === 'number' && Number.isFinite(value)) {
			return value
		}

		if (typeof value === 'string' && value.trim()) {
			const parsed = Number(value)
			return Number.isFinite(parsed) ? parsed : undefined
		}

		return undefined
	}

	/**
	 * Normalizes maxResults to valid range (1-1000), defaults to 100.
	 */
	private normalizeMaxResults(value: number): number {
		if (!Number.isFinite(value) || value <= 0) {
			return DEFAULT_MAX_RESULTS
		}

		return Math.min(Math.floor(value), 1000)
	}

	/**
	 * Safely extracts error message from Jira API response.
	 */
	private async safeReadError(response: Response): Promise<string> {
		try {
			const text = await response.text()
			return text || response.statusText
		} catch (error) {
			roadmapLogger.warn('Failed to read Jira error response: %s', (error as Error).message)
			return response.statusText
		}
	}
}
