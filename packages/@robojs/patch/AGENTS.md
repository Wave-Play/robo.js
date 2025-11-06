# AGENTS - @robojs/patch (DEPRECATED)

> ⚠️ DEPRECATION NOTICE
>
> Status: DEPRECATED — No longer necessary for modern projects
>
> Effective Date: Robo.js 0.11.x and Discord SDK updates (late 2024)
>
> Reasons:
> 1. Discord fixed Content Security Policy and proxy behavior — no manual fetch/WebSocket patching required
> 2. Discord entry point commands stabilized and Robo.js now manages them automatically
> 3. @discord/embedded-app-sdk includes built-in proxy mapping
>
> Recommendation:
> - New projects: Do NOT install this plugin. Use modern Robo.js templates (they already handle these concerns)
> - Existing projects: Remove this plugin during your next major update
> - Legacy projects: You may keep it if you’re pinned to older Discord SDKs or facing specific CSP edge cases
>
> See Section 9 for migration guidance and safe removal steps.

---

## 1. Overview & Historical Context

Originally created in early 2024, `@robojs/patch` unblocked Discord Activities development by applying two targeted fixes:

- Discord Proxy Patch: worked around CSP/proxy issues by rewriting internal fetch/WebSocket URLs to include `/.proxy` when running inside Discord Activities
- Entry Point Command Patch: auto-registered the missing “Primary Entry Point” command (type 4) that Discord apps temporarily lost due to Developer Portal instability

These issues are now resolved by Discord and modern Robo.js, so this plugin is maintained only for legacy compatibility and historical reference.

- Package: `packages/@robojs/patch`
- Scope: ~300 LOC across two independent patch areas
- Logger: Uses `logger.fork('patch')` on server-side; client patch logs to `console`

## 2. Architecture Overview

Core components:
- `src/index.ts` — Main exports (DiscordProxy object)
- `src/discord-proxy/index.ts` — Orchestrates proxy patching (26 lines)
- `src/discord-proxy/patch/fetch.ts` — Patches global fetch (17 lines)
- `src/discord-proxy/patch/websocket.ts` — Proxies WebSocket constructor (16 lines)
- `src/discord-proxy/utils.ts` — URL patching helpers and Discord detection (46 lines)
- `src/discord-proxy/vite-plugin.ts` — Vite plugin for automatic script injection (81 lines)
- `src/discord-entry-point-command/patch.ts` — Ensures entry point command exists (80 lines)
- `src/events/_start.ts` — Calls entry point patch automatically when env is present (10 lines)
- `src/core/loggers.ts` — `patchLogger = logger.fork('patch')` (4 lines)

Data flow (high level):
- Discord Proxy
  1) Detect Activity context via `frame_id` query param
  2) Patch global fetch and WebSocket
  3) On request, `patchUrl()` decides whether to prepend `/.proxy`
- Entry Point Command
  1) On Robo start, if env present → fetch app commands
  2) If command type 4 missing → create it

Dependencies:
- Peer: `robo.js` ^0.10.28 (optional: true)
- Dev: `vite` ^5.2.0 (for plugin typings)

## 3. Discord Proxy Patch — Technical Details

Purpose: When running inside Discord Activities, prepend `/.proxy` to internal URLs so requests pass Discord’s proxy/CSP rules.

Key files and behaviors:

- `src/discord-proxy/index.ts`
  - `DiscordProxy = { patch, Vite: VitePlugin }`
  - `patch()` checks `isDiscordActivity()` and applies both `patchFetch()` and `patchWebSocket()` or no-ops
  - Client-side console logs indicate whether patch is applied or skipped

- `src/discord-proxy/patch/fetch.ts`
  - Stores original `globalThis.fetch`
  - Replaces with wrapper accepting `RoboRequestInit` (extends RequestInit with optional `prefix?: string`)
  - Extracts `prefix` (default `/.proxy`), calls `patchUrl(url, prefix)`, forwards to original fetch
  - Preserves return type Promise<Response>

- `src/discord-proxy/patch/websocket.ts`
  - Proxies `window.WebSocket` constructor via `new Proxy`
  - `construct` trap patches first arg URL via `patchUrl()` then calls original constructor
  - Assigns proxy back to global `WebSocket` (ESLint global-assign suppressed intentionally)

- `src/discord-proxy/utils.ts`
  - `ProxyHosts = ['discordsays.com', 'discordsez.com']`
  - `ProxyPrefix = '/.proxy'`
  - `isDiscordActivity()` returns true if `frame_id` exists in query params
  - `patchUrl(input, prefix = ProxyPrefix)` returns a URL or Request clone with pathname patched when:
    - host ends with any `ProxyHosts`
    - AND pathname doesn’t already start with any mapped prefix
    - AND pathname doesn’t already start with `prefix`
  - Reads SDK-provided mappings from `globalThis['@robojs/patch']?.mappings` (populated by the Vite plugin)
  - For Request inputs, clones while preserving: method, headers, body (or null if consumed), mode, credentials, cache, redirect, referrer, referrerPolicy, integrity, keepalive, signal, and duplex (when needed)

