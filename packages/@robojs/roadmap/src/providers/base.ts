import type {
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

/**
 * Base class for roadmap data providers (Jira, GitHub Projects, Linear).
 *
 * @remarks
 * Extend this class to integrate external project management systems with the roadmap plugin.
 * Implement the abstract methods to fetch cards, columns, and provider metadata.
 *
 * @example
 * ```ts
 * export class JiraRoadmapProvider extends RoadmapProvider<JiraProviderConfig> {
 *   public async fetchCards(): Promise<RoadmapCard[]> {
 *     // Fetch and map Jira issues to RoadmapCard
 *     return [];
 *   }
 *
 *   public async getColumns() {
 *     return [{ id: 'todo', name: 'To Do', order: 0 }];
 *   }
 * }
 * ```
 */
export abstract class RoadmapProvider<TConfig extends ProviderConfig = ProviderConfig> {
	/**
	 * Creates a new roadmap provider instance with the supplied configuration.
	 *
	 * @param config - Provider specific configuration object.
	 */
	protected constructor(protected readonly config: TConfig) {}

	/**
	 * Validates provider-specific configuration. Default implementation returns true.
	 *
	 * @param _config - Configuration to validate (defaults to instance config).
	 * @returns Whether the configuration is valid.
	 *
	 * @example
	 * ```ts
	 * public override validateConfig(config = this.config) {
	 *   return Boolean(config.options?.apiToken);
	 * }
	 * ```
	 */
	public validateConfig(_config: TConfig = this.config): boolean {
		void _config
		return true
	}

	/**
	 * Optional initialization hook called before the first sync. Default implementation is a no-op.
	 *
	 * @example
	 * ```ts
	 * public override async init() {
	 *   await this.client.authenticate();
	 * }
	 * ```
	 */
	public async init(): Promise<void> {
		// Default no-op implementation; override when setup is required.
	}

	/**
	 * Fetches all roadmap cards from the provider.
	 *
	 * @returns Array of roadmap cards.
	 */
	public abstract fetchCards(): Promise<readonly RoadmapCard[]>

	/**
	 * Retrieves the available roadmap columns.
	 *
	 * @returns Array of column definitions.
	 *
	 * @example
	 * ```ts
	 * public async getColumns() {
	 *   return [
	 *     { id: 'backlog', name: 'Backlog', order: 0, archived: false },
	 *     { id: 'done', name: 'Done', order: 3, archived: true },
	 *   ];
	 * }
	 * ```
	 */
	public abstract getColumns(): Promise<readonly RoadmapColumn[]>

	/**
	 * Retrieves available issue types for card creation (e.g., 'Task', 'Story', 'Bug').
	 *
	 * @returns Array of issue type names.
	 *
	 * @example
	 * ```ts
	 * public async getIssueTypes(): Promise<readonly string[]> {
	 *   return ['Task', 'Story', 'Bug', 'Epic'];
	 * }
	 * ```
	 */
	public abstract getIssueTypes(): Promise<readonly string[]>

	/**
	 * Retrieves available labels for card categorization (e.g., 'bug', 'enhancement').
	 *
	 * @returns Array of label names.
	 *
	 * @example
	 * ```ts
	 * public async getLabels(): Promise<readonly string[]> {
	 *   return ['bug', 'enhancement', 'feature'];
	 * }
	 * ```
	 */
	public abstract getLabels(): Promise<readonly string[]>

	/**
	 * Optional method to fetch cards filtered by date range (useful for reporting and activity analysis).
	 *
	 * @param filter - Date range filter with optional startDate, endDate, and dateField.
	 * @returns Cards matching the date criteria, ordered by date descending (most recent first).
	 *
	 * @example
	 * ```ts
	 * public async fetchCardsByDateRange(filter: DateRangeFilter): Promise<readonly RoadmapCard[]> {
	 *   const jql = this.buildDateRangeJql(filter);
	 *   const issues = await this.searchIssues(jql);
	 *   return issues.map(this.mapIssueToCard);
	 * }
	 * ```
	 */
	public async fetchCardsByDateRange?(filter: DateRangeFilter): Promise<readonly RoadmapCard[]>

	/**
	 * Retrieves a single card by its provider-specific ID (e.g., Jira issue key 'PROJ-123').
	 *
	 * @param cardId - Provider-specific identifier.
	 * @returns Card if found, null if not found.
	 * @throws Authentication or network errors (not for missing cards).
	 *
	 * @example
	 * ```ts
	 * public async getCard(cardId: string): Promise<RoadmapCard | null> {
	 *   try {
	 *     const issue = await this.client.getIssue(cardId);
	 *     return this.mapIssueToCard(issue);
	 *   } catch (error) {
	 *     if (error.status === 404) return null;
	 *     throw error;
	 *   }
	 * }
	 * ```
	 */
	public abstract getCard(cardId: string): Promise<RoadmapCard | null>

	/**
	 * Creates a new card in the external provider system.
	 *
	 * @param input - Card data (title, description, column, labels, etc.).
	 * @returns Result containing the created card and success status.
	 * @throws Authentication, validation, or network errors.
	 *
	 * @example
	 * ```ts
	 * public async createCard(input: CreateCardInput): Promise<CreateCardResult> {
	 *   const issue = await this.client.createIssue({
	 *     summary: input.title,
	 *     description: input.description,
	 *   });
	 *   return { card: this.mapIssueToCard(issue), success: true };
	 * }
	 * ```
	 */
	public abstract createCard(input: CreateCardInput): Promise<CreateCardResult>

	/**
	 * Updates an existing card (partial update - only provided fields are changed).
	 *
	 * @param cardId - Provider-specific identifier.
	 * @param input - Partial card data to update.
	 * @returns Result containing the updated card and success status.
	 * @throws Authentication, validation, not found, or network errors.
	 *
	 * @example
	 * ```ts
	 * public async updateCard(cardId: string, input: UpdateCardInput): Promise<UpdateCardResult> {
	 *   const fields: Record<string, unknown> = {};
	 *   if (input.title) fields.summary = input.title;
	 *   if (input.description) fields.description = input.description;
	 *
	 *   await this.client.updateIssue(cardId, { fields });
	 *   const card = await this.getCard(cardId);
	 *
	 *   return { card: card!, success: true };
	 * }
	 * ```
	 */
	public abstract updateCard(cardId: string, input: UpdateCardInput): Promise<UpdateCardResult>

	/**
	 * Returns provider metadata (name, version, capabilities) for diagnostics and logging.
	 *
	 * @returns Provider information.
	 *
	 * @example
	 * ```ts
	 * public async getProviderInfo() {
	 *   return {
	 *     name: 'GitHub Projects',
	 *     version: '0.1.0',
	 *     capabilities: ['cards', 'columns'],
	 *   };
	 * }
	 * ```
	 */
	public abstract getProviderInfo(): Promise<ProviderInfo>
}
