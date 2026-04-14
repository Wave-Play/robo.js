---
'robo.js': minor
---

refactor!: decouple Discord.js from core framework

Breaking: `client` is no longer exported from `robo.js` — use `getClient()` from `@robojs/discordjs` instead. `Robo.start()` now accepts a `Config` object instead of a Discord.js `Client`. Discord environment variables (`DISCORD_TOKEN`, `DISCORD_CLIENT_ID`) are no longer auto-loaded by the core `Env` module; the Discord.js plugin now owns the client lifecycle entirely. The `shard` option has been removed from start options. The `registerSlashCommands` and `createCommandConfig` exports have been removed from `robo.js` (use `@robojs/discordjs` equivalents).
