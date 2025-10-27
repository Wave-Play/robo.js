# @robojs/roadmap Plugin - AI Agent Reference

This document is a deep technical reference for AI coding agents working on the `@robojs/roadmap` plugin. It explains architecture, contracts, flows, error handling, and gotchas. For user-facing documentation, see `README.md` in this package.

Note: This file is for AI agents and maintainers, not end users.

## Architecture Overview

- Core purpose: Sync roadmap data from external providers (e.g., Jira) to Discord forum channels organized by column (Backlog, In Progress, Done), with commands and an optional REST API.
- Key dependencies:
  - robo.js (State API, Logger API, Discord client integration)
  - discord.js v14
  - @robojs/server (optional, only when REST API routes are enabled)
- File structure and roles:
  - `src/index.ts` – Public API exports and top-level wiring
  - `src/types.ts` – Core type definitions
  - `src/providers/` – Provider implementations (`base.ts`, `jira.ts`)
  - `src/core/` – Core modules (`sync-engine.ts`, `forum-manager.ts`, `settings.ts`, `constants.ts`)
  - `src/commands/` – Discord slash commands (`roadmap/setup.ts`, `roadmap/sync.ts`, `roadmap/add.ts`, `roadmap/edit.ts`)
  - `src/events/` – Lifecycle and interaction handlers (`_start.ts`, `interactionCreate/*`)
  - `src/api/` – REST API endpoints (requires `@robojs/server`)

### High-level flow (Mermaid)

```mermaid
sequenceDiagram
    participant User as User/Admin
    participant Cmd as Discord Command
    participant Init as Plugin Init
    participant Provider as RoadmapProvider
    participant Sync as Sync Engine
    participant Forum as Forum Manager
    participant Settings as Flashcore Settings
    participant Discord as Discord API

    Note over User,Discord: Plugin Initialization Flow
    Init->>Provider: resolveProviderConfig()
    Provider->>Provider: Check plugin options
    Provider->>Provider: Check environment vars
    Provider->>Init: Return config or null
    Init->>Provider: validateConfig()
    Provider->>Init: Valid/Invalid
    Init->>Provider: init() (authenticate)
    Provider->>Init: Ready/Error
    Init->>Init: Store in global state

    Note over User,Discord: Setup Command Flow
    User->>Cmd: /roadmap setup
    Cmd->>Provider: getColumns()
    Provider-->>Cmd: [Backlog, In Progress, Done]
    Cmd->>Forum: createOrGetRoadmapCategory()
    Forum->>Settings: getSettings(guildId)
    Settings-->>Forum: Existing settings
    Forum->>Discord: Check existing category/forums
    alt Category exists
        Forum->>Forum: Return existing
    else Create new
        Forum->>Discord: Create category
        Forum->>Discord: Create forum channels
        Forum->>Settings: updateSettings()
    end
    Forum-->>Cmd: Category + Forums
    Cmd->>User: Setup message with buttons

    Note over User,Discord: Sync Command Flow
    User->>Cmd: /roadmap sync
    Cmd->>Provider: fetchCards()
    Provider-->>Cmd: [Card1, Card2, ...]
    Cmd->>Provider: getColumns()
    Provider-->>Cmd: [Column1, Column2, ...]
    Cmd->>Sync: syncRoadmap()
    Sync->>Forum: getAllForumChannels()
    Forum->>Settings: getSettings(guildId)
    Settings-->>Forum: Forum channel IDs
    Forum->>Discord: Fetch forum channels
    Discord-->>Forum: Forum objects
    Forum-->>Sync: Map of forums

    loop For each column
        Sync->>Forum: updateForumTagsForColumn()
        Forum->>Discord: setAvailableTags()
    end

    loop For each card
        Sync->>Settings: getSyncedPostId(cardId)
        Settings-->>Sync: Thread ID or null
        alt Thread exists
            Sync->>Discord: Fetch thread
            Sync->>Discord: Edit thread name/tags
            Sync->>Discord: Edit starter message
        else Create new
            Sync->>Discord: Create thread
            Sync->>Settings: setSyncedPost(cardId, threadId)
        end
    end

    Sync->>Settings: updateSettings(lastSyncTimestamp)
    Sync-->>Cmd: SyncResult with stats
    Cmd->>User: Success message

    Note over User,Discord: Add Card Flow
    User->>Cmd: /roadmap add
    Cmd->>Cmd: Check authorization
    Cmd->>Provider: createCard(input)
    Provider->>Provider: Map to provider format
    Provider->>Provider: Call provider API
    Provider-->>Cmd: CreateCardResult
    Cmd->>Sync: syncRoadmap()
    Sync->>Discord: Create thread for new card
    Sync->>Settings: setSyncedPost()
    Cmd->>User: Success message
```

