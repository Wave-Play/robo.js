---
name: robo-debug
description: Debug and diagnose Robo.js projects by querying logs, inspecting project structure, and identifying issues. Use when the user reports errors, wants to understand why something isn't working, asks to check logs, or wants to understand their project's current state.
---

# Robo Debug Skill

Follow this structured workflow to diagnose Robo.js project issues.

## Step 1: Inspect Project Topology

Run `robo inspect --json` to understand the project structure:

```bash
npx robo inspect --json
```

This returns structured data about:
- **project**: name, version, language, roboVersion, mode, buildTime
- **plugins**: installed plugins with their routes and hooks
- **routes**: commands, events, api, context, middleware
- **hooks**: lifecycle hooks (start, stop, restart, hmr)
- **config**: merged project configuration
- **env**: environment variable health (summary, missing, satisfied)

Check the `env` section first — missing environment variables are a common source of errors.

## Step 2: Check for Errors in Logs

Query recent errors:

```bash
npx robo logs --json --level error
```

This outputs NDJSON with fields: `timestamp`, `level`, `source`, `sessionId`, `pid`, `message`.

## Step 3: Filter by Plugin/Source

If the issue is plugin-specific, narrow down:

```bash
npx robo logs --json --source discordjs
npx robo logs --json --source api
npx robo logs --json --source ai
```

## Step 4: Search for Specific Patterns

Use `--grep` for keyword or regex search:

```bash
npx robo logs --json --grep "ECONNREFUSED"
npx robo logs --json --grep "Cannot find module"
npx robo logs --json --grep "token"
```

## Step 5: Filter by Time and Session

Use `--since` to see only recent logs:

```bash
npx robo logs --json --since 30m --level error
npx robo logs --json --since 1h --source discordjs
npx robo logs --json --since "2026-04-13T10:00:00Z"
```

List all available sessions:

```bash
npx robo logs --sessions
```

View a specific session (current, previous, or by index):

```bash
npx robo logs --json --session previous --level error
npx robo logs --json --session 2
```

## Step 6: Combine Filters

Filters can be combined for precise results:

```bash
npx robo logs --json --level warn --source discordjs --limit 20
npx robo logs --json --grep "timeout" --level error
npx robo logs --json --since 1h --level error --source api
```

## Step 7: Diagnose

Cross-reference errors with the project structure:
1. If a plugin appears in errors but not in `plugins` — it may not be installed correctly
2. If routes are missing — check that the source files exist and run `robo build`
3. If env variables are missing — the user needs to set them in `.env`
4. If there are no logs — the project may not have been started yet

## Command Reference

### `robo logs`

| Flag | Description |
|------|-------------|
| `--json`, `-j` | Output as NDJSON (one JSON object per line) |
| `--level`, `-l` | Filter by minimum level: trace, debug, info, warn, error |
| `--source`, `-p` | Filter by plugin/source name (case-insensitive substring) |
| `--grep`, `-g` | Filter by text or regex pattern in message |
| `--mode`, `-m` | Which mode logs to read (development, production) |
| `--limit`, `-n` | Maximum number of entries to output |
| `--tail`, `-t` | Watch for new log entries in real time |
| `--session`, `-s` | View a specific session: current, previous, or index number |
| `--sessions`, `-S` | List all available log sessions with timestamps and sizes |
| `--since`, `-T` | Show logs since a time: relative (1h, 30m, 2d) or ISO timestamp |

### `robo inspect`

| Flag | Description |
|------|-------------|
| `--json`, `-j` | Output as structured JSON |
| `--mode`, `-m` | Which mode manifest to inspect (development, production) |

### JSON Output Schemas

**`robo logs --json`** (NDJSON, one object per line):
```json
{"timestamp":"2026-04-13T10:15:32.000Z","level":"error","source":"discordjs","sessionId":"m1abc2de-f3g4","pid":12345,"message":"Failed to connect"}
```

Fields: `timestamp` (ISO 8601), `level`, `source` (omitted if null), `sessionId`, `pid`, `message`.

**`robo inspect --json`**:
```json
{
  "project": { "name": "...", "version": "...", "language": "...", "roboVersion": "...", "mode": "...", "buildTime": "..." },
  "plugins": [{ "name": "...", "version": "...", "namespace": "...", "routes": [...], "hooks": [...] }],
  "routes": { "commands": [...], "events": [...], "api": [...], "context": [...], "middleware": [...] },
  "hooks": ["start", "stop"],
  "config": { ... },
  "env": { "summary": { "total": 5, "set": 4, "empty": 0, "missing": 1 }, "missing": ["OPENAI_API_KEY"], "satisfied": ["DISCORD_TOKEN"] }
}
```
