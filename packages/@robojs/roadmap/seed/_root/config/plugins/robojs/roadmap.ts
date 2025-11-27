import { JiraProvider } from '@robojs/roadmap'
import type { RoadmapPluginOptions } from '@robojs/roadmap'

/**
 * Roadmap Plugin Configuration
 *
 * This file configures the @robojs/roadmap plugin to sync your project roadmap
 * from Jira (or custom providers) to Discord forum channels.
 *
 * 📚 Full Documentation: https://robojs.dev/plugins/roadmap
 * ⚙️ Configuration Guide: https://robojs.dev/plugins/roadmap#-configuration
 * 🔧 Provider Setup: https://robojs.dev/plugins/roadmap#-provider-setup
 * 🏷️ Thread Title Templates: https://robojs.dev/plugins/roadmap#-thread-title-templates
 *
 * Column Mapping:
 * 
 * ✅ DEFAULT BEHAVIOR (No configuration needed):
 * The plugin automatically maps Jira status categories to columns:
 * - "To Do" category → "Backlog" column
 * - "In Progress" category → "In Progress" column
 * - "Done" category → "Done" column
 * 
 * These defaults work immediately - you don't need to configure anything to start syncing!
 *
 * 🔧 OPTIONAL CUSTOMIZATION:
 * You can override defaults at two levels:
 * 1. Provider-level: Set `columnConfig` in provider options (affects all guilds)
 * 2. Runtime-level: Use `/roadmap setup` to configure per-guild overrides
 *
 * Supports many-to-one mappings (multiple statuses to one column) and null mappings
 * (status tracked but not synced to forum, useful for changelogs).
 */

const config: RoadmapPluginOptions = {
	// Provider instance - import and instantiate JiraProvider directly
	provider: new JiraProvider({
		type: 'jira',
		options: {
			// Required: Jira instance URL (e.g., https://company.atlassian.net)
			url: process.env.JIRA_URL,
			// Required: Email for Jira authentication
			email: process.env.JIRA_EMAIL,
			// Required: Jira API token (create one at: https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/)
			apiToken: process.env.JIRA_API_TOKEN,
			// Required: Project key to sync (e.g., 'PROJ')
			projectKey: process.env.JIRA_PROJECT_KEY,

			// Optional: Custom JQL query to filter issues
			// Default: '(issuetype = Epic AND (labels NOT IN ("Private") OR labels IS EMPTY)) OR labels IN ("Public")'
			// Examples:
			//   - Public cards only: 'project = PROJ AND labels = public'
			//   - Active cards: 'project = PROJ AND resolution = Unresolved'
			//   - Recent updates: 'project = PROJ AND updated >= -30d'
			// See: https://support.atlassian.com/jira-service-management-cloud/docs/use-advanced-search-with-jira-query-language-jql/
			jql: process.env.JIRA_JQL,

			// Optional: Maximum results per page (1-1000, default: 100)
			// Lower values reduce API load but may require more requests
			maxResults: process.env.JIRA_MAX_RESULTS ? Number(process.env.JIRA_MAX_RESULTS) : 100,

			// Optional: Default issue type for new cards created via /roadmap add (default: 'Task')
			// Common values: 'Task', 'Story', 'Epic', 'Bug'
			defaultIssueType: process.env.JIRA_DEFAULT_ISSUE_TYPE || 'Task',

			// Optional: Custom column definitions and status-to-column mappings
			// Uncomment and customize to match your Jira workflow:
			// columnConfig: {
			//   columns: [
			//     { id: 'planning', name: 'Planning', order: 0 },
			//     { id: 'development', name: 'Development', order: 1 },
			//     { id: 'review', name: 'Review', order: 2 },
			//     { id: 'done', name: 'Done', order: 3, archived: true }
			//   ]
            // },
			// statusMapping: {
			//     'Backlog': 'Planning',
			//     'To Do': 'Planning',
			//     'In Progress': 'Development',
			//     'Code Review': 'Review',
			//     'QA': 'Review',
			//     'Done': 'Done',
			//     'Closed': null,  // Track but don't create forum thread
			//     'Won\'t Do': null
			//   }
			// }
		}
	}),

	// Default template for Discord thread titles
	// Supports placeholders: {id} (card ID) and {title} (card title)
	// This can be overridden per-guild via guild settings
	// Examples:
	//   - "[{id}] {title}" → "[PROJ-123] Add dark mode"
	//   - "{id} - {title}" → "PROJ-123 - Add dark mode"
	//   - "{title} ({id})" → "Add dark mode (PROJ-123)"
	// If not provided, thread titles use just the card title
	threadTitleTemplate: '[{id}] {title}',

	// Cache duration for autocomplete suggestions (default: 300000 = 5 minutes)
	// Lower values provide fresher data but increase API calls
	// Higher values reduce API load but may show stale data
	// autocompleteCacheTtl: 300000,

	// Whether /roadmap add and /roadmap edit replies are ephemeral (default: true)
	// When true, command replies are only visible to the invoking user
	// When false, results are posted visibly in the channel for team visibility
	// ephemeralCommands: true,

	// Reserved for future automatic sync feature
	// autoSync: false,

	// Reserved for future sync interval configuration
	// syncInterval: null
}

export default config

