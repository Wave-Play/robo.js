# @robojs/server – Agent Notes

> **Keep this living.** Any time request handling, engine selection, or public APIs change, come back and refresh these notes so future runs stay accurate.

## Mission & Scope
- Provides Robo projects with an HTTP layer: maps `/src/api` files into routes, serves static assets, and exposes hooks for custom web servers (`packages/plugin-api/src/events/_start.ts:91`).
- Ships with two engines (Node http + Fastify) and lets consumers inject their own by extending `BaseEngine` (`packages/plugin-api/src/engines/base.ts:9`).
- Designed to play nicely with other plugins (Vite dev server, custom websocket handlers, SPA fallbacks) without forcing a specific web framework.

## Lifecycle & Boot
- Entry point is `_start` event handler; captures plugin options, sets defaults (`prefix`→`/api`), and writes them to `globalThis.roboServer` for cross-plugin visibility (`packages/plugin-api/src/events/_start.ts:25`).
- Chooses Fastify when `fastify` is present in dependencies; otherwise instantiates the bundled Node engine (`packages/plugin-api/src/events/_start.ts:108`).
- Starts the selected engine, registers every API module from the portal index (converts `[param]` to `:param`), and optionally spins up a Vite middleware server during development (`packages/plugin-api/src/events/_start.ts:55`).
- Signals readiness by toggling `globalThis.roboServer.ready`; `Server.ready()` and `getServerEngine()` resolve once that flag is observed (`packages/plugin-api/src/core/plugin-utils.ts:6`).

## Public Surface (`src/index.ts`)
- Re-exports request/response wrappers, engine helpers, and the `Server` facade (`packages/plugin-api/src/index.ts:1`).
- `Server.config()` returns the resolved plugin options (including defaults/env overrides), `Server.get()` exposes the live engine, and `Server.ready()` awaits the readiness promise (`packages/plugin-api/src/core/server.ts:10`).
- `getServerEngine()` mirrors `Server.get()` for direct typed access, and `ready()` mirrors the facade’s readiness helper (`packages/plugin-api/src/core/plugin-utils.ts:17`).

## Request & Response Abstractions
- `RoboRequest` subclasses the Web Request API; reconstructs absolute URLs via `x-forwarded-proto`/`originalUrl`, buffers non-GET bodies into memory, and exposes `params`, `query`, and raw `IncomingMessage` (`packages/plugin-api/src/core/robo-request.ts:48`).
- `RoboResponse` wraps `Response`, adding a convenient `json()` constructor used by handlers and static fallbacks (`packages/plugin-api/src/core/robo-response.ts:4`).
- `createServerHandler` builds a fetch-like pipeline: applies params, handles CORS, streams `Response` bodies, merges `Set-Cookie`, and logs 4xx/5xx errors (`packages/plugin-api/src/core/handler.ts:23`). Exceptions thrown by handlers (including `RoboResponse`) bubble into the wrapper logic to produce proper HTTP replies (`packages/plugin-api/src/core/handler.ts:202`).

## Routing & Static Assets
- Lightweight radix router supports static paths, `:params`, `*` placeholders, and `**` catch-alls while caching static routes for fast lookup (`packages/plugin-api/src/core/radix3.ts:1`).
- Router-side query parsing splits comma-delimited values into arrays; duplicate keys overwrite, so complex filters may need manual parsing (`packages/plugin-api/src/core/router.ts:61`).
- Missing routes fall back to the `public/` or `.robo/public/` directory with MIME detection and directory traversal protection (`packages/plugin-api/src/core/handler.ts:232`).
- Additional fallback serves `index.html` for SPA front ends when the request looks like client-side routing (GET + HTML accept header + outside API prefix) (`packages/plugin-api/src/core/handler.ts:296`).

## Engines
- `NodeEngine` wires the radix router into a native `http.Server`, supports path-scoped websocket handlers plus a `default` catch-all, and rebuilds the request pipeline whenever Vite or custom 404 handlers are registered (`packages/plugin-api/src/engines/node.ts:20`).
- `FastifyEngine` mirrors the same contract using Fastify, strips default parsers to capture raw bodies for `RoboRequest`, and delegates to the shared static/404 helpers (`packages/plugin-api/src/engines/fastify.ts:19`). WebSocket registration currently logs a warning (not implemented) (`packages/plugin-api/src/engines/fastify.ts:174`).
- `BaseEngine` defines the required lifecycle: `init`, `start`, `stop`, `registerRoute`, `registerWebsocket`, `registerNotFound`, `setupVite`, `getHttpServer`, and `isRunning` (`packages/plugin-api/src/engines/base.ts:9`). Consumers can supply custom engines (e.g., Express, Hono) through plugin config.

## Configuration Surface
- Plugin options (via config file or `npx robo add`) accept: `hostname`, `port`, `prefix`, `engine`, `cors`, `vite`. Environment vars `ROBO_HOSTNAME` and `PORT` provide defaults when fields are omitted (`packages/plugin-api/src/events/_start.ts:45`).
- `prefix` supports `false`/`null` to disable automatic `/api` – the router will register bare paths (watch the SPA fallback which assumes a non-empty prefix for API detection) (`packages/plugin-api/src/core/handler.ts:338`).
- `cors: true` enables permissive `Access-Control-Allow-*` headers and handles OPTIONS short-circuiting (`packages/plugin-api/src/core/handler.ts:27`).

## Globals, Ready Flow & Tooling Hooks
- `globalThis.roboServer` stores `{ engine, ready }`; the ready flag is polled by `_readyPromise` with a 400 ms interval – keep that in mind when awaiting immediately after start (`packages/plugin-api/src/core/plugin-utils.ts:6`).
- Nanocore receives `localUrl` via `Nanocore.update('watch', { localUrl })` so CLI tooling can display the dev server location (`packages/plugin-api/src/events/_start.ts:103`).
- Vite integration: when dev dependencies include Vite and no server was injected, `_start` loads the project’s `config/vite.(ts|mjs)` and runs it in middleware mode, reusing the engine’s HTTP server. Engine automatically registers `/hmr` to guard the path for Vite (`packages/plugin-api/src/events/_start.ts:61`).

## Operational Notes & Gotchas
- Body buffering happens before handler execution; large uploads may require a custom engine that streams instead of buffering (`packages/plugin-api/src/core/robo-request.ts:60`).
- `RoboRequest.query` only returns the first value per key; use `URLSearchParams` directly when multi-value precision matters (`packages/plugin-api/src/core/robo-request.ts:38`).
- SPA fallback and public serving respect `NODE_ENV`; production reads from `.robo/public`, dev hits `public/`. Ensure build commands populate `.robo/public` for deployments (`packages/plugin-api/src/core/handler.ts:237`).
- Fastify engine lacks WebSocket support; rely on Node engine or custom engine if you need socket upgrades (`packages/plugin-api/src/engines/fastify.ts:174`).
- The ready promise relies on polling; expect up to one polling interval delay even after `engine.start` resolves (`packages/plugin-api/src/core/plugin-utils.ts:6`).

## Seed Content & Benchmarks
- Seed files provide an `/api/hello` handler and a minimal SPA shell to showcase routing + static serving (`packages/plugin-api/seed/api/hello.ts:1`).
- Benchmark harness under `__benchmarks__/` compares this plugin against Express/Fastify using k6 scenarios (`packages/plugin-api/__benchmarks__/README.md:1`). Useful for regression testing any engine-level tweaks.

## When You Change Things…
- Update this AGENTS file whenever you touch route loading, ready semantics, engine contracts, or request/response helpers so future iterations stay in sync.

