# @robojs/i18n

## 0.2.0-next.0

### Minor Changes

- refactor: migrate plugins from event-based initialization to lifecycle hooks

  All plugins migrated from `src/events/_start.ts` (Discord event-based) to `src/robo/start.ts` (Robo lifecycle hooks). This aligns with the v0.11 lifecycle system where plugins use `start`, `stop`, and other hooks instead of relying on Discord events for initialization. Affected: analytics, cron, i18n, patch, roadmap, xp, better-stack, gpt, maintenance, moderation, poll.

## 0.1.1

### Patch Changes

- 1b7f291: fix: guard createCommandConfig for missing descriptionKey and locales

## 0.1.0

### Minor Changes

- a19a042: feat: first release
