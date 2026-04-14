---
'@robojs/discordjs': minor
---

feat: comprehensive public API, intent validation, and namespace controllers

New `index.ts` barrel export with full re-exports of Discord.js types, plugin types, utilities, and handler execution functions. Intent inference system (`inferIntents`, `checkIntents`, `validateIntents`) that auto-detects required intents from registered event handlers and warns about missing intents. Pre-instantiated namespace controllers (`commands`, `events`, `context`, `middleware`, `prefixCommands`) for programmatic access. Permission utilities (`hasRequiredPermissions`, `getMissingPermissions`, `getPermissionNames`). Config helpers (`createCommandConfig`, `createContextConfig`) moved here from core.
