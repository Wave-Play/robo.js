# @robojs/trpc

## 0.4.0-next.1

### Patch Changes

- fix(trpc): make plugin HMR-aware so editing src/trpc/ files hot-reloads the tRPC router

  - Add route definition (`src/robo/routes/trpc.ts`) declaring `src/trpc/` as a handler directory
  - Add HMR hook (`src/robo/hmr.ts`) for post-reload logging and portal route loading
  - Call `portal.ensureRoute('trpc', 'trpc')` in start hook so the portal has handler records for HMR reloads

## 0.4.0-next.0

### Minor Changes

- feat: support for v0.11

### Patch Changes

- refactor: use Robo.status API for initialization reporting

## 0.3.0

### Minor Changes

- abe1b25: refactor: re-export all @trpc/react-query modules

### Patch Changes

- a2f59bf: chore: updated trpc to 11.4.3
- 263b4c5: chore: support for react 19
- 35b56cd: fix: resolving package on windows.
- Updated dependencies [012151e]
- Updated dependencies [b2bb7bb]
- Updated dependencies [747f9ec]
- Updated dependencies [d71c670]
- Updated dependencies [158067c]
- Updated dependencies [bf52fae]
- Updated dependencies [8a50e0b]
- Updated dependencies [57fcca0]
- Updated dependencies [4ef73c6]
- Updated dependencies [55ea1f3]
- Updated dependencies [52212bc]
- Updated dependencies [90b49e1]
- Updated dependencies [0c1f970]
- Updated dependencies [60ce5c4]
- Updated dependencies [82e3e34]
- Updated dependencies [6e5a01c]
  - robo.js@0.10.31
  - @robojs/server@0.6.5

## 0.2.3

### Patch Changes

- 44d6755: feat: include `req` and `res` in context by default
- Updated dependencies [32b172c]
- Updated dependencies [fe88aee]
  - robo.js@0.10.24
  - @robojs/server@0.6.2

## 0.2.2

### Patch Changes

- d2bf907: patch: better support for non-prefixed servers

## 0.2.1

### Patch Changes

- f31c26d: patch: decoupled client imports from server file

## 0.2.0

### Minor Changes

- 55a0b55: refactor: moved server-side exports to `/server` namespace

## 0.1.4

### Patch Changes

- 76f4ec5: patch: resolved npm missing seed

## 0.1.3

### Patch Changes

- c4f8886: patch: resolved npm missing seed

## 0.1.2

### Patch Changes

- 34bb4cc: patch: resolved npm missing seed

## 0.1.1

### Patch Changes

- 8c8cbc8: patch: resolved npm missing seed
- Updated dependencies [8c8cbc8]
  - @robojs/server@0.5.7

## 0.1.0

### Minor Changes

- b502ff8: feat: first release