## Documentation and Error Handling Standards

This section codifies the standards for all future development in this plugin.

### JSDoc Documentation Standards

Public API functions (exported from `src/index.ts`) must have focused, practical JSDoc:

**Required elements:**

- Purpose in 1-2 sentences
- `@param` tags with brief descriptions
- `@returns` tag with type and description
- `@throws` tags for errors that callers must handle
- 1-2 simple `@example` blocks showing typical usage

**What to avoid:**

- Excessive remarks about implementation details
- Performance characteristics, caching strategies, timezone handling
- Edge cases, provider-specific internals, pagination mechanisms
- Flashcore/Discord API internals

**Internal functions** should have concise JSDoc (1-2 lines) or inline comments for complex logic.

**Good example:**

````typescript
/**
 * Fetches cards from the last 7 days (inclusive of today).
 *
 * @param provider - The roadmap provider instance.
 * @param dateField - The date field to filter on (defaults to 'updated').
 * @returns Array of cards from the last 7 days.
 * @throws Error if provider is null/undefined or doesn't support date filtering.
 *
 * @example
 * ```typescript
 * const cards = await getCardsFromLastWeek(provider);
 * ```
 */
````

**Bad example:**

```typescript
/**
 * Fetches Jira issues filtered by date range using JQL date queries.
 *
 * @remarks
 * Retrieves issues matching the specified date range criteria. Supports filtering by both
 * 'created' and 'updated' date fields, with 'updated' as the default. Results are ordered
 * by the selected date field in descending order (most recent first).
 *
 * Accepts both Date objects and ISO 8601 strings (e.g., '2025-01-01'). Results are cached
 * for 5 minutes to improve performance. Returns an empty array on error instead of throwing.
 *
 * The Jira API returns paginated results which are automatically handled internally...
 * [10 more lines of implementation details]
 */
```

### Error Handling Standards

Public API functions must throw meaningful errors with context, never fail silently.

**Required patterns:**

- Validate inputs early and throw descriptive errors with actionable messages
- Wrap external calls (provider methods, Discord API, Flashcore operations) in try-catch blocks
- Log errors with full context (function name, relevant parameters like guildId/cardId, error message) using `roadmapLogger`
- Throw or re-throw with additional context for callers

**Internal functions** may return fallback values (empty arrays, null, default objects) with logging for non-critical failures.

**Error messages should be actionable:**

```typescript
// ✅ Good - tells users what went wrong and how to fix it
throw new Error('Jira authentication failed. Check JIRA_EMAIL and JIRA_API_TOKEN environment variables.')

// ❌ Bad - vague, not actionable
throw new Error('Auth failed')
```

**Good error handling example (from JiraProvider):**

```typescript
try {
	const response = await fetch(url, options)
	if (!response.ok) {
		const errorMessage = await this.safeReadError(response)
		if (response.status === 401) {
			throw new Error('Jira authentication failed during issue retrieval.')
		}
		throw new Error(`Failed to fetch issue (status ${response.status}): ${errorMessage}`)
	}
	// Process response
} catch (error) {
	roadmapLogger.error('getCard: Failed to fetch card %s: %s', cardId, (error as Error).message)
	throw error
}
```

