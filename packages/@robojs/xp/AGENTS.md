# AGENTS: @robojs/xp

This document equips AI coding agents working in this repository with everything needed to understand, extend, and safely modify the `@robojs/xp` plugin. It captures architectural intent, invariants, hidden gotchas, performance targets, and file-level references so agents can act with confidence without re‑deriving design from code.

Scope: Applies to the entire `packages/@robojs/xp` directory and any code that integrates with it (commands, API routes, tests, seeds). Follow the repo‑root AGENTS.md rules in addition to this file.

## 1. Overview & Purpose

- MEE6‑compatible XP/leveling system for Discord bots built on Robo.js.
- Capabilities: message‑based XP awards, level curve math, role rewards, multipliers, leaderboard with caching, REST API, slash commands, events for automation.
- Install: `npx robo add @robojs/xp`.
- Peer deps: `robo.js` (required). `@robojs/server` is optional for REST API endpoints.
- Package location: `packages/@robojs/xp`.

## 2. MEE6 Parity Features

- XP per message: random 15–25 base XP (scaled by `xpRate`).
- Cooldown: 60 seconds default (per‑user, configurable per guild).
- Level curve: `XP = 5 * level² + 50 * level + 100`.
- Role rewards: Stack mode (accumulate) or Replace mode (highest only).
- Multipliers: server × max(role) × user. Multiplicative, not additive.
- No‑XP zones: exclude roles and channels.
- Leaderboard: cached (top 100), paginated, rank lookup.
- Reference parity: MEE6 docs and public formula (see README notes).

## 3. Architecture Overview

Core modules and their responsibilities:

- `src/core/xp.ts` — XP manipulation primitives: add, remove, set, recalc; level math glue.
- `src/runtime/events.ts` — Typed EventEmitter singleton, xpChange/levelUp/levelDown.
- `src/runtime/rewards.ts` — Role rewards reconciliation with Discord.js safety checks.
- `src/runtime/service.ts` — Leaderboard cache (top 100, TTL, invalidation on events).
- `src/store/index.ts` — Flashcore persistence, members set, config caching, schema.
- `src/math/curve.ts` — Level curve and level/XP conversions.
- `src/math/multiplier.ts` — Server/role/user multiplier resolution.
- `src/config.ts` — Config API, defaults, validation, global vs guild, cache invalidation.
- `src/events/messageCreate/award.ts` — Automatic message award handler with cooldowns and no‑XP checks.

Data flow (message XP award):

```mermaid
sequenceDiagram
    participant User
    participant Discord
    participant Award as award.ts Handler
    participant Store as Flashcore Store
    participant Events as Event System
    participant Rewards as Role Reconciliation
    participant Cache as Leaderboard Cache

    Note over User,Cache: Message XP Award Flow
    User->>Discord: Send message
    Discord->>Award: messageCreate event
    Award->>Award: Validate bot/DM/channel type
    Award->>Store: getUser(guildId, userId)
    Store-->>Award: UserXP or null
    Award->>Award: Increment messages counter
    Award->>Store: getConfig(guildId)
    Store-->>Award: GuildConfig (cached)
    Award->>Award: Check No-XP channel
    Award->>Award: Check No-XP roles
    Award->>Award: Check cooldown

    alt XP Should Be Awarded
        Award->>Award: Roll 15–25, apply xpRate × multipliers
        Award->>Award: Compute new level via curve
        Award->>Award: Increment xpMessages
        Award->>Store: putUser(updatedUser)
    Award->>Events: emit levelUp/levelDown
    Award->>Events: then emit xpChange
        Events->>Rewards: reconcile roles
        Events->>Cache: invalidate leaderboard cache
    else No Award (no‑XP or cooldown)
        Award->>Store: putUser(messages only)
    end
```

Note: The diagram above reflects the `award.ts` pathway (`persist → levelUp/levelDown → xpChange`). The core XP API in `src/core/xp.ts` follows `persist → xpChange → levelUp/levelDown`. Design listeners to be order‑agnostic.

## 4. XP Manipulation API (`src/core/xp.ts`)

