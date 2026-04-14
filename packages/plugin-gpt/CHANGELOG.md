# @roboplay/plugin-gpt

## 1.2.0-next.0

### Minor Changes

- refactor: migrate plugins from event-based initialization to lifecycle hooks

  All plugins migrated from `src/events/_start.ts` (Discord event-based) to `src/robo/start.ts` (Robo lifecycle hooks). This aligns with the v0.11 lifecycle system where plugins use `start`, `stop`, and other hooks instead of relying on Discord events for initialization. Affected: analytics, cron, i18n, patch, roadmap, xp, better-stack, gpt, maintenance, moderation, poll.

## 1.1.3

### Patch Changes

- e132324: chore: updated dev dependency to robo.js 0.6.0

## 1.1.2

### Patch Changes

- 3509913: chore: version bump

## 1.1.1

### Patch Changes

- a7176c9: chore: added missing license
- bae2b99: chore: added default setup documentation

## 1.1.0

### Minor Changes

- d541090: feat: option to quote query message

## 1.0.2

### Patch Changes

- 71109a4: fix(pkg): updated all robo.js package references

## 1.0.1

### Patch Changes

- aaab614: fix(pkg): updated package distribution config