**Bad error handling example:**

```typescript
// ❌ Silent failure - returns empty array without logging
if (!provider?.fetchCardsByDateRange) {
	return []
}
```

### Logging Standards

**The plugin uses a single shared logger instance: `roadmapLogger` exported from `src/core/logger.ts`.**

**All files must import and use this logger - do not create additional logger forks.**

The logger is created with `logger.fork('roadmap')` for consistent namespacing.

**Log levels:**

- `debug`: Operations and state changes
- `info`: Completions and milestones
- `warn`: Non-critical failures and degraded functionality
- `error`: Critical failures that require user action
- `ready`: Initialization success

**Logs should include context** (guild ID, card ID, operation name, relevant parameters) to aid debugging.

**Good logging patterns:**

```typescript
roadmapLogger.info('Successfully created Jira issue: %s (%s)', issueKey, input.title)
roadmapLogger.error('Failed to sync card %s (title: %s): %s', card.id, card.title, error.message)
roadmapLogger.warn('No transition found for issue %s to status %s', issueKey, targetStatus)
```

Follow these standards for all new code and update existing code during maintenance.

## Provider Architecture

### RoadmapProvider Base Class

- Location: `src/providers/base.ts`
- Purpose: Abstract contract for roadmap data providers
- Abstract methods:
  - `fetchCards(): Promise<readonly RoadmapCard[]>`
  - `getColumns(): Promise<readonly RoadmapColumn[]>`
  - `getCard(cardId: string): Promise<RoadmapCard | null>`
  - `createCard(input: CreateCardInput): Promise<CreateCardResult>`
  - `updateCard(cardId: string, input: UpdateCardInput): Promise<UpdateCardResult>`
  - `getProviderInfo(): Promise<ProviderInfo>`
- Optional methods:
  - `validateConfig(config?: TConfig): boolean` (default: true)
  - `init(): Promise<void>` (default: no-op)
- Type parameter: `TConfig extends ProviderConfig`
- Usage: Extend and implement abstract methods

### JiraProvider Implementation

- Location: `src/providers/jira.ts`
- Configuration sources (precedence):
  1. Explicit config properties
  2. Plugin options
  3. Environment variables
- Required configuration: `url`, `email`, `apiToken`, `projectKey`
- Optional configuration: `jql`, `maxResults` (1-100), `defaultIssueType` (default: `Epic`)
- Authentication: Basic auth using `email:apiToken` (base64)
- API: Jira REST API v3 with cursor-based pagination
- Status mapping:
  - Jira category To Do → `Backlog`
  - In Progress → `In Progress`
  - Done → `Done`
  - Fallback: `Backlog`
- ADF conversion:
  - ADF → text: recursive visitor (paragraphs, headings, lists, code blocks)
  - text → ADF: paragraph-per-line
  - Limitation: complex formatting not preserved (tables, media, mentions)
- Assignees:
  - Single assignee supported by Jira
  - First assignee used; extras ignored with a warning
  - IDs must be Jira `accountId`
- Status transitions:
  - Fetch transitions, match by target status, warn if not found
  - Workflow-specific transition IDs; not guaranteed direct transitions
- Error handling:
  - 401 auth failed; 400 invalid JQL/request; 404 not found (return null from `getCard`); network errors wrapped descriptively

### Configuration Precedence (Initialization)

- Location: `src/events/_start.ts`
- Order:
  1. Pre-instantiated provider in `pluginOptions.provider`
  2. Provider config object in `pluginOptions.provider`
  3. Environment variables (`JIRA_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_JQL`)
  4. `null` (inactive plugin)