Exported primitives and expectations:

- `addXP(guildId, userId, amount, options?)`
  - Adds XP (amount ≥ 0). Emits `xpChange` then `levelUp` if level increases.
  - Returns `{ oldXp, newXp, oldLevel, newLevel, leveledUp }`.
  - Persists before emitting events.

- `removeXP(guildId, userId, amount, options?)`
  - Removes XP (clamped at 0). Emits `xpChange` then `levelDown` if level decreases.
  - Returns `{ oldXp, newXp, oldLevel, newLevel, leveledDown }`.

- `setXP(guildId, userId, totalXp, options?)`
  - Sets absolute XP (≥ 0). Emits `xpChange`, may emit levelUp/levelDown.
  - Returns `{ oldXp, newXp, oldLevel, newLevel }`.

- `recalcLevel(guildId, userId)`
  - Recomputes level from stored total XP and reconciles roles if changed.
  - Returns `{ oldLevel, newLevel, totalXp, reconciled }` and emits events on change.

- `getXP(guildId, userId)` → number; `getLevel(guildId, userId)` → number; `getUserData(guildId, userId)` → `UserXP | null`.

User data shape (`src/types.ts`):

```ts
interface UserXP {
  xp: number
  level: number
  lastAwardedAt: number
  messages: number
  xpMessages: number
}
```

Important: Two counters — `messages` increments for all valid guild messages; `xpMessages` increments only when XP is awarded.

## 5. Event System (`src/runtime/events.ts`)

- Singleton Node EventEmitter with typed map, `setMaxListeners(0)`.
- All events are emitted after Flashcore persistence completes.

### Emission Order by Pathway

- Core API (`src/core/xp.ts`): persist → `xpChange` → `levelUp`/`levelDown`.
- Award handler (`src/events/messageCreate/award.ts`): persist → `levelUp`/`levelDown` → `xpChange`.

Warning: Do not assume a universal ordering between level and XP events across all sources; design listeners to be order‑agnostic.

Event payloads:

```ts
interface LevelUpEvent { guildId: string; userId: string; oldLevel: number; newLevel: number; totalXp: number }
interface LevelDownEvent { guildId: string; userId: string; oldLevel: number; newLevel: number; totalXp: number }
interface XPChangeEvent { guildId: string; userId: string; oldXp: number; newXp: number; delta: number; reason?: string }
```

Built‑in listeners register at module load:

- `levelUp` → role rewards reconciliation.
- `levelDown` → optional reward removal, then reconciliation.
- All three events → leaderboard cache invalidation.

TODO: If we decide to unify ordering across pathways in the future, target a single contract (likely persist → `xpChange` → level events) and provide a migration guide for listener authors.

## 6. Configuration Management (`src/config.ts`, `src/store/index.ts`)

Hierarchy (highest precedence first):

1) Guild config in Flashcore → 2) Global defaults in Flashcore → 3) System defaults (MEE6 parity).

Guild config shape:

```ts
interface GuildConfig {
  cooldownSeconds: number
  xpRate: number
  noXpRoleIds: string[]
  noXpChannelIds: string[]
  roleRewards: { level: number; roleId: string }[]
  rewardsMode: 'stack' | 'replace'
  removeRewardOnXpLoss: boolean
  leaderboard: { public: boolean }
  multipliers?: { server?: number; role?: Record<string, number>; user?: Record<string, number> }
  theme?: { embedColor?: number; backgroundUrl?: string }
}
```

API:

- `getConfig(guildId)` → merged config with defaults, never null.
- `setConfig(guildId, partial)` → validates, merges, writes, returns merged config.
- `setGlobalConfig(config)` / `getGlobalConfig()` → manage global defaults; setting global clears all guild config caches.
- `getDefaultConfig()` → system defaults.
- `validateConfig(config)` → `{ valid, errors }` with strict rules (snowflakes, enums, positive numbers, dedupes, etc.).

Caching: In‑memory Map per guild. Invalidated on guild `setConfig` and globally cleared on `setGlobalConfig`.

