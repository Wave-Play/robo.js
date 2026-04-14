---
'@robojs/analytics': minor
'@robojs/cron': minor
'@robojs/i18n': minor
'@robojs/patch': minor
'@robojs/roadmap': minor
'@robojs/xp': minor
'@robojs/better-stack': minor
'@roboplay/plugin-gpt': minor
'@robojs/maintenance': minor
'@robojs/moderation': minor
'@roboplay/plugin-poll': minor
---

refactor: migrate plugins from event-based initialization to lifecycle hooks

All plugins migrated from `src/events/_start.ts` (Discord event-based) to `src/robo/start.ts` (Robo lifecycle hooks). This aligns with the v0.11 lifecycle system where plugins use `start`, `stop`, and other hooks instead of relying on Discord events for initialization. Affected: analytics, cron, i18n, patch, roadmap, xp, better-stack, gpt, maintenance, moderation, poll.