- Behavior:
  - Graceful degradation when missing config (plugin loads but stays inactive)
  - `validateConfig()` before `init()`, throws if invalid
  - Provider stored globally; exposed via `getProvider()` and `isProviderReady()`

## Sync Engine

### `syncRoadmap(options: SyncOptions)`

- Location: `src/core/sync-engine.ts`
- Purpose: Orchestrate provider-to-Discord synchronization
- Options:
  - `guild: Guild`
  - `provider: RoadmapProvider`
  - `dryRun?: boolean = false`
- Workflow:
  1. Validate forum prerequisites
  2. Fetch provider cards and columns
  3. Group cards by column
  4. Update forum tags per column (merge + dedupe)
  5. Refresh forums to get latest tags and build tag maps
  6. For each card, decide op (create/update/archive/skip), map tags (≤5), format content (≤4096), execute and track stats
  7. Update last sync timestamp
  8. Return `SyncResult`
- Idempotent: existing threads updated without duplication
- Error recovery:
  - Per-card failures don’t abort the run
  - Deleted threads are recreated automatically
  - Rate limits logged with guidance
  - Missing permissions abort with clear message
- Stats: `total`, `created`, `updated`, `archived`, `errors`

### `syncCard()` details

- Operation selection:
  - create: no mapped thread and column not archived
  - update: mapped thread exists and column not archived
  - archive: mapped thread exists and column archived
  - skip: no thread and column archived
- Thread lifecycle:
  - Create: `forum.threads.create()` (name, starter message, tags)
  - Update: `thread.edit()` (name/tags) + `starterMessage.edit()` (content)
  - Archive: `thread.setArchived(true)`
- Tag mapping: case-insensitive, up to 5 applied thread tags
- Names and content limits: 100 chars for name; 4096 chars for message content with prioritized metadata
- Error handling:
  - 10008 (Unknown message/thread): recreate
  - 403 (Missing permissions): bubble up with clear message
  - 429 (Rate limit): warn

### `formatCardContent(card: RoadmapCard)`

- Structure:
  1. Description
  2. `---` separator
  3. Metadata: Assigned to, Labels, Last Updated
- Truncation strategy prioritizes metadata; description gets truncated first if over 4096 total
- Status/provider URL sections intentionally omitted

### Discord API limits

- 20 forum tags per forum (excess warned)
- 5 thread tags per thread
- 100-char thread names (truncate with `...`)
- 4096-char bot message content
- Rate limits vary by endpoint (typically 5–50 rps)

## Forum Management

### Category-based structure

- One category with multiple forums (one per column)
- Settings store `categoryId` and a map `forumChannels[columnName] = forumId`

### `createOrGetRoadmapCategory(options)`

- Location: `src/core/forum-manager.ts`
- Idempotent: checks existing category/forums first
- Options: `{ guild, columns }`
- Process:
  1. Read settings for existing IDs
  2. If all non-archived forums exist, return
  3. Build permission overwrites for category
  4. Create category if missing
  5. Create forums for non-archived columns
  6. Persist IDs to settings
- Default permissions (private mode):
  - `@everyone`: `ViewChannel: false`
  - Guild owner: `ViewChannel: true`
  - Bot: `ViewChannel`, `CreatePublicThreads`, `SendMessagesInThreads`, `ManageThreads`
  - Moderator/Admin roles: `ViewChannel`, `CreatePublicThreads`, `SendMessagesInThreads`
- Forum topics auto-generated from column name

### Permission modes: `toggleForumAccess(guild, mode)`

- Private mode (default): restrict `@everyone`
- Public mode: `@everyone` can view and comment in threads (no new thread creation)
- Implementation: set category permission overwrites, cascade to forums; persist `isPublic` flag

### Tag management: `updateForumTagsForColumn(guild, columnName, tagNames)`

- Merge with existing tags, case-insensitive dedupe, cap at 20
- Non-critical failures are warnings; don’t abort sync

### Helpers

