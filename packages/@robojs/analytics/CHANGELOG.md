# @robojs/analytics

## 0.2.0-next.0

### Minor Changes

- refactor: migrate plugins from event-based initialization to lifecycle hooks

  All plugins migrated from `src/events/_start.ts` (Discord event-based) to `src/robo/start.ts` (Robo lifecycle hooks). This aligns with the v0.11 lifecycle system where plugins use `start`, `stop`, and other hooks instead of relying on Discord events for initialization. Affected: analytics, cron, i18n, patch, roadmap, xp, better-stack, gpt, maintenance, moderation, poll.

## 0.1.1

### Patch Changes

- da547b7: fix: seed

## 0.1.0

### Minor Changes

- 2d9c597: feat: analytics package
