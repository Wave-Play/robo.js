# @roboplay/plugin-api

## 0.3.0

### Minor Changes

- 7eb8520: feat: new .json reply function
- 7eb8520: refactor: include json as content-type header by default
- 6529bef: feat!: graceful throws

### Patch Changes

- 8b80bec: feat: config option to disable automatic body parsing

## 0.2.3

### Patch Changes

- 24c9552: chore: removed additional path aliases

## 0.2.2

### Patch Changes

- 3589724: patch: removed all path alias usage

## 0.2.1

### Patch Changes

- 347315f: patch: corrected relative imports in node engine

## 0.2.0

### Minor Changes

- 0bd7e7b: feat: use fastify as server engine when available
- 62f67a0: refactor: abstracted server functionality + ability to provide own engine
- 8dd40b5: feat: export engines via separate module
- 3a334af: feat: customizable `/api` prefix
- 644d2ea: refactor: updated base engine class signature

### Patch Changes

- 267d095: fix: pass down route parameters
- 4525a0c: fix: use correct substring when parsing url query
- 8d83af0: fix: dynamic route syntax [] -> :

## 0.1.0

### Minor Changes

- df72bf6: feat: plugin release