- `getRoadmapCategory(guild)`
- `getForumChannelForColumn(guild, columnName)`
- `getAllForumChannels(guild)`

## Settings Persistence

- Storage: Flashcore via Robo.js State API
- Namespace: `@robojs/roadmap:{guildId}`
- Key: `settings` with `persist: true`

### `RoadmapSettings` (see `src/core/settings.ts`)

- `categoryId?: string`
- `forumChannels?: Record<string, string>`
- `isPublic?: boolean`
- `lastSyncTimestamp?: number`
- `syncedPosts?: Record<string, string>`
- `authorizedCreatorRoles?: string[]`

### CRUD utilities

- `getSettings(guildId)`
- `updateSettings(guildId, settings)`
- `getCategoryId(guildId)`
- `getForumChannelIdForColumn(guildId, columnName)`
- `getAllForumChannels(guildId)`
- `isForumPublic(guildId)`
- `getSyncedPostId(guildId, cardId)`
- `setSyncedPost(guildId, cardId, threadId)`
- `getAuthorizedCreatorRoles(guildId)`
- `setAuthorizedCreatorRoles(guildId, roleIds)`
- `canUserCreateCards(guildId, userRoleIds, isAdmin)`

- Authorization: admins always allowed; otherwise must have any authorized role. Empty roles means admins-only.

## REST API Layer

### Utilities (`src/api/roadmap/utils.ts`)

- Responses:
  - `ApiSuccessResponse<T>` → `{ success: true, data: T }`
  - `ApiErrorResponse` → `{ success: false, error: { code, message } }`
- Helpers: `success`, `error`, `getGuildFromRequest`, `validateMethod`, `wrapHandler`
- Error codes (mapped to HTTP):
  - `MISSING_GUILD_ID` (400)
  - `GUILD_NOT_FOUND` (404)
  - `METHOD_NOT_ALLOWED` (405)
  - `PROVIDER_NOT_READY` (503)
  - `FORUM_NOT_SETUP` (404)
  - `INVALID_REQUEST` (400)
  - `MISSING_PERMISSIONS` (403)
  - `PROVIDER_AUTH_FAILED` (401)
  - `NETWORK_ERROR` (503)
  - `SYNC_FAILED` (500)
  - `CARD_CREATION_FAILED` (500)
  - `CARD_NOT_FOUND` (404)
  - `CARD_UPDATE_FAILED` (500)
  - `INTERNAL_ERROR` (500)

### Endpoints

- Health & Provider
  - `GET /api/roadmap/health`
  - `GET /api/roadmap/provider/status`
  - `GET /api/roadmap/provider/info`
  - `GET /api/roadmap/provider/cards?limit=N`
  - `GET /api/roadmap/provider/columns`
- Forum
  - `GET /api/roadmap/forum/:guildId`
  - `POST /api/roadmap/forum/:guildId/setup`
  - `PUT /api/roadmap/forum/:guildId/access`
  - `PUT /api/roadmap/forum/:guildId/tags`
- Settings
  - `GET /api/roadmap/settings/:guildId`
  - `PUT /api/roadmap/settings/:guildId`
  - `GET /api/roadmap/settings/:guildId/posts`
- Sync
  - `POST /api/roadmap/sync/:guildId?dryRun=true`
  - `GET /api/roadmap/sync/:guildId/status`
- Cards
  - `POST /api/roadmap/cards/:guildId` (⚠️ no auth — secure before prod)
  - `GET /api/roadmap/cards/:guildId/:cardId`
  - `PUT /api/roadmap/cards/:guildId/:cardId`

### Security warning

- Card creation endpoint lacks auth by default; implement auth (Discord OAuth, API keys, JWT, mTLS) and then use `canUserCreateCards()` post-auth.

## Command Layer

### `/roadmap setup` (Admin only)

- Location: `src/commands/roadmap/setup.ts`
- Creates/gets forums and writes settings; builds a stateful setup message with toggle and role select.

