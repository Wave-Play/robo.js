# robo.js

## 0.9.10

### Patch Changes

- 55f1a3f: fix(cli): added missing state loader for persisted data

## 0.9.9

### Patch Changes

- 289faee: chore: version bump

## 0.9.8

### Patch Changes

- 3d647c7: fix(cli): missing start import

## 0.9.7

### Patch Changes

- 0850950: fix(cli): ensure plugins directory always exist prior to adding
- 18913ee: fix: multi nesting support for plugins
- 76f6d92: feat(flashcore): support for key namespaces
- bf23d17: chore: updated package readme

## 0.9.6

### Patch Changes

- 867facc: refactor(cli): show success message for "add" and "remove" commands
- 2c4f2ab: feat: support for local plugin installs
- 9c172e6: refactor(logger): expose level fields and pass instance to log drains
- 951e9d7: feat: support for .json config files
- 07bf9ae: feat: support for custom log drains
- 1c4342d: feat: new experimental field to select custom build directory

## 0.9.5

### Patch Changes

- 8f505e8: fix(cli): account for nested routes without paths when building manifest

## 0.9.4

### Patch Changes

- ec93830: fix(cli): missing positional arguments options

## 0.9.3

### Patch Changes

- 935513b: chore(cli): added new command entries to help command
- 28a6d82: fix(build): always use native slashes when merging manifest plugins
- ba7fe09: fix(cli): never assume plugins array always exists
- 1c1c5d9: refactor(cli): runtime utils moved into own file
- cfa5b28: refactor(cli): don't run env checks on plugins
- 57ae042: feat: added help command
- 0b9953b: feat: new optional "type" config field

## 0.9.2

### Patch Changes

- 690cb5e: feat: new "robo remove" command for uninstalling plugins
- 203b3a3: patch(build): decode import path when generating manifest using bun
- 38a2668: patch: don't auto restart immediately after robo start failure in dev mode
- e21caad: feat(bun): optimized typescript compiler
- 05defa3: patch(bun): skip .env loading when using bun
- 5e4174f: fix(bun): skip pnpm-specific plugin package lookups when using bun
- 9ddc7fb: patch: rolled back native bun support for ts files
- f16f282: fix(flashcore): dont warn about enoent errors when deleting keys
- f6d0573: feat(cli): upgrade command
- 31e7003: feat: new "robo add" command for installing plugins

## 0.9.1

### Patch Changes

- 2583050: feat: bun support
- 0cc8e56: patch: no need to parse .env file in bun
- 9d9eb0a: feat: customizable update check interval
- 453eac8: feat: check for framework updates in dev mode

## 0.9.0

### Minor Changes

- 91dd336: feat(compiler): declaration generation now uses tsconfig.json as base & better defaults
- 2a599e6: feat: spirits system now enabled by default
- 8a51502: feat(compiler): new config option to exclude files from being processed
- e839778: feat: support for config files inside "config" directory
- f6168a0: feat(compiler): create declaration files for plugin builds
- 8d0558d: feat(flashcore): support for functional updates in "set" function
- 65d596a: feat(logger): can now fork logger instances
- 90de0b0: refactor(cli): parse arguments directly instead of using commander
- a57cc0b: feat: support for new plugin config files
- 680ea66: refactor: removed built-in api server functionality in favor of new plugin

### Patch Changes

- 16dd50b: feat: remember command registration errors as warnings until successful retry
- 0debaa6: patch: faster restarts after failed attempts
- f39a8a3: fix(cli): correctly parse adjacent cli options without positional values
- 608fc39: patch: more descriptive logs after failed restarts
- e6af082: chore: export types for state functions
- d2a97f2: patch(compiler): use logger levels typescript dianostic output
- f4c1e58: fix(cli): only apply spirit system in buildasync function for non-plugin builds
- 1d271cd: fix: continue checking modules when building manifest even if root is empty
- aab42e9: fix(spirit): listener functions now handle undefined values better
- 7f20457: fix(portal): delegate plugin and auto metadata to nested entries
- fb97b95: patch(compiler): improved debug messages & removed redundant check
- c758ebb: patch: print manifest summary rather than entire content after generating
- 2b95206: patch(cli): print specific command key that caused registration error
- 392a36f: fix: correctly merge events when reading plugins manifest

## 0.8.7

### Patch Changes

- 3688354: fix(spirits): handle missing id when running exec()
- 0fde55c: patch: removed unnecessary watcher warning when removing files
- 8ae6768: feat(flashcore): new .on() and .off() apis for watching key changes
- c3ecab1: patch: failed error messages no longer stop process
- f81d555: patch: issue a warning when removing value from saved state
- dfa31d1: fix: remove class instances when saving state
- e02fe0b: feat(flashcore): .delete() now triggers watcher callbacks as well
- 691f200: feat: new static state.listforks() function to get all forked state names
- a85325f: fix(flashcore): file adapter's .delete() api now uses safe key to delete correct value

## 0.8.6

### Patch Changes

- 47d898f: feat: exposed module keys via portal api

## 0.8.5

### Patch Changes

- 4f9ebaf: fix: exit early when running "exec" on terminated spirits
- a76cfe4: patch: automatically re-run bot after process exit in dev mode
- fbc3a91: feat: support for "max" and "min" option fields
- 37590d5: feat: support for "choices" option field

## 0.8.4

### Patch Changes

- 74c06c3: refactor(sage): prev/next buttons in logs now handled via events rather than collectors
- 8729d64: feat(sage): include channel and user info in redirected error messages
- cf45d9b: refactor(sage): error message interactions now handled via events rather than collector
- f68fffb: feat: convenience function for getting plugin options
- 2f61192: fix(sage): handle cases where interaction may already be used up prior to auto deferrals
- 3ce7a81: refactor: moved description entry field onto base entry interface
- fc1706f: fix: custom permission manifest parsing for bigints
- 3a7064b: feat(sage): error message channel redirects & custom messages
- 75cda40: fix: use correct path separator for debugging modules on windows

## 0.8.3

### Patch Changes

- 3fb5a01: refactor: accept string type for "level" in logger constructor
- 8bfff61: refactor: simplified logger file
- 49a99c3: patch(spirits): exit worker threads with process.exit()
- 5ede058: refactor(sage): use source event file path when available
- cc996c1: feat(cli): warn about permission changes in dev mode
- 5549238: feat: expose "composeColors" utility
- 059ef3c: feat: expose "color" utility
- 7a0852b: feat: permission config fields
- cdba883: fix: log background heartbeat errors as debug logs
- c2c893f: feat: custom levels when creating new logger instance
- a239224: fix: autocomplete option field now registers correctly again

## 0.8.2

### Patch Changes

- 68a1be5: feat(sage): show node_modules source in addition to project source
- 82122b6: patch: include middleware plugin path in debug logs
- 01e06bb: fix: check for empty embeds in sage error messages
- 365edb3: fix: handle multiple middleware entries better (fixes duplicates)
- 383a3b3: fix: account for file:// protocol when computing error source
- 649956e: fix(cli): handle missing plugins config option when adding watchers

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
