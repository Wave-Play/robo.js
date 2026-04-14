# @robojs/discordjs

## 0.1.0-next.0

### Minor Changes

- feat: add prefix command and namespace controllers

  New createPrefixCommandController factory for per-handler enable/disable and server restriction methods. Namespace controllers updated to use Manifest.routeSummariesSync() for listing instead of direct portal access. Added createPrefixCommandsNamespaceController for programmatic prefix command management.

- feat: implement event topology system

  New centralized event topology manager that tracks Discord event listener registration state. Enables dynamic listener synchronization during HMR — listeners are added or removed as event handlers change without requiring a restart.

- fix: improve command and context handler safety

  Command handler now validates reply values with stricter Message-like object detection (requires both author and channelId), supports serverOnly metadata for guild-restricted commands, and throws Error objects instead of strings for missing exports. Context handler gracefully handles "Unknown interaction" and "already acknowledged" errors during defer, guards against undefined targets, and applies the same isValidReply improvements.

- refactor: update event handler, autocomplete, and middleware

  Event handler updated for manifest v1 portal API. Autocomplete handler now calls portal.ensureRoute() before execution. Middleware supports order metadata for sorting and uses manifest-based route loading.

- feat: extend HMR for events and prefix commands

  HMR system now supports events and prefixCommands routes. Event listener changes trigger topology sync. Prefix command changes invalidate the alias index and register the prefix handler if needed. Registration queue serialized to prevent overlapping Discord API calls from rapid saves.

- feat: refactor lifecycle, prepare, and intent checking

  Discord client startup refactored to register clientReady listener before login. Intent checking now inspects registered event handlers and prefix commands. Prepare hook updated for prefix command handler registration. Stop hook cleans up event topology state. New checkPrefixIntents utility validates MessageContent and GuildMessages intents for prefix commands.

- feat: update route definitions for manifest v1

  Route definitions for commands, context menus, events, and middleware updated to use manifest v1 schema with metadata extraction. Build completion step updated to emit route summaries compatible with the new manifest format.

- feat: bubble subcommand metadata to synthesized root commands

  When subcommands exist without an explicit root command file, metadata such as integrationTypes, contexts, defaultMemberPermissions, and dmPermission is now merged from leaf subcommands to the synthesized root command. Permissions are applied regardless of subcommand presence.

- feat: prefix commands, controllers, event topology, and terminal commands

  Major feature additions: text-based prefix commands (e.g., `!ping`) with full type system, configurable prefix (static or per-guild async function), case sensitivity, bot ignoring, and mention-as-prefix support. New controllers pattern for organizing command logic. Event topology system for ordering/priority. Terminal commands for interactive CLI. HMR command re-registration. Mock mode integration for testing. Removed deprecated `errorChannelId` and `errorMessage` from SageOptions.

- feat: comprehensive public API, intent validation, and namespace controllers

  New `index.ts` barrel export with full re-exports of Discord.js types, plugin types, utilities, and handler execution functions. Intent inference system (`inferIntents`, `checkIntents`, `validateIntents`) that auto-detects required intents from registered event handlers and warns about missing intents. Pre-instantiated namespace controllers (`commands`, `events`, `context`, `middleware`, `prefixCommands`) for programmatic access. Permission utilities (`hasRequiredPermissions`, `getMissingPermissions`, `getPermissionNames`). Config helpers (`createCommandConfig`, `createContextConfig`) moved here from core.

- feat: add terminal commands for Discord bot inspection

  New interactive terminal commands for inspecting Discord bot state during development. Includes `/discord` command group for viewing registered commands, events, and bot status.