### `/roadmap sync` (Admin only)

- Location: `src/commands/roadmap/sync.ts`
- Option: `dry-run`
- Triggers `syncRoadmap()` and returns stats; guards for missing provider/setup/permissions.

### `/roadmap add` (Admins or authorized roles)

- Location: `src/commands/roadmap/add.ts`
- Options: `title`, `description`, `column`, `labels`
- Creates a card via provider then runs a sync; validates column and authorization.

### `/roadmap edit` (Admins or authorized roles)

- Location: `src/commands/roadmap/edit.ts`
- Options: `card` (autocomplete), `title`, `description`, `column` (autocomplete), `labels`
- Updates provider card and adjusts Discord thread if synced; 60s per-guild cache for autocomplete.

## Interaction Handlers

### Button: Toggle Public Access

- Location: `src/events/interactionCreate/button-toggle-public.ts`
- Custom ID: `@robojs/roadmap:button-toggle-public`
- Admin-only; `deferUpdate()`, toggle mode, apply `toggleForumAccess()`, refresh setup message.

### Select: Authorized Creator Roles

- Location: `src/events/interactionCreate/select-authorized-creator-roles.ts`
- Custom ID: `@robojs/roadmap:select-authorized-creator-roles`
- Admin-only; `deferUpdate()`, persist selected roles, refresh setup message.

## Type System (see `src/types.ts`)

### `RoadmapCard`

- `id: string`
- `title: string`
- `description: string`
- `labels: string[]`
- `column: string`
- `assignees: Array<{ id: string; name: string; avatarUrl?: string }>`
- `url: string`
- `updatedAt: Date`
- `metadata?: Record<string, unknown>`

### `RoadmapColumn`

- `id: string`
- `name: string`
- `order: number`
- `archived: boolean`

### `ProviderInfo`

- `name: string`
- `version: string`
- `capabilities: readonly string[]`
- `metadata?: Record<string, unknown>`

### `ProviderConfig`

- `type: string`
- `options: Record<string, unknown>`

### Create/Update

- `CreateCardInput`, `CreateCardResult`
- `UpdateCardInput`, `UpdateCardResult`

### Sync

- `SyncResult` with `cards`, `columns`, `syncedAt`, `stats`

## Configuration

### Plugin Options (`RoadmapPluginOptions` in `src/events/_start.ts`)

- `provider?: ProviderConfig | RoadmapProvider`
- `autoSync?: boolean` (reserved)
- `syncInterval?: number` (reserved)
- Example:

```ts
export default {
	provider: {
		type: 'jira',
		options: {
			url: process.env.JIRA_URL,
			email: process.env.JIRA_EMAIL,
			apiToken: process.env.JIRA_API_TOKEN,
			jql: '(issuetype = Epic AND (labels NOT IN ("Private") OR labels IS EMPTY)) OR labels IN ("Public")'
		}
	}
}
```

### Environment Variables (Jira)

- `JIRA_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_JQL`
- Optional: `JIRA_MAX_RESULTS`, `JIRA_PROJECT_KEY`, `JIRA_DEFAULT_ISSUE_TYPE`

### Validation

- JiraProvider validates URL/email/required fields; logs structured errors; inactive but loaded if invalid.

## Critical Implementation Details

### JiraProvider quirks

- Single assignee only; use first `assignees[]` entry, warn on extras; IDs must be `accountId`.
- Status transitions require workflow-specific transition IDs; warn if none found.
- ADF conversion is basic; complex formatting is lost; consider storing original ADF in `metadata`.
- Config precedence: explicit > options > env; URL normalized; results clamped; defaults via constants.

### Discord integration patterns

- Thread lifecycle: `create`, `edit`, `setArchived(true/false)`; unknown-thread (10008) → recreate.
- Permissions: Category-level cascade; public mode allows viewing/commenting by `@everyone`.
- Tags: forum tags via `setAvailableTags()`, apply up to 5 per thread; case-insensitive dedupe.
- Rate limiting: 429 detection; recommend backoff in production.

