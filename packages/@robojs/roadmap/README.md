<p align="center">✨ <strong>Generated with <a href="https://robojs.dev/create-robo">create-robo</a> magic!</strong> ✨</p>

---

# @robojs/roadmap

Sync project roadmaps from Jira (or custom providers) to organized Discord forum channels, automatically creating and updating forum threads for each card while providing slash commands for seamless team collaboration.

<div align="center">

[![GitHub license](https://img.shields.io/github/license/Wave-Play/robo)](https://github.com/Wave-Play/robo/blob/main/LICENSE)
[![npm](https://img.shields.io/npm/v/@robojs/roadmap)](https://www.npmjs.com/package/@robojs/roadmap)
[![install size](https://packagephobia.com/badge?p=@robojs/roadmap@latest)](https://packagephobia.com/result?p=@robojs/roadmap@latest)
[![Discord](https://img.shields.io/discord/1087134933908193330?color=7289da)](https://robojs.dev/discord)
[![All Contributors](https://img.shields.io/github/all-contributors/Wave-Play/robo.js?color=cf7cfc)](https://github.com/Wave-Play/robo.js/blob/main/CONTRIBUTING.md#contributors)

</div>

➞ [📚 **Documentation:** Getting started](https://robojs.dev/docs/getting-started)

➞ [🚀 **Community:** Join our Discord server](https://robojs.dev/discord)

## ✨ Features

- 🔄 **Automatic bidirectional sync** between provider and Discord
- 📋 **Forum channels organized by workflow columns**
- 🏷️ **Smart label tagging** with autocomplete (up to 5 tags per thread)
- 👥 **Role-based authorization** for card creation
- 🔒 **Public/private forum access modes**
- 🔍 **Autocomplete** for cards, columns, labels, and issue types
- 📅 **Date range filtering** for programmatic queries
- 🌐 **Optional REST API** for external integrations
- 🔌 **Extensible provider architecture** (Jira, GitHub, Linear, custom)
- ⚡ **Idempotent sync** with automatic error recovery

## ⚡ Quick Happy Path

1. `npx robo add @robojs/roadmap` in an existing Robo project.
2. Set Jira env vars (`JIRA_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`) in your `.env`.
3. Start Robo with `npx robo dev`.
4. In Discord, run `/roadmap setup` to create roadmap forums.
5. Run `/roadmap sync` to import cards.
6. Click into the generated roadmap forums to collaborate on cards.

For a full walkthrough, see [Getting Started](#-getting-started) and [Provider Setup](#-provider-setup).

## 💻 Getting Started

```bash
npx robo add @robojs/roadmap
```

New to **[Robo.js](https://robojs.dev)**? Start your project with this plugin pre-installed:

```bash
npx create-robo <project-name> -p @robojs/roadmap
```

> Set Jira environment variables (`JIRA_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`) for the plugin to function. See [Provider Setup](#-provider-setup) for details.

> 💡 Install `@robojs/server` to enable REST API features for external integrations.

## 🚀 Quick Start

1. **Configure Jira credentials** in your `.env` file:

   ```env
   JIRA_URL="https://company.atlassian.net"
   JIRA_EMAIL="your-email@example.com"
   JIRA_API_TOKEN="your-api-token"
   JIRA_PROJECT_KEY="PROJ"
   ```

2. **Start your Robo:**

   ```bash
   npx robo dev
   ```

3. **Run `/roadmap setup`** in Discord to create forum channels

4. **Run `/roadmap sync`** to sync your cards from Jira

5. **Cards appear as forum threads** organized by column (Backlog, In Progress, Done, etc.)

During setup, the plugin creates a dedicated category with forum channels for each workflow column. Each card becomes a forum thread in its respective column channel, complete with labels, descriptions, and automatic updates.

## 💬 Discord Commands

The plugin provides four slash commands for managing your roadmap:

### `/roadmap setup`

Creates the roadmap forum structure. **Admin only.**

- Creates a category with forum channels for each workflow column
- Shows interactive setup message with access toggle and role selector
- Configures authorized creator roles

**Example:**

```
/roadmap setup
```

### `/roadmap sync`

Manually syncs cards from provider to Discord. **Admin only.**

- **Options:**
  - `dry-run` (boolean) - Preview sync without making changes

- Shows sync statistics (created, updated, archived)
- Cancellation: A cancel button appears during sync, allowing you to stop the operation. Only administrators or the user who started the sync can cancel. Partial results are preserved and shown (e.g., "Partial sync: 15/42 cards processed").
- Idempotent: safe to run multiple times
- When a card's column changes, the thread is moved to the new forum channel. The old thread is locked and archived to preserve discussion history, and the new thread links to it if there were user messages.

**Example:**

```
/roadmap sync dry-run:true
```

### `/roadmap add`

Creates a new card. **Authorized users.**

- **Options:**
  - `title` (required) - Card title
  - `description` - Card description
  - `column` (autocomplete) - Target column
  - `labels` (autocomplete, comma-separated) - Card labels
  - `issue-type` (autocomplete) - Issue type (Task, Bug, etc.)

- Automatically syncs to Discord after creation
- Supports autocomplete for columns, labels, and issue types

**Example:**

```
/roadmap add title:"Add dark mode" column:"Backlog" labels:"feature,ui"
```

### `/roadmap edit`

Updates an existing card. **Authorized users.**

- **Options:**
  - `card` (autocomplete, required) - Card to edit
  - `title` - New title
  - `description` - New description
  - `column` (autocomplete) - Move to column
  - `labels` (autocomplete, comma-separated) - Update labels

- Updates both provider and Discord thread
- Autocomplete searches cards by title and key
- When changing a card's column, the Discord thread is moved to the new forum channel. The previous thread is locked and archived, and the new thread includes a link to the old discussion if it had user activity.

**Example:**

```
/roadmap edit card:"PROJ-123" column:"In Progress"
```

> 💡 All autocomplete fields are cached for performance and refresh every 5 minutes by default. You can change this by setting `autocompleteCacheTtl` (in milliseconds) in your roadmap plugin options; lower values refresh suggestions more often at the cost of more provider API calls. Labels support comma-separated values for multi-selection.

## 🔧 Provider Setup

### Jira Provider

Jira is the built-in provider for syncing roadmaps from Jira Cloud.

**Required Environment Variables:**

- `JIRA_URL` - Your Jira instance URL (e.g., `https://company.atlassian.net`)
- `JIRA_EMAIL` - Email address for authentication
- `JIRA_API_TOKEN` - API token for authentication ([create one here](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/))
- `JIRA_PROJECT_KEY` - Project key to sync (e.g., `PROJ`)

**Optional Environment Variables:**

- `JIRA_JQL` - Custom JQL query to filter issues
- `JIRA_MAX_RESULTS` - Max results per page (1-1000, default 100)
- `JIRA_DEFAULT_ISSUE_TYPE` - Default issue type for new cards (default 'Task')

**Example `.env` file:**

```env
JIRA_URL="https://company.atlassian.net"
JIRA_EMAIL="team@example.com"
JIRA_API_TOKEN="ATATT3xFfGF0..."
JIRA_PROJECT_KEY="PROJ"
JIRA_JQL="labels = public"
JIRA_MAX_RESULTS="50"
JIRA_DEFAULT_ISSUE_TYPE="Story"
```

**Configuration File Example:**

```typescript
// config/plugins/robojs/roadmap.mjs
export default {
	provider: {
		type: 'jira',
		options: {
			url: process.env.JIRA_URL,
			email: process.env.JIRA_EMAIL,
			apiToken: process.env.JIRA_API_TOKEN,
			projectKey: process.env.JIRA_PROJECT_KEY,
			jql: 'labels = public',
			maxResults: 50
		}
	}
}
```

**JQL Filtering Examples:**

```typescript
// Public cards only
jql: 'project = PROJ AND labels = public'

// Exclude private cards
jql: 'project = PROJ AND labels != private'

// Active cards only (not resolved)
jql: 'project = PROJ AND resolution = Unresolved'

// Cards updated in last 30 days
jql: 'project = PROJ AND updated >= -30d'
```

> 💡 JQL (Jira Query Language) allows powerful filtering. See [Atlassian JQL documentation](https://support.atlassian.com/jira-service-management-cloud/docs/use-advanced-search-with-jira-query-language-jql/) for advanced queries.

> [!NOTE]
> Configuration precedence: explicit config file > plugin options > environment variables. Environment variables provide the simplest setup for most use cases.

## ⚙️ Configuration

### Plugin Options

Configure the plugin in `config/plugins/robojs/roadmap.mjs` (or `.ts`):

```typescript
import { JiraProvider } from '@robojs/roadmap'

export default {
	// Provider instance or config object (required)
	provider: new JiraProvider({
		type: 'jira',
		options: {
			url: process.env.JIRA_URL,
			email: process.env.JIRA_EMAIL,
			apiToken: process.env.JIRA_API_TOKEN,
			projectKey: process.env.JIRA_PROJECT_KEY,
			jql: 'labels = public',
			maxResults: 100,
			defaultIssueType: 'Task'
		}
	}),

	// Cache duration for autocomplete suggestions (default: 300000 = 5 minutes)
	autocompleteCacheTtl: 300000,

	// Whether /roadmap add and /roadmap edit replies are ephemeral (true) or visible in-channel (false)
	ephemeralCommands: true,

	// Reserved for future automatic sync feature
	autoSync: false,

	// Reserved for future sync interval configuration
	syncInterval: null
}
```

**Available Options:**

| Option                 | Type                                | Default  | Description                                                                 |
| ---------------------- | ----------------------------------- | -------- | --------------------------------------------------------------------------- |
| `provider`             | `RoadmapProvider \| ProviderConfig` | required | Provider instance or config object                                          |
| `autocompleteCacheTtl` | `number`                            | `300000` | Cache duration in milliseconds for autocomplete                             |
| `ephemeralCommands`    | `boolean`                           | `true`   | Controls whether `/roadmap add` and `/roadmap edit` replies are ephemeral   |
| `autoSync`             | `boolean`                           | `false`  | Reserved for future automatic sync                                          |
| `syncInterval`         | `number \| null`                    | `null`   | Reserved for future sync interval                                           |

### Jira Configuration

**Jira-Specific Options:**

| Option             | Type     | Required | Description                                |
| ------------------ | -------- | -------- | ------------------------------------------ |
| `url`              | `string` | yes      | Jira instance URL                          |
| `email`            | `string` | yes      | Email for authentication                   |
| `apiToken`         | `string` | yes      | API token for authentication               |
| `projectKey`       | `string` | yes      | Project key to sync                        |
| `jql`              | `string` | no       | Custom JQL query to filter issues          |
| `maxResults`       | `number` | no       | Max results per page (1-1000, default 100) |
| `defaultIssueType` | `string` | no       | Default issue type (default 'Task')        |

**Example with JQL Filtering:**

```typescript
export default {
	provider: {
		type: 'jira',
		options: {
			url: 'https://company.atlassian.net',
			email: 'team@example.com',
			apiToken: process.env.JIRA_API_TOKEN,
			projectKey: 'PROJ',
			jql: 'project = PROJ AND labels = public AND resolution = Unresolved',
			maxResults: 50,
			defaultIssueType: 'Story'
		}
	}
}
```

## 🔐 Authorization & Permissions

### Permission Levels

**Admin Commands** (`/roadmap setup`, `/roadmap sync`):

- Require **Administrator** permission in Discord

**Authorized User Commands** (`/roadmap add`, `/roadmap edit`):

- Require admin **OR** authorized creator role
- Configure authorized roles via `/roadmap setup` interactive message or settings API

### Required Discord Bot Permissions

| Permission               | Required For                 |
| ------------------------ | ---------------------------- |
| View Channels            | See forum channels           |
| Create Public Threads    | Create card threads          |
| Send Messages in Threads | Post card content            |
| Manage Threads           | Update and archive threads   |
| Manage Messages          | Edit thread starter messages |

> 💡 Permissions inherit from category to forum channels. Set permissions on the roadmap category for easiest management.

### Public vs Private Forums

- **Public mode**: `@everyone` can view forum channels
- **Private mode**: Only authorized roles can view forum channels

Configure access mode via `/roadmap setup` or the settings API.

## 🧰 Programmatic API

All functionality is available as importable functions for use in custom commands, events, or plugins.

### Provider Access

```typescript
import { getProvider, isProviderReady } from '@robojs/roadmap'

// Check if provider is ready before use
if (isProviderReady()) {
	const provider = getProvider()
	const cards = await provider.fetchCards()
}
```

### Sync Operations

```typescript
import { syncRoadmap } from '@robojs/roadmap'

// Full sync
const result = await syncRoadmap({
	guild,
	provider
})

// Dry run (preview without changes)
const preview = await syncRoadmap({
	guild,
	provider,
	dryRun: true
})

console.log(`Synced ${result.stats.total} cards`)
```

### Thread Movement on Column Changes

When a card moves to a different column (e.g., from "Backlog" to "In Progress"), the sync engine automatically moves the Discord thread to the corresponding forum channel:

- **New thread created** in the target forum with the same name, tags, and content
- **Old thread locked and archived** to preserve discussion history
- **Conditional linking**: If the old thread had user messages (more than just the starter message), the new thread includes a link at the top: "📜 See X messages in previous discussion: [link]"
- **Thread history tracked** in settings for audit trail

This behavior applies to:
- `/roadmap sync` operations
- `/roadmap edit` command when changing the column
- REST API `PUT /api/roadmap/cards/:guildId/:cardId` when updating the column

**Example:**
```typescript
import { syncRoadmap } from '@robojs/roadmap'

// When a card moves from "Backlog" to "In Progress"
// The thread will be moved to the In Progress forum
const result = await syncRoadmap({ guild, provider })
// Old thread: locked and archived in Backlog forum
// New thread: active in In Progress forum with link to old thread
```

### Card Operations

```typescript
import { getProvider } from '@robojs/roadmap'
import type { CreateCardInput, UpdateCardInput } from '@robojs/roadmap'

const provider = getProvider()

// Create a card
const newCard: CreateCardInput = {
	title: 'Add dark mode',
	description: 'Implement dark theme support',
	column: 'Backlog',
	labels: ['feature', 'ui']
}
const result = await provider.createCard(newCard)

// Update a card
const cardId = 'PROJ-123'
const update: UpdateCardInput = {
	title: 'Add dark mode support',
	column: 'In Progress',
	labels: ['feature', 'ui', 'high-priority']
}
await provider.updateCard(cardId, update)
```

### Settings Management

```typescript
import { getSettings, updateSettings, canUserCreateCards } from '@robojs/roadmap'
import { PermissionFlagsBits } from 'discord.js'

// Get current settings
const settings = getSettings(guildId)

// Update settings
updateSettings(guildId, { isPublic: true })

// Check authorization
const userRoleIds = member.roles.cache.map((r) => r.id)
const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator)
if (canUserCreateCards(guildId, userRoleIds, isAdmin)) {
	// User can create cards
}
```

### Forum Management

```typescript
import { createOrGetRoadmapCategory, toggleForumAccess, updateForumTagsForColumn } from '@robojs/roadmap'

// Create forum structure
const { category, forums } = await createOrGetRoadmapCategory({
	guild,
	columns
})

// Toggle access mode
await toggleForumAccess(guild, 'public')

// Update tags for a column
const columnName = 'Backlog'
const tagNames = ['feature', 'bug', 'enhancement', 'docs', 'design']
await updateForumTagsForColumn(guild, columnName, tagNames)
```

> [!NOTE]
> For complete API reference with all parameters, types, and return values, see the auto-generated documentation.

## 📅 Date Range Filtering

Fetch cards by time range for reports, analytics, or incremental syncs.

### Helper Functions

```typescript
import {
	getCardsFromLastMonth,
	getCardsFromLastWeek,
	getCardsFromLastDays,
	getCardsFromDateRange
} from '@robojs/roadmap'

// Last calendar month
const lastMonth = await getCardsFromLastMonth(provider)

// Last 7 days
const lastWeek = await getCardsFromLastWeek(provider)

// Last 30 days
const last30Days = await getCardsFromLastDays(provider, 30)

// Custom date range
const cards = await getCardsFromDateRange(provider, new Date('2024-01-01'), new Date('2024-01-31'))

// Use 'created' instead of 'updated' (default)
const created = await getCardsFromLastWeek(provider, 'created')
```

### Use Cases

- **Generate reports**: Monthly activity summaries
- **Track recent activity**: Cards updated in last 24 hours
- **Incremental syncs**: Only sync cards changed since last run
- **Analytics**: Trend analysis over time

> [!NOTE]
> Date filtering requires provider support. Jira provider fully supports all date range queries via `fetchCardsByDateRange()`.

## 🌐 REST API (Optional)

> 💡 Install `@robojs/server` to enable REST endpoints: `npx robo add @robojs/server`

The REST API provides HTTP endpoints for external integrations, custom dashboards, and automation.

### Response Format

**Success:**

```json
{
	"success": true,
	"data": {
		/* endpoint-specific data */
	}
}
```

**Error:**

```json
{
	"success": false,
	"error": {
		"code": "ERROR_CODE",
		"message": "Human-readable error message",
		"hint": "Optional operator-friendly hint with a suggested fix"
	}
}
```

**Common Error Codes:** `PROVIDER_NOT_READY`, `FORUM_NOT_SETUP`, `GUILD_NOT_FOUND`, `INVALID_REQUEST`, `SYNC_FAILED`

### Key Endpoints

**Health & Provider**

```bash
# Check health status
curl http://localhost:3000/api/roadmap/health

# Get provider info
curl http://localhost:3000/api/roadmap/provider/info
```

**Forum Management**

```bash
# Create forum structure
curl -X POST http://localhost:3000/api/roadmap/forum/:guildId/setup

# Toggle access mode
curl -X PUT http://localhost:3000/api/roadmap/forum/:guildId/access \
  -H "Content-Type: application/json" \
  -d '{"mode": "public"}'
```

**Sync Operations**

```bash
# Trigger sync
curl -X POST http://localhost:3000/api/roadmap/sync/:guildId

# Dry run
curl -X POST "http://localhost:3000/api/roadmap/sync/:guildId?dryRun=true"

# Get sync status
curl http://localhost:3000/api/roadmap/sync/:guildId/status
```

**Card Management**

```bash
# Create card
curl -X POST http://localhost:3000/api/roadmap/cards/:guildId \
  -H "Content-Type: application/json" \
  -d '{"title": "New feature", "column": "Backlog"}'

# Get card details
curl http://localhost:3000/api/roadmap/cards/:guildId/:cardId
```

> ⚠️ **Security Warning:** The card creation endpoint lacks authentication by default. Implement authentication middleware before exposing to the internet.

### Use Cases

- **Custom dashboards**: Monitor roadmap sync status across multiple guilds
- **External automation**: Trigger syncs from CI/CD pipelines or webhooks
- **Monitoring tools**: Track provider health and sync statistics
- **Multi-guild management**: Manage roadmap configuration across servers

## 🔌 Custom Providers

Extend the roadmap to sync from GitHub Projects, Linear, or any custom backend.

**Minimal implementation checklist**

- Extend `RoadmapProvider` with your own provider class.
- Implement the required methods: `fetchCards`, `getColumns`, `getCard`, `createCard`, `updateCard`, and `getProviderInfo`.
- Optionally implement helpers like `getIssueTypes`, `getLabels`, `fetchCardsByDateRange`, `validateConfig`, and `init` if your backend supports them.
- Register your provider in `config/plugins/robojs/roadmap.(mjs\|ts)` via the plugin options.

### Creating a Provider

```typescript
import { RoadmapProvider } from '@robojs/roadmap'
import type {
	RoadmapCard,
	RoadmapColumn,
	ProviderInfo,
	CreateCardInput,
	UpdateCardInput,
	CreateCardResult,
	UpdateCardResult
} from '@robojs/roadmap'

class CustomProvider extends RoadmapProvider {
	// Required: Fetch all cards
	async fetchCards(): Promise<RoadmapCard[]> {
		// Implement your logic
		return []
	}

	// Required: Get workflow columns
	async getColumns(): Promise<RoadmapColumn[]> {
		return []
	}

	// Required: Get single card by ID
	async getCard(id: string): Promise<RoadmapCard | null> {
		return null
	}

	// Required: Create a new card
	async createCard(input: CreateCardInput): Promise<CreateCardResult> {
		// TODO: Implement card creation logic
		// Return placeholder for demonstration
		const card: RoadmapCard = {
			id: 'placeholder',
			title: input.title,
			description: input.description,
			column: input.column,
			labels: input.labels || [],
			assignees: input.assignees || [],
			url: 'https://example.com',
			updatedAt: new Date()
		}
		return { card, success: false, message: 'Not implemented' }
	}

	// Required: Update existing card (partial update - only provided fields are changed)
	async updateCard(cardId: string, input: UpdateCardInput): Promise<UpdateCardResult> {
		// TODO: Implement card update logic
		// Return placeholder for demonstration
		const card: RoadmapCard = {
			id: cardId,
			title: input.title || 'Unknown',
			description: input.description || '',
			column: input.column || 'Unknown',
			labels: input.labels || [],
			assignees: input.assignees || [],
			url: 'https://example.com',
			updatedAt: new Date()
		}
		return { card, success: false, message: 'Not implemented' }
	}

	// Required: Provider metadata
	async getProviderInfo(): Promise<ProviderInfo> {
		return {
			name: 'Custom Provider',
			version: '1.0.0',
			capabilities: ['cards', 'columns']
		}
	}

	// Optional: Validate configuration
	async validateConfig(): Promise<void> {
		// Throw error if config is invalid
	}

	// Optional: Initialize provider
	async init(): Promise<void> {
		// Setup connections, auth, etc.
	}

	// Optional: Get issue types
	async getIssueTypes(): Promise<string[]> {
		return ['Task', 'Bug', 'Feature']
	}

	// Optional: Get labels
	async getLabels(): Promise<string[]> {
		return []
	}

	// Optional: Date range filtering
	async fetchCardsByDateRange(
		startDate: Date,
		endDate: Date,
		dateField?: 'created' | 'updated'
	): Promise<RoadmapCard[]> {
		return []
	}
}
```

### Registering a Custom Provider

```typescript
// config/plugins/robojs/roadmap.mjs
import { CustomProvider } from './providers/custom.js'

export default {
	provider: new CustomProvider({
		// Your provider config
	})
}
```

> 💡 See `AGENTS.md` for detailed implementation guidance, best practices, and architecture details.

## 🛠️ Troubleshooting

**Provider not configured**

- Check environment variables are set correctly
- Verify Jira URL is accessible
- Ensure API token has required permissions

**Authentication failed**

- Verify Jira email and API token
- Ensure token hasn't expired
- Check token has project access

**Missing permissions**

- Ensure bot has required Discord permissions (see [Authorization & Permissions](#-authorization--permissions))
- Check permissions inherit from category to forums

**Sync errors (content too long)**

- Card descriptions are automatically truncated to Discord's limits
- 2000 characters for forum thread starter messages and message edits

**Cards not appearing**

- Run `/roadmap setup` first to create forum channels
- Check that provider columns match configured columns
- Verify JQL query doesn't exclude all cards

**Rate limit errors**

- Reduce `maxResults` setting
- Increase time between syncs
- Wait before retrying

**Forum not set up**

- Run `/roadmap setup` before using other commands
- Check bot has permissions to create channels

**Autocomplete not working**

- Wait for cache refresh (default 5 minutes)
- Restart bot to force cache refresh
- Check provider is ready via `isProviderReady()`

**How to cancel a running sync**

- Click the "Cancel Sync" button that appears during the sync progress.
- Only administrators or the user who started the sync can cancel.
- The sync stops after finishing the current card (typically < 1 second).
- Partial results are preserved and shown in the cancellation message.
- Stats reflect cards successfully processed before cancellation.

**Sync canceled but shows partial results**

- This is expected behavior — cancellation preserves completed work.
- The cancellation message shows "Partial sync: X/Y cards processed".
- Stats (created, updated, archived, errors) reflect processed cards before cancellation.
- Cards synced before cancellation remain in Discord.
- Run `/roadmap sync` again to complete the sync.

**Cancel button not working**

- Verify you are an administrator or the user who started the sync.
- If the sync already completed, the cancel button won't work (sync already ended).
- If you see a "Not authorized" message, you don't have permission to cancel this sync.
- If the button appears disabled, the sync may have already finished.
- Check bot logs for any errors related to cancellation.

**Threads moved to different forums**

- This is expected behavior when a card's column changes
- Old threads are locked and archived to preserve history
- New threads link to old discussions if they had user activity
- Thread history is tracked in settings

**Old threads are locked**

- Threads are automatically locked when a card moves to a new column
- This prevents confusion from discussions in multiple places
- Users can still view locked threads and their history
- The new thread includes a link to the old discussion

**Thread links show "See X messages"**

- Links only appear when the old thread had user messages (not just the starter message)
- Message count excludes the starter message (e.g., "See 5 messages" means 5 user replies)
- This helps users find valuable prior discussions
- Threads with only the starter message are not linked

**Thread creation fails**

- Check bot has Create Public Threads permission
- Verify forum channels exist
- Ensure forum isn't at Discord's thread limit

> 💡 Enable debug logging by setting `ROBO_LOG_LEVEL=debug` in your `.env` file. Look for logs with `roadmap:` prefix for detailed diagnostics.

> [!HELP]
> Still stuck? Enable debug logging and check for errors in the console. If you need further assistance, join our Discord community.

## 🤔 Got questions?

If you need help, hop into our community Discord. We love to chat, and Sage (our resident AI Robo) is always online to assist.

➞ [🚀 **Community:** Join our Discord server](https://robojs.dev/discord)