## 7. Leaderboard Caching Strategy (`src/runtime/service.ts`)

Cache:

- Map<guildId, top100[]> plus timestamps and totals; TTL = 60s; stable ordering.

Interfaces and functions:

```ts
interface LeaderboardEntry { userId: string; xp: number; level: number; rank: number }
getLeaderboard(guildId, offset=0, limit=10) → { entries, total }
refreshLeaderboard(guildId) → void
getUserRank(guildId, userId) → { rank, total } | null
invalidateCache(guildId) → void
clearAllCaches() → void
```

Performance (targets): cached < 10ms; refresh 10k users ≤ 200ms; deep pagination O(n log n).

Gotcha: Requests with offset ≥ 100 bypass cache and scan/sort the full dataset.

## 8. Role Rewards System (`src/runtime/rewards.ts`)

Reward definition:

```ts
interface RoleReward { level: number; roleId: string }
```

Modes:

- Stack (default): add all rewards up to current level.
- Replace: keep only highest qualifying role; remove lower ones.

Core function: `reconcileRoleRewards(guildId, userId, newLevel, guildConfig)` — idempotent, permission/hierarchy safe, skips managed roles, dedupes duplicate roleIds by keeping the highest level.

Level down: if `removeRewardOnXpLoss` is true, removes roles above new level (stack) or re‑applies replace mode.

Safety checks: Manage Roles permission; bot highest role above target role; skip managed roles; handle missing roles gracefully with warnings.

## 9. Multipliers System (`src/math/multiplier.ts`)

Types:

1) Server multiplier (all users). 2) Role multipliers (take MAX among user roles). 3) User multiplier (per user).

Resolution: `effective = server × max(role) × user` (multiplicative). Rounds to 3 decimals to avoid FP artifacts.

Helpers: `getServerMultiplier`, `getMaxRoleMultiplier(roleIds)`, `getUserMultiplier(userId)`, `resolveMultiplier(config, roleIds, userId)`.

## 10. No‑XP Zones (`src/events/messageCreate/award.ts`)

- Channels: block award if `channelId ∈ noXpChannelIds`.
- Roles: block award if `any(userRoleId ∈ noXpRoleIds)`.
- Counters: always increment `messages`; only increment `xpMessages` when award succeeds.
- Cooldown: per user, not per channel, via `lastAwardedAt` in user record.

Check order: bot/DM/type → load user + increment messages → load config → no‑XP channel → no‑XP roles → cooldown → award.

## 11. Slash Commands Structure (`src/commands/*`)

User:

- `rank.ts` — show user rank, XP, level, progress.
- `leaderboard.ts` — paginated leaderboard.

Admin (`xp/*`):

- `xp/give.ts`, `xp/remove.ts`, `xp/set.ts`, `xp/recalc.ts`.

Config (`xp/config/*`):

- Get/set cooldown, xp rate, leaderboard visibility, manage no‑XP roles/channels.

Rewards (`xp/rewards/*`):

- List/add/remove rewards, set mode, toggle remove on loss.

Permissions: user commands open; admin commands require ManageGuild/Administrator.

## 12. REST API (`src/api/xp/*` — requires `@robojs/server`)

Base path: `/api/xp/`.

- Health: `GET /api/xp/health`.
- Users: `GET /api/xp/users/[guildId]`, `GET /api/xp/users/[guildId]/[userId]`, `POST /api/xp/users/[guildId]/[userId]/recalc`.
- Leaderboard: `GET /api/xp/leaderboard/[guildId]?offset&limit`, `GET /api/xp/leaderboard/[guildId]/[userId]`.
- Config: `GET/PUT /api/xp/config/[guildId]`; `GET/PUT /api/xp/config/global`.
- Multipliers: `GET/PUT /api/xp/config/[guildId]/multipliers`.
- Rewards: `GET/PUT /api/xp/config/[guildId]/rewards`.
- Stats: `GET /api/xp/stats/[guildId]`.

Conventions: JSON success payloads with metadata; consistent error `{ error, code? }` and proper HTTP statuses.

## 13. Flashcore Persistence & Data Model (`src/store/index.ts`)