## Error Handling

### Categories

- Provider: 401, 403, 404, 400, network
- Discord: 403, 404, 10008, 429
- Internal: invalid state/configuration

### Responses

- Commands: ephemeral strings with targeted guidance; detailed logs.
- API: `ApiErrorResponse` with code/message; map to HTTP; `Allow` header for 405.

### Logging

- Levels: `debug`, `info`, `warn`, `error`, `ready`
- Use forked plugin logger (e.g., `logger.fork('roadmap')`)
- Include context (guildId, cardId, op) and log full errors for debugging.

## Common Gotchas & Pitfalls

1. Archived columns skip thread creation; only archive existing threads. Move back to active column to create.
2. Deleted threads are recreated on sync (error 10008). Remove/move the card to avoid recreation.
3. Forum tags are only added/merged, not removed; cap 20. Manually prune in Discord UI.
4. Jira single assignee; extras ignored. Consider labels or custom fields for others.
5. Status transitions may fail silently if no path; card updated but status unchanged.
6. ADF conversion loses complex formatting; rely on provider link for full detail.
7. Card creation API lacks auth; must add before production.
8. Provider initialization is graceful; commands show not-configured until fixed.
9. Settings are per-guild; each guild requires setup.
10. Thread name truncation at 100 chars.
11. Content truncation preserves metadata over description.
12. Autocomplete cache TTL ~60s; recent changes may lag.

## Testing Patterns

- Framework: check package `package.json` for Jest/Vitest; unit test core functions and integration test sync flow.
- Mocking: discord.js Guild/Forum/Thread, provider methods, Flashcore state, fetch for Jira.
- Scenarios: sync idempotency/recovery/stats; forum modes/tags; settings CRUD; command auth/validation; Jira config/ADF/mapping.

## Integration Patterns for Custom Providers

1. Extend `RoadmapProvider` and implement abstract methods.
2. Define a `CustomProviderConfig extends ProviderConfig` with concrete `options`.
3. Implement: `fetchCards`, `getColumns`, `getCard`, `createCard`, `updateCard`, `getProviderInfo`.
4. Optionally implement `validateConfig()` and `init()`.
5. Support multi-source configuration with precedence and validation.
6. Provide clear, actionable errors and map to plugin types.
7. Register via plugin options (instance or config object).

Best practices:

- Ensure idempotency and pagination handling; respect rate limits; cache hot data; fork your logger; validate inputs; attach helpful error messages; use `metadata` for provider-specific fields.

Common patterns:

- Auth: store credentials in resolved config; build auth headers centrally; verify in `init()`; handle 401s
- Mapping: normalize names and statuses; build deep links; gracefully handle missing fields
- Partial updates: read current card, merge, send minimal patch; return finalized card

## Maintenance & Updates

When modifying core files, always reflect changes here:

- Providers (`src/providers/base.ts`, `src/providers/jira.ts`): update contracts, configs, quirks
- Sync engine (`src/core/sync-engine.ts`): update workflow, idempotency, recovery, stats
- Forum manager (`src/core/forum-manager.ts`): permissions, tags, helpers
- Settings (`src/core/settings.ts`): schema and CRUD changes; authorization patterns
- Commands (`src/commands/**`): options, flows, auth
- API (`src/api/**`): endpoints, error codes, security notes
- Types (`src/types.ts`): any new/changed interfaces
- Initialization (`src/events/_start.ts`): provider resolution and options

Update checklist for agents:

- Function changed? Update the relevant section
- Provider contract changed? Update Provider Architecture and all providers
- New gotcha? Add to Common Gotchas
- Sync logic changed? Update Sync Engine
- Forum logic changed? Update Forum Management
- API endpoints changed? Update REST API
- Commands changed? Update Command Layer
- Settings schema changed? Update Settings
- New types? Update Type System
- Config or error handling changed? Update respective sections
- Documentation or error handling patterns changed? Update Documentation and Error Handling Standards section
- New tests? Update Testing Patterns

