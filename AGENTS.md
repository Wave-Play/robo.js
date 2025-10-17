# AGENTS

## What is Robo.js?

Robo.js powers Discord with activities, bots, web servers, and more. It emphasizes effortless integration, dynamic plugins, and advanced debugging built on top of Discord.js.

## Plugin Architecture

- Plugins extend Robo with commands, events, middleware, API routes, and other features while remaining optional.
- `npx robo add <name>` installs the plugin's npm package, seeds any starter files, and registers it in your config.
- Plugins can also be registered manually by placing `.mjs` or `.ts` files inside `config/plugins`.
- During `robo build`, plugin files are indexed for fast startup and plugins may inject build steps or generate code.
- At runtime, Robo loads plugin options from the config, executes lifecycle hooks, and routes commands, events, and middleware to plugin handlers.
- Plugin packages live in this repo under `packages/` and usually ship a README with usage instructions.

## Core Framework Files

- `packages/robo/src/core/config.ts` – Loads project configuration and scans `/config/plugins` for plugin configs.
- `packages/robo/src/core/robo.ts` – Runtime entry: starts/stops Robo, loads plugin options, and triggers lifecycle events.
- `packages/robo/src/core/handlers.ts` – Executes command, event, and middleware handlers while respecting plugin and module settings.
- `packages/robo/src/core/portal.ts` – Indexes commands/events and exposes helpers like `getPluginOptions` for plugin data.
- `packages/robo/src/core/logger.ts` – Provides structured logging with support for plugin-specific loggers.
- `packages/robo/src/core/flashcore.ts` – Manages persistent data via the Flashcore storage layer.
- `packages/robo/src/core/env.ts` – Loads environment variables for Robo and its plugins.
- `packages/robo/src/core/state.ts` – Handles state persistence across restarts.

## Plugin Packages

- `packages/@robojs/analytics` – Tracks usage through services like Google Analytics or Plausible and exposes an `Analytics` API.
- `packages/@robojs/auth` – Handles user authentication and authorization, including OAuth2 support.
- `packages/@robojs/cron` – Schedules tasks with cron expressions and supports persisted jobs.
- `packages/@robojs/i18n` – Internationalization support with locale management and translation utilities.
- `packages/@robojs/patch` – Collection of patches for Discord activities such as entry point commands and proxy fixes.
- `packages/@robojs/trpc` – Sets up a tRPC server and client; requires `@robojs/server`.
- `packages/plugin-ai-voice` – Extends the AI plugin with voice-channel conversations.
- `packages/plugin-ai` – AI chatbot with native voice support, vision capabilities, web search with citations, natural language command routing, token usage tracking with configurable limits, and extensible engine architecture. Uses OpenAI's Responses + Conversations APIs by default with support for custom providers. Includes vector store sync for knowledge injection, background task management, image generation, and optional seed commands.
- `packages/plugin-api` – File-based web server (`@robojs/server`) that maps `/src/api` to HTTP routes.
- `packages/plugin-better-stack` – Integrates Better Stack for heartbeat monitoring and log ingestion.
- `packages/plugin-confessions` – Enables anonymous, filtered confessions with commands like `/confess`.
- `packages/plugin-devtools` – Development utilities for inspecting state, flashcore, modules, and resources.
- `packages/plugin-gpt` – Legacy GPT integration (largely superseded by `@robojs/ai`).
- `packages/plugin-maintenance` – Provides maintenance-mode utilities and related commands.
- `packages/plugin-modtools` – Moderation suite with audit, ban, kick, warning commands, and moderation channel setup.
- `packages/plugin-poll` – Adds poll creation and management commands.
- `packages/plugin-sync` – Real-time state synchronization via `useSyncState`; pairs with `@robojs/server`.

## CLI Tools

### create-robo & create-discord-activity

- `packages/create-robo` scaffolds new Robo projects or plugins via `npx create-robo`, using templates in `packages/create-robo/templates`.
- `packages/create-discord-activity` is an alias that preselects the Discord Activity kit.

### Robo CLI

- `packages/robo/src/cli` implements the `npx robo` command with subcommands for:
  - `add`/`remove` – manage plugins.
  - `build`, `dev`, `start` – compile and run projects.
  - `invite` – generate Discord invite links.
  - `deploy`, `sync`, `upgrade`, `cloud`, `login`, `logout`, and more for project and hosting tasks.

## Documentation

- `docs/` – Docusaurus site with guides and API references. Source files live under `docs/src`.
