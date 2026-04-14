# @roboplay/plugin-maintenance

## 0.4.0-next.0

### Minor Changes

- refactor: migrate plugins from event-based initialization to lifecycle hooks

  All plugins migrated from `src/events/_start.ts` (Discord event-based) to `src/robo/start.ts` (Robo lifecycle hooks). This aligns with the v0.11 lifecycle system where plugins use `start`, `stop`, and other hooks instead of relying on Discord events for initialization. Affected: analytics, cron, i18n, patch, roadmap, xp, better-stack, gpt, maintenance, moderation, poll.

## 0.3.1

### Patch Changes

- f539436: chore: bump
- Updated dependencies [ce470a7]
- Updated dependencies [e610a59]
  - robo.js@0.10.3

## 0.3.0

### Minor Changes

- 0117893: refactor!: migrated to new `robo.js` package name
- 8999c7e: refactor!: new package name

### Patch Changes

- Updated dependencies [2b4fcbb]
- Updated dependencies [6d32a61]
- Updated dependencies [792658a]
  - robo.js@0.10.2

## 0.2.0

### Minor Changes

- 258bd87: refactor: replaced !maintenance command with slash command
- a98abc3: feat: ability to exclude interactions & events

## 0.1.0

### Minor Changes

- 24676fe: feat: new maintenance plugin
