# robo.js

## 0.8.1

### Patch Changes

- 24676fe: fix: attach plugin info to more manifest entries

## 0.8.0

### Minor Changes

- 6171ae6: feat: spirits
- 5647aa4: feat: new "flashcore" api for easy persistent storage - compatible with keyv adapters
- e537306: feat: 300x faster dev mode when using experimental flag
- 509f19e: feat: significantly faster builds with worker threads
- bdf4187: refactor: logger now writes to stdout/stderr directly, flush() function, and better formatting
- b7535f2: feat: api routes
- 85e6374: feat: experimental incremental builds
- 545ea90: feat: replaced ".tar" with new ".robopack" format
- 2fe42db: refactor: removed now-unnecessary dependencies (-%45 package size)

### Patch Changes

- 73609bb: patch: minor log changes to server ready message
- 9bf6abe: refactor(cli): replaced bloated .env loading with similar implementation
- a8adb81: chore: exit robo threads differently than process
- 6c264dd: feat(cli): experimental new file format for roboplay deployments
- fd4a343: fix: expanded special linux watcher logic onto all os types
- 18a7c6d: patch: minor fixes
- cc537be: fix: tell sage not to defer "/dev logs" command
- 61bdca0: refactor: logger now imports less modules
- f13e33f: feat: experimental flag toggles
- 06db4e6: patch(flashcore): improved support for keyv adapters
- 5e5949c: fix: spirit messages no longer override robo logger configuration
- 9bddd29: refactor: dev mode builds no longer show print summary in verbose mode
- 9baeed9: refactor(cli): handle parallel limits internally
- 4a89c6c: refactor: spirit ids are now passed down via workerdata
- 0171ef1: feat: spirit mode restart now on-par with process
- a49dde7: refactor: "/dev restart" now sends restart confirmation + timing
- c28bff6: refactor(cli): forked and improved "colorette" as "chalk" replacement
- 9a88db5: feat(state): new "persist" option for setting state
- d3d4983: fix: added missing fs import when deploying
- f51a531: refactor: avoid terminating workers unless necessary for graceful spirit shutdowns
- 64595bb: feat(state): forkable states for easy prefixing
- 1c9c04b: fix: race condition when saving state
- 789f412: patch: error handling for robo stop() and restart() functions
- 7ef2faa: refactor: waiting for state now handled as robo option rather than flag
- 54c10bf: refactor(cli): more descriptive spirit ids while still remaining predictable
- aaa6245: refactor(spirit): merged "command" and "event" fields; renamed "response" to "payload"
- d1cf55c: feat: export logger class
- ad43a9c: patch: watcher callback now passes full path instead of separate name + dir
- 6b125d6: refactor: include plugin path in handler debug logs
- fd1f0d2: fix: watcher rename events now handled better outside of linux
- 3692ffe: feat: restored ability to restart programatically in spirit mode
- 156f59e: fix: files build argument now optional
- 88a73d2: fix: graceful spirit worker thread shutdowns

## 0.7.1

### Patch Changes

- 2da1fba: refactor: removed "node-watch" dependency in favor of custom implementation
- e8d3ebc: patch: nested try catch around error event handling
- 5e7eb34: fix: safely access plugins reference (useful for shutdowns)

## 0.7.0

### Minor Changes

- 51d158c: feat: new experimental middleware
- 61ea387: feat(cli): native support for monorepos
- 9d13ec9: feat: support for context menu commands
- 0d8524e: feat: support for path alises with typescript
- a7f9e23: feat: ability to enable/disable modules at runtime
- 04e4b9b: feat: new "portal" api
- 8f4e86f: feat: support for recursive modules

### Patch Changes

- 8129a17: fix(cli): use correct source path when generating defaults
- 3eed386: fix: allow modules to completely override default commands
- 599baff: fix: compatibility with older manifest files when generating context
- 8c7605a: fix(sage): only auto defer if not already deferred
- 38b928a: fix(cli): correctly mark auto generated default events as "auto"
- a9d7408: feat(cli): attach module name to handler records inside manifest
- 830e545: fix(cli): never assume plugins are always defined in config
- 3b8cfd9: refactor(types): replaced handler variants with generic handler record
- 5d3c35a: fix(compiler): path aliases now take monorepos into account
- e3cd405: feat: new "/dev status" default subcommand
- 863ac30: feat(cli): watch ".env" and "tsconfig.json" files in dev mode
- fda6979: chore(compiler): clean up empty .swc directory after compiling
- e62dccc: fix(cli): register options for subcommands and subcommand groups

## 0.6.1

### Patch Changes

- 99dbe81: fix(cli): show subcommands and subcommand groups in build summary
- d37066b: patch(cli): verbose flag in "dev" command now prints more build logs
- 3571f59: fix: correctly mark auto subcommands as automatic
- 7d0b5ad: feat: new "/dev restart" subcommand
- bd4db92: refactor: "/dev" command has been renamed to "/dev logs" subcommand
- b590dec: feat: support for module subfolders

## 0.6.0

### Minor Changes

- 074f417: feat(cli): auto register subcommand and subcommand group changes
- afe2f5f: feat: support for subcommands and subcommand groups
- cc0277d: feat: continue watching for changes when build fails in development mode
- d252636: feat: show errors and warnings from build process in development mode

### Patch Changes

