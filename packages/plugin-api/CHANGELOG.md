# @roboplay/plugin-api

## 0.6.5

### Patch Changes

- bf52fae: fix: reconstruct request URL using x-forwarded-proto and originalUrl
- 4ef73c6: patch: ignore query params when routing websocket handlers

## 0.6.4

### Patch Changes

- 03e5963: fix: support both `vite.mjs` and `vite.ts` in dev mode
- 010cb1e: chore: include `localUrl` in watch file

## 0.6.3

### Patch Changes

- ee409b8: chore: better documentation in seed file

## 0.6.2

### Patch Changes

- 34ef0e8: patch: prefixed hostname env with robo\_ to prevent clashes

## 0.6.1

### Patch Changes

- 7b8247d: patch: store instance globally

## 0.6.0

### Minor Changes

- c5dfaf0: feat: support for `BodyInit` as `.send()` param and returns
- bf5b0ce: refactor: use global state for ready signal
- a8b90e4: feat: new `Server` exported interface

## 0.5.7

### Patch Changes

- 8c8cbc8: patch: resolved npm missing seed

## 0.5.6

### Patch Changes

- d268c7d: refactor: default hostname to HOSTNAME environment variable

## 0.5.5

### Patch Changes

- 3ee7a85: feat: customizable hostname

## 0.5.4

### Patch Changes

- 3dfc67e: feat: seed boilerplate files

## 0.5.3

### Patch Changes

- 694a680: fix: copy custom headers correctly in node engine
- dfc4180: refactor: stream binary data into raw response

## 0.5.2

### Patch Changes

- 3db1f28: patch: fixed 404 params

## 0.5.1

### Patch Changes

- a1fbe72: patch: updated fastify engine to support new robo response
- 9821ac4: fix: robo request params

## 0.5.0

### Minor Changes

- 890b71d: refactor!: renamed `.req` and `.res` accessors to `.raw`
- eb3867a: refactor!: RoboResponse now extends Response instead of Error
- 890b71d: refactor!: RoboRequest now extends Request

## 0.4.5

### Patch Changes

- 0113987: feat: prevent vite hmr from being hijacked by default
- 0748de7: feat: `registerWebsocket` engine function

## 0.4.4

### Patch Changes

- 7490206: feat: `ready` utility function
- 2bf83fe: feat: `getServerEngine` utility function

## 0.4.3

### Patch Changes

- a73732e: refactor: use /hmr path for vite by default
- 5db2da4: patch: export correct paths in `engines.js` module

## 0.4.2

### Patch Changes

- a088ae9: patch: support for vite's hmr and websockets
- 5136afe: patch: fastify engine support for vite websockets

## 0.4.1

### Patch Changes

- 3d04d3a: refactor: use new `robo.js` package name

## 0.4.0

### Minor Changes

- 569c513: refactor: start server even when there's no routes
- 09111ac: feat: start vite server as middleware if installed
- 88d4ae2: feat: vite integration
- b0e818e: feat: support for loading public assets
- 4c25e59: refactor!: new package name
- d8657b4: refactor!: renamed RoboError to RoboResponse

### Patch Changes

- c7038d9: fix: parse body as empty when none was provided
- 8ee8ab8: chore: refined logs

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
