---
'@robojs/discordjs': minor
---

feat: prefix commands, controllers, event topology, and terminal commands

Major feature additions: text-based prefix commands (e.g., `!ping`) with full type system, configurable prefix (static or per-guild async function), case sensitivity, bot ignoring, and mention-as-prefix support. New controllers pattern for organizing command logic. Event topology system for ordering/priority. Terminal commands for interactive CLI. HMR command re-registration. Mock mode integration for testing. Removed deprecated `errorChannelId` and `errorMessage` from SageOptions.