Namespace: `xp`.

Keys:

- `user:{guildId}:{userId}` → `UserXP`.
- `members:{guildId}` → string[] of tracked userIds.
- `config:{guildId}` → `GuildConfig`.
- `config:global` → Global defaults.
- `schema:{guildId}` → numeric schema version (current: 1).

Functions:

- Users: `getUser`, `putUser`, `deleteUser`, `getAllUsers` (parallelized), members set helpers.
- Guild config: `getOrInitConfig`, `getConfig`, `putConfig`, `updateConfig`, `invalidateConfigCache`.
- Global config: `getGlobalConfig`, `setGlobalConfig`, `clearConfigCache`.
- Schema: `getSchemaVersion`, `setSchemaVersion`.

Merging and normalization helpers ensure complete configs with defaults and proper deep merges for multipliers.

## 14. Math Utilities & Level Calculations (`src/math/curve.ts`)

Curve: `XP = 5 * L² + 50 * L + 100`.

Exports:

- `xpNeededForLevel(level)` — XP required to advance one level.
- `totalXpForLevel(level)` — cumulative XP at the start of level.
- `computeLevelFromTotalXp(totalXp)` — `{ level, inLevel, toNext }`.
- `progressInLevel(totalXp)` — `{ current, needed, percentage }`.
- `isValidLevel(level)`, `isValidXp(xp)`, `xpDeltaForLevelRange(from, to)`.

Deterministic and idempotent: same total XP → same level. Level is derived; stored level acts as cache.

## 15. Performance Targets & Scalability (`PERFORMANCE.md`)

Targets:

- Message award < 50ms end‑to‑end.
- Leaderboard refresh (10k) ≤ 200ms; cached query < 10ms.
- Config read (cached) < 5ms. Role reconciliation < 100ms.

Complexity cheatsheet:

- Award flow O(r) with r = rewards; leaderboard refresh O(n log n); deep pagination O(n log n).

Recommended limits: users/guild < 50k (max 100k), rewards < 20 (max 100), multipliers < 100 (max 1k), concurrent awards < 1k/s (max 5k/s).

Cache tuning knobs: `MAX_CACHE_SIZE` (default 100), `CACHE_TTL` (default 60s).

## 16. Integration Patterns (recipes)

Common recipes:

- Level‑up announcements: listen to `levelUp`, send embed; see `seed/events/_start/level-announcements.ts`.
- Bonus XP awards: `XP.addXP(..., { reason: 'contest_winner' })`, check `leveledUp`.
- Moderation penalties: `XP.removeXP(..., { reason: 'moderation' })`, check `leveledDown`.
- Premium boosts: set `config.multipliers.user[userId]`.
- Analytics: observe `xpChange`, forward to analytics service.
- Custom rewards: observe `levelUp`, grant currency/items.
- Leaderboard commands: `leaderboard.get` and `leaderboard.getRank` for embeds.

Listener best practices: register in `src/events/_start/`; use async/await; never throw from listeners; prefer queues for heavy work; use `reason` for audit.

## 17. Hidden Gotchas & Edge Cases

1) Two counters: `messages` vs `xpMessages` — discrepancy expected (no‑XP/cooldown).

2) Cooldown per user (global across channels), tracked with `lastAwardedAt`.

3) Multipliers multiply; they never add. `server × max(role) × user`.

4) Role multiplier is MAX across user roles, not sum.

5) Rewards deduped by `roleId` — highest `level` wins.

6) Bot role hierarchy: bot top role must be higher than reward roles; Manage Roles permission required.

7) Managed roles skipped (integration‑managed).

8) Cache invalidated on every XP event — tune TTL if thrashing.

9) Deep pagination (offset ≥ 100) triggers full scan.

10) Global config updates clear all guild config caches.

11) Level calculation deterministic; `recalcLevel` is idempotent fixer.

12) Events emitted after persistence; listeners must tolerate failures gracefully.

13) Role ops are async and can rate limit; failures logged, not thrown.

14) No‑XP roles: ANY matching role blocks XP.