- 9b5923f: fix(cli): copy non-ts files for typescript builds
- 1bbe924: refactor(cli): simpler predicate function for less code repetition
- e379000: fix: return quickly when saving state for null process
- 72b65bf: patch: updated default /help to support new subcommands and subcommand groups
- 8fe87c3: patch: error reply embed field now shows correct subcommand and subcommand group keys
- 295e446: patch(cli): delegate child process exit events as a global with only o(1) event listeners
- caa3268: patch: register process event listeners only when starting the robo
- 2c53541: patch: better diffing when registering subcommand and subcommand group updates
- 1e3ce0d: chore(cli): bold environment variable names when registering commands
- 4c6a9e4: fix(cli): handle potentially null child process
- aff8a56: patch: better error messages for missing default exports in commands and events
- 5fb4a05: patch: removed ansi decorators from top level error messages in error replies
- 24c9447: refactor: parent process delegate responsibilities now handled in run() rather than dev command

## 0.5.3

### Patch Changes

- 8b77331: refactor(cli): revamped internal manifest generation code

## 0.5.2

### Patch Changes

- 8fd0f67: feat: accept custom client in robo start options
- 6ce14ec: feat(cli): include build type in manifest

## 0.5.1

### Patch Changes

- c80d247: fix: export primary robo object
- 5749b9d: feat: introducing states (experimental)
- 12284fa: refactor: wait for child process to be ready in development mode
- 5a89c11: feat: await state load before robo start

## 0.5.0

### Minor Changes

- 9698694: feat(cli): watched plugin builds now also trigger robo restarts
- 540ce7c: feat(cli): --watch flag for continuously building plugins
- 6069ddd: feat: manifest scopes/permissions & inherit from plugins
- 6233208: feat: new automatic "dev" command when running in development mode
- 4f59425: refactor: reduced package size by 28% by replacing chokidar with node-watch

### Patch Changes

- 07db24e: fix: complete command result type
- 2efb113: fix(cli): no longer crashes when trying to build an empty plugin directory
- 8af3e9d: fix: stringify objects when printing log messages
- 9d0635f: refactor(cli): stricter child process termination when restarting
- d0652d4: fix(cli): "build plugin" command now finds options correctly
- 5b32c3a: chore(cli): no longer show guild id in command updates log
- 86d01e0: feat: include error messages in debug logs
- 0b43b7b: feat: sage error replies for button interactions

## 0.4.2

### Patch Changes

- b0b3ec8: fix(cli): clean .build directory for pure js builds as well
- 2c63084: feat: keep a small log buffer in dev mode
- 953741b: feat: new "show logs" button in debug errors

## 0.4.1

### Patch Changes

- 080f67e: fix(cli): copy instead of compiling for normal js projects

## 0.4.0

### Minor Changes

- ee2b5a9: feat: automatic promise rejection handling
- ad5768f: feat: command return values are now optional

### Patch Changes

- 116ebab: feat(cli): new "why" command that explains your robo structure
- 51b608b: refactor: default commands now in /default directory with events support
- 647e99b: fix(cli): auto-generated commands and events are now properly marked as "auto"
- a6ed21a: fix(cli): "auto" marker for auto generated events
- 07bd8f0: refactor: renamed "stack trace" button to "show stack trace" in errors
- 7375d4f: refactor: more accurate "powered by" wording
- 16a0531: feat: stop() function now supports custom exit codes
- 099cf9a: fix(cli): generated defaults no longer override events and commands check for more file types
- 2f77aed: feat: export chalk and logger
- 3a20df8: feat: more flexible logger parameters
- 08afac9: chore: skip trigger logs for auto-generated events
- 9f56985: refactor(cli): use "info" instead of "event" for initial log
- 9bb58f7: refactor(cli): print "wait" instead of "info" for restarts

## 0.3.1

### Patch Changes

- 3a00456: fix: better nested error handling
- ee7429a: feat: show exact code at fault in error messages
- 66a09cd: refactor: less robo branding on error messages
- 78353da: refactor: error message moved outside embed
- 6090b4d: feat: compact error message with stack trace follow up
- 3a1f016: feat: manifest now contains version and updatedAt
- 43c1bea: chore: minor logging improvements
- 1feb074: feat: support for source maps in dev mode

## 0.3.0

### Minor Changes

- 9c47ed7: feat: new restart robo function
- 59b8ff6: refactor: commands now register after build
- 8cd2790: refactor: renamed robosocket to robo
- bae3b0e: feat(config): intents replaced with client options
- f8df8b9: feat(sage): smarter deferrals with buffer time
- fa6429f: feat: sage now provides better error data in development

### Patch Changes

- 4dc61a4: fix: error stack traces in logger
- a7fbe32: chore: ready message now includes datetime
- df74d3f: fix(dev): gracefully handle manual stops
- fca4243: chore(debug): cleaned up incorrect logger usage
- e097334: chore(debug): changed windows pnpm fix log level to debug

## 0.2.6

### Patch Changes

- 1e4ad58: chore: updated types to reflect new options

## 0.2.5

### Patch Changes

- f97d57b: feat: support for more option types

## 0.2.4

### Patch Changes

- fa7fbd3: fix: correctly pass all event parameters
- f0d8cd1: fix: recursive pnpm on windows

## 0.2.3

### Patch Changes

- e289560: fix: absolute imports on windows

## 0.2.2

### Patch Changes

- 050eaa5: fix: windows usage with pnpm
- 14be7e7: chore: upped build size warning thresholds

## 0.2.1

### Patch Changes

- 71109a4: fix(pkg): updated all robo.js package references

## 0.2.0

### Minor Changes

- 0a1b4eb: feat: failsafe mode for plugins

## 0.1.1

### Patch Changes

- 0ff716e: perf: improved node_modules lookup for pnpm

## 0.1.0

### Minor Changes

- 8576ac6: feat: re-released as scoped robo.js. [read more](https://blog.waveplay.com/introducing-robo-and-roboplay/)

## 0.1.0

### Minor Changes

- a29f790: feat: introducing robo.js! [read more](https://blog.waveplay.com/introducing-robo-and-roboplay/)
