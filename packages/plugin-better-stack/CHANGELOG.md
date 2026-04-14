# @roboplay/plugin-better-stack

## 0.4.0-next.0

### Minor Changes

- refactor: migrate plugins from event-based initialization to lifecycle hooks

  All plugins migrated from `src/events/_start.ts` (Discord event-based) to `src/robo/start.ts` (Robo lifecycle hooks). This aligns with the v0.11 lifecycle system where plugins use `start`, `stop`, and other hooks instead of relying on Discord events for initialization. Affected: analytics, cron, i18n, patch, roadmap, xp, better-stack, gpt, maintenance, moderation, poll.

## 0.3.0

### Minor Changes

- b89b216: feat: support newer sources

### Patch Changes

- Updated dependencies [012151e]
- Updated dependencies [b2bb7bb]
- Updated dependencies [747f9ec]
- Updated dependencies [d71c670]
- Updated dependencies [158067c]
- Updated dependencies [8a50e0b]
- Updated dependencies [57fcca0]
- Updated dependencies [55ea1f3]
- Updated dependencies [52212bc]
- Updated dependencies [90b49e1]
- Updated dependencies [0c1f970]
- Updated dependencies [60ce5c4]
- Updated dependencies [82e3e34]
- Updated dependencies [6e5a01c]
  - robo.js@0.10.31

## 0.2.2

### Patch Changes

- a3f75b2: patch: clear heartbeat intervals on stop/restart

## 0.2.1

### Patch Changes

- f539436: chore: bump
- Updated dependencies [ce470a7]
- Updated dependencies [e610a59]
  - robo.js@0.10.3

## 0.2.0

### Minor Changes

- 77546e8: refactor!: migrated to new `robo.js` package name
- dd9e9b5: refactor!: new package name

### Patch Changes

- Updated dependencies [2b4fcbb]
- Updated dependencies [6d32a61]
- Updated dependencies [792658a]
  - robo.js@0.10.2

## 0.1.0

### Minor Changes

- a29b197: feat: better stack plugin
