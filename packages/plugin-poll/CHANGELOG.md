# @roboplay/plugin-poll

## 0.2.0-next.0

### Minor Changes

- refactor: migrate plugins from event-based initialization to lifecycle hooks

  All plugins migrated from `src/events/_start.ts` (Discord event-based) to `src/robo/start.ts` (Robo lifecycle hooks). This aligns with the v0.11 lifecycle system where plugins use `start`, `stop`, and other hooks instead of relying on Discord events for initialization. Affected: analytics, cron, i18n, patch, roadmap, xp, better-stack, gpt, maintenance, moderation, poll.

## 0.1.2

### Patch Changes

- 25d8cce: fix: only handle button interactions for poll-specific buttons
- e132324: chore: updated dev dependency to robo.js 0.6.0

## 0.1.1

### Patch Changes

- 8cd7430: patch: removed unnecessary permissions

## 0.1.0

### Minor Changes

- 2945e85: feat: new poll plugin!