15) Formula application: `finalXP = base × xpRate × multiplier`.

16) Level down does not remove roles unless configured; replace mode always reconciles to one role.

17) Flashcore keys isolated under `xp` namespace.

18) Schema version stored for future migrations (current: 1).

19) `getAllUsers` fetches in parallel; be mindful of very large guilds.

20) Stable sort with secondary key userId to avoid rank flicker on ties.

## 18. File Structure Reference

Core exports and types:

- `src/index.ts` — top‑level exports (XP, config, leaderboard, events, math, rewards, constants).
- `src/types.ts` — type definitions.
- `src/config.ts` — config API and validation.

Core logic:

- `src/core/xp.ts`, `src/core/utils.ts`.

Runtime:

- `src/runtime/events.ts`, `src/runtime/rewards.ts`, `src/runtime/service.ts`.

Storage:

- `src/store/index.ts`.

Math:

- `src/math/curve.ts`, `src/math/multiplier.ts`.

Events:

- `src/events/messageCreate/award.ts`.

Commands:

- `src/commands/rank.ts`, `src/commands/leaderboard.ts`, `src/commands/xp/*`, `src/commands/xp/config/*`, `src/commands/xp/rewards/*`.

API:

- `src/api/xp/health.ts`, `src/api/xp/users/[guildId]/[userId].ts`, `src/api/xp/users/[guildId]/[userId]/recalc.ts`,
  `src/api/xp/leaderboard/[guildId].ts`, `src/api/xp/leaderboard/[guildId]/[userId].ts`,
  `src/api/xp/config/[guildId].ts`, `src/api/xp/config/global.ts`,
  `src/api/xp/config/[guildId]/multipliers.ts`, `src/api/xp/config/[guildId]/rewards.ts`,
  `src/api/xp/stats/[guildId].ts`, `src/api/xp/utils.ts`.

Seeds & tests:

- `seed/events/_start/level-announcements.ts`.
- `__tests__/*.test.ts` and helpers.

Docs:

- `README.md`, `PERFORMANCE.md`, `DEVELOPMENT.md`, and this `AGENTS.md`.

## 19. Logging Standards (required across Robo.js plugins)

Use exactly one forked logger named after the plugin.

- Preferred: centralize in `src/core/logger.ts`:

```ts
import { logger } from 'robo.js/logger.js'
export const xpLogger = logger.fork('xp')
```

- All other files must import and use `xpLogger` — do not create additional forks like `logger.fork('xp:service')` or per‑file forks.

Current state: root logger usage exists in places; migrate gradually to the shared `xpLogger` to meet standards.

Benefits: consistent namespacing, easy filtering, single place to adjust level.

## 20. CRITICAL: Self‑Update Reminder for AI Coding Agents

When modifying `@robojs/xp`, you MUST update this file to reflect changes.

Update triggers:

- Core: XP primitives (add/remove/set/recalc), event payloads or order, rewards reconciliation, leaderboard cache strategy, storage schema, curve math.
- Config: new fields, validation rules, defaults, multiplier shapes.
- API: new endpoints, request/response changes, slash commands or permissions.
- Performance: cache sizes/TTLs, complexity shifts, targets/benchmarks.
- Features: new listeners/hooks, integration patterns.
- Gotchas: new edge cases, behavior changes, workarounds.
- Docs: README/PERFORMANCE/DEVELOPMENT updates, new examples, changed types.

How to update:

1) Review the relevant section(s) here with your code changes in mind.
2) Update signatures, behavior notes, file references (e.g., mention function location).
3) Document new gotchas, edge cases, and any breaking changes.
4) Adjust performance notes and cache tuning guidance if applicable.
5) Keep the File Structure Reference accurate when files are added/removed.

Verification checklist:

- [ ] Signatures and return types updated
- [ ] New config options documented
- [ ] Gotchas/edge cases updated
- [ ] Performance characteristics current
- [ ] File references correct
- [ ] Integration recipes accurate
- [ ] Breaking changes and migrations noted

This is a living document. Keep it current so humans and AI agents can maintain high velocity without regressions.