## 4. Vite Plugin Integration Method

File: `src/discord-proxy/vite-plugin.ts`

- Name: `discord-proxy-patch`, `enforce: 'pre'`
- `configResolved` stores command (serve/build)
- `transform` hook intercepts `@discord/embedded-app-sdk` module (node_modules or optimized dep):
  - Renames `patchUrlMappings` → `originalPatchUrlMappings`
  - Injects wrapper that initializes `globalThis['@robojs/patch'] = { mappings: [] }`, records prefixes into `mappings`, then calls original
- `transformIndexHtml` injects a synchronous script tag in `<head>` to run patch before Vite’s HMR client:
  - Dev: `node_modules/@robojs/patch/.robo/public/discord-proxy-patch.umd.js`
  - Prod: `assets/discord-proxy-patch.umd.js` (emitted asset)
- `buildStart` (prod only) loads/emit the UMD patch script into build output

Usage (from README):
```ts
import { DiscordProxy } from '@robojs/patch'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [DiscordProxy.Vite()]
})
```

Why this was recommended:
- Runs before HMR, ensuring earliest patching
- Tracks SDK mappings to avoid double-patching
- Works in both dev and production

## 5. Function Call Method (Non‑Vite)

File: `src/discord-proxy/index.ts`

```ts
import { DiscordProxy } from '@robojs/patch'
DiscordProxy.patch()
```

- Call at the very top of your app entry (before any SDK import)
- Suitable for webpack/rollup/esbuild or custom setups
- Limitations vs Vite plugin:
  - Might execute later than desired
  - Doesn’t track SDK `patchUrlMappings`
  - Must be included in every entry point that needs patching

## 6. Entry Point Command Auto‑Fix

File: `src/discord-entry-point-command/patch.ts`

- Export: `DiscordEntryPointCommand = { patch }`
- `patch()` flow:
  1) Read `DISCORD_CLIENT_ID` and `DISCORD_TOKEN` from environment
  2) GET existing commands via Discord API v10
  3) If a type 4 (PRIMARY_ENTRY_POINT) command exists → exit
  4) Else POST a new command with:
     - `name: 'launch'`
     - `description: 'Launch an activity'`
     - `contexts: [0, 1, 2]` (Guild, Bot DM, Private Channel)
     - `integration_types: [0, 1]` (Guild Install, User Install)
     - `type: 4` (PRIMARY_ENTRY_POINT)
     - `handler: 2` (Activity handler)

- Helper `request()` attaches `Authorization: Bot <token>` and JSON headers/body
- `_start.ts` runs this on Robo startup when both env vars exist; errors logged via `patchLogger.warn`

Required environment:
- `DISCORD_CLIENT_ID` (application id)
- `DISCORD_TOKEN` (bot token — NOT the OAuth client secret)

## 7. Why It’s Deprecated

- Discord fixed proxy/CSP behavior and the SDK handles URL mapping
- Entry point command instability in the Developer Portal was resolved
- Robo.js 0.11.x added built-in handling and deployment workflows that register commands automatically
- Manual runtime patching introduces global side-effects and is unnecessary in modern setups

## 8. Migration Guide — What To Do Instead

For new projects:
- Use the latest templates: `npx create-robo`
- Stay on Robo.js ≥ 0.11.x; update regularly: `npx robo upgrade`
- Use the latest `@discord/embedded-app-sdk`

For existing projects currently using `@robojs/patch`:

Assessment
1) Check Robo.js version — if < 0.11.x, consider upgrading first
2) Check Discord SDK version — if < 1.0.0, upgrade the SDK
3) Test without the patch inside Discord (not just the browser)

Removal steps
```bash
npm uninstall @robojs/patch
```
- Remove from Vite config:
  - Delete `import { DiscordProxy } from '@robojs/patch'`
  - Remove `DiscordProxy.Vite()` from the `plugins` array
- Remove direct calls:
  - Delete `DiscordProxy.patch()` imports and invocations in entry files
- Clean build and test thoroughly in Discord

Rollback (if needed)
```bash
npm install @robojs/patch
```
- Re-add plugin or function call
- Open an issue on Robo.js with versions and errors for community help

Alternatives if issues persist
- Update Robo.js and Discord SDK to latest
- Use Robo.js server/Vite proxy configuration as needed
- Keep the patch temporarily with a plan to remove on next major update

## 9. When It Might Still Be Useful

Legacy or special situations:
- Stuck on Robo.js < 0.11.x and cannot upgrade yet
- Pinned to an older `@discord/embedded-app-sdk` without proxy fixes
- Custom/experimental build systems where proxy handling fails
- Debugging CSP/proxy behavior by comparing patched vs unpatched flows

Edge cases:
- Custom Discord proxy domains (would require forking and editing `ProxyHosts`)
- Non-standard entry point command schemas (implement your own request code)
- Multi-app setups requiring custom command management

Not recommended for:
- New projects, production environments, or learning resources where modern practices apply

## 10. Hidden Gotchas & Edge Cases