## Quick Reference

Directory map:

```
packages/@robojs/roadmap/
├── src/
│   ├── index.ts                    # Public API exports
│   ├── types.ts                    # Core type definitions
│   ├── providers/
│   │   ├── base.ts                 # RoadmapProvider abstract class
│   │   └── jira.ts                 # JiraProvider implementation
│   ├── core/
│   │   ├── sync-engine.ts          # syncRoadmap(), syncCard(), formatCardContent()
│   │   ├── forum-manager.ts        # Forum creation, permissions, tags
│   │   ├── settings.ts             # Flashcore CRUD operations
│   │   └── constants.ts            # ID_NAMESPACE, Buttons, Selects
│   ├── commands/
│   │   └── roadmap/
│   │       ├── setup.ts            # /roadmap setup
│   │       ├── sync.ts             # /roadmap sync
│   │       ├── add.ts              # /roadmap add
│   │       └── edit.ts             # /roadmap edit
│   ├── events/
│   │   ├── _start.ts               # Plugin initialization
│   │   └── interactionCreate/
│   │       ├── button-toggle-public.ts
│   │       └── select-authorized-creator-roles.ts
│   └── api/
│       └── roadmap/
│           ├── utils.ts            # API utilities
│           ├── health.ts           # Health check
│           ├── provider/           # Provider endpoints
│           ├── forum/              # Forum endpoints
│           ├── settings/           # Settings endpoints
│           ├── sync/               # Sync endpoints
│           └── cards/              # Card endpoints
├── config/
│   └── robo.ts                     # Plugin config
├── package.json                    # Dependencies, scripts
└── README.md                       # User-facing docs
```

Key constants:

- `ID_NAMESPACE = '@robojs/roadmap:'`
- `DEFAULT_JQL`
- `DEFAULT_MAX_RESULTS = 100`
- Settings namespace pattern: `@robojs/roadmap:{guildId}`

Key helpers:

- Provider: `getProvider()`, `isProviderReady()`
- Sync: `syncRoadmap()`, `formatCardContent()`
- Forum: `createOrGetRoadmapCategory()`, `toggleForumAccess()`, `updateForumTagsForColumn()`
- Settings: `getSettings()`, `updateSettings()`, `getSyncedPostId()`, `setSyncedPost()`, `canUserCreateCards()`
- API utils: `success()`, `error()`, `getGuildFromRequest()`, `validateMethod()`, `wrapHandler()`

Types:

- `RoadmapCard`, `RoadmapColumn`, `ProviderInfo`, `ProviderConfig`
- `CreateCardInput`, `CreateCardResult`, `UpdateCardInput`, `UpdateCardResult`
- `SyncResult`, `RoadmapSettings`, `RoadmapPluginOptions`

Discord limits:

- Forum tags: 20; Thread tags: 5; Thread name: 100 chars; Message content: 4096 chars; Rate limits vary.

Error codes:

- `MISSING_GUILD_ID`, `GUILD_NOT_FOUND`, `METHOD_NOT_ALLOWED`, `PROVIDER_NOT_READY`, `FORUM_NOT_SETUP`, `INVALID_REQUEST`, `MISSING_PERMISSIONS`, `PROVIDER_AUTH_FAILED`, `NETWORK_ERROR`, `SYNC_FAILED`, `CARD_CREATION_FAILED`, `CARD_NOT_FOUND`, `CARD_UPDATE_FAILED`, `INTERNAL_ERROR`

---

Last Updated: 2025-10-17

Version: 1.0.0

Maintained By: AI coding agents and human contributors

Questions? See `README.md` for user docs, or explore the source files listed above.
