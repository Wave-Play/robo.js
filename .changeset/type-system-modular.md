---
'robo.js': minor
---

refactor: modular type system

Reorganized type definitions into focused modules: `types/cli.ts` (CLI and terminal command types), `types/lifecycle.ts` (lifecycle hook types with priority), `types/manifest-v1.ts` (manifest v1 schema), `types/portal.ts` (portal API types), and `types/routes.ts` (route definition types). Removed `types/commands.ts` (merged into `@robojs/discordjs`). New exports include `createCliCommandConfig`, `createTerminalCommandConfig`, `registerEnvPattern`, `createPluginState`, hook priority helpers (`setHookPriority`, `prioritizeHookBefore`, `prioritizeHookAfter`), and `Manifest` class.