1) Discord Activity Context Only — patches run only when `frame_id` query param exists; always test inside Discord
2) Proxy Host Detection — only `discordsays.com` and `discordsez.com` are considered
3) External URLs Not Patched — external APIs may still require your own proxy config
4) Vite Plugin Timing — must run before HMR; keep it first and `enforce: 'pre'`
5) SDK Mapping Tracking — relies on `patchUrlMappings`; SDK renames may break tracking
6) Entry Point Command Idempotent — concurrent starts may race; Discord handles gracefully
7) Bot Token Required — must use bot token, not OAuth client secret
8) Global Mutation — modifies global fetch/WebSocket; verify library compatibility
9) Request Cloning — body can be consumed once; code guards with `bodyUsed`
10) WebSocket Proxy — uses ES6 Proxy; requires modern browser (which Discord provides)
11) Console Logging (client) — review browser console for patch diagnostics
12) Env Timing — `_start.ts` reads env at startup only
13) Discord API Rate Limits — frequent restarts can hit limits; code minimizes calls
14) Vite Script Path — ensure `.robo/public/discord-proxy-patch.umd.js` exists
15) Mapped Prefix Exclusion — relies on SDK-provided prefixes to avoid double-patching
16) Custom Prefix Support — `RoboRequestInit['prefix']` is non-standard; import its type if needed
17) Production Asset Emission — verify `assets/discord-proxy-patch.umd.js` exists in build
18) Multiple Vite Configs — include plugin everywhere patching is required
19) Command Schema Drift — Discord API changes may require updates
20) Logger Fork — server-side uses `logger.fork('patch')`; set level=debug to see details

## 11. File Structure Reference

Source
- `src/index.ts` — Exports `DiscordProxy`
- `src/discord-proxy/index.ts` — Patch orchestrator
- `src/discord-proxy/patch/fetch.ts` — Fetch patch
- `src/discord-proxy/patch/websocket.ts` — WebSocket patch
- `src/discord-proxy/utils.ts` — Helpers and detection
- `src/discord-proxy/vite-plugin.ts` — Vite integration
- `src/discord-proxy/script.ts` — Standalone script for UMD bundle
- `src/discord-entry-point-command/patch.ts` — Entry point command logic
- `src/events/_start.ts` — Auto-run entry point patch on startup
- `src/core/loggers.ts` — `patchLogger`

Config / Build
- `config/robo.mjs` — Plugin config (type: 'plugin')
- `config/vite.ts` — Plugin dev Vite config
- `.robo/public/discord-proxy-patch.umd.js` — UMD shipped for injection

Docs / Meta
- `README.md`, `DEVELOPMENT.md`, `CHANGELOG.md`, `LICENSE`, `AGENTS.md` (this file)

## 12. Logging Standards

- Server-side uses a single forked logger:
  - `patchLogger = logger.fork('patch')` (see `src/core/loggers.ts`)
  - Levels used: `debug`, `warn`, `ready`
- Client-side (browser) uses `console.log` for early, synchronous diagnostics
- This conforms to the repo-wide guideline of one forked logger per plugin for server contexts

## 13. Type Exports

Public
- `DiscordProxy` — object with `patch()` and `Vite()`

Internals referenced in this doc
- `RoboRequestInit` — RequestInit with `prefix?: string`
- `ProxyPrefix` — `/.proxy`
- `ProxyHosts` — `['discordsays.com', 'discordsez.com']`
- `DiscordEntryPointCommand` — `{ patch() }`

## 14. Dependencies

Peer (optional)
- `robo.js` ^0.10.28 — optional: true (plugin can be used in non-Robo contexts)

Dev
- `vite` ^5.2.0 — for Vite plugin typings
- `@swc/core`, `@types/node`, `discord.js`, `prettier`, `typescript`, `robo.js` (workspace)

Runtime
- None (zero runtime deps)

## 15. CRITICAL: Self‑Update Reminder for AI Coding Agents

When modifying `@robojs/patch`, you MUST update this AGENTS.md to reflect changes:

Deprecation status
- Timeline adjustments, recommendation changes, or reactivation
- New Discord/Robo.js behavior that alters necessity

Core functionality
- Patch logic updates (fetch/WebSocket/URL mapping)
- Entry point command flow changes
- Vite plugin integration or script path changes

Integrations
- Build system updates, new plugin hooks, SDK compatibility notes

Configuration
- New environment variables or options
- Default value changes and precedence

Bug fixes & edge cases
- Host detection, request cloning, Proxy pitfalls, API changes

Why this matters
- AI agents rely on this to avoid recommending deprecated solutions
- Prevents regressions and confusion during migrations

How to update
1) Review impacted sections and update descriptions + examples
2) Cross-reference changed files with line numbers where helpful
3) Add/adjust gotchas and migration steps
4) Verify all examples build and run

Verification checklist
- [ ] Deprecation status and timeline are accurate
- [ ] Function signatures and returns updated
- [ ] Migration guide reflects current best practice
- [ ] Gotchas/edge cases are current
- [ ] Cross-references and links are valid
- [ ] Integration points (Vite/SDK) are correct
- [ ] Examples compile and match behavior
- [ ] “When still useful” section updated if applicable

---

Last Updated: 2025-10-27