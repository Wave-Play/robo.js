# @robojs/roadmap

## 0.2.0-next.0

### Minor Changes

- refactor: migrate plugins from event-based initialization to lifecycle hooks

  All plugins migrated from `src/events/_start.ts` (Discord event-based) to `src/robo/start.ts` (Robo lifecycle hooks). This aligns with the v0.11 lifecycle system where plugins use `start`, `stop`, and other hooks instead of relying on Discord events for initialization. Affected: analytics, cron, i18n, patch, roadmap, xp, better-stack, gpt, maintenance, moderation, poll.

## 0.1.0

### Minor Changes

- df08ce5: feat: first release

### Patch Changes

- Updated dependencies [6a97a61]
- Updated dependencies [528fd9f]
- Updated dependencies [ee2a767]
- Updated dependencies [6b57cfd]
- Updated dependencies [2c12d82]
- Updated dependencies [b6a37bd]
- Updated dependencies [51433db]
- Updated dependencies [bd6e7b2]
- Updated dependencies [ef0c000]
- Updated dependencies [495bb08]
- Updated dependencies [ec2589f]
  - robo.js@0.10.32
