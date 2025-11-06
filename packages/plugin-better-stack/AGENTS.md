# AGENTS - @robojs/better-stack

## 1. Overview & Purpose

The `@robojs/better-stack` plugin integrates Better Stack's uptime monitoring and log ingestion services into Robo.js projects. It provides two core capabilities:

1. **Heartbeat Monitoring**: Periodic pings to Better Stack Uptime for service health monitoring
2. **Logtail Log Drain**: Forwards Robo.js logs to Better Stack's Logtail service with ANSI color fixes

**Installation**:
```bash
npx robo add @robojs/better-stack
```

**Prerequisites**:
- Better Stack account at https://betterstack.com
- Logtail source token (for log integration)
- Heartbeat URL (for uptime monitoring)

**Package Location**: `packages/plugin-better-stack`

**Use Cases**:
- Centralized logging for production Discord bots/activities
- Real-time log search and visualization
- Uptime monitoring with alerting
- Error tracking and analysis
- Performance monitoring via log patterns

## 2. Architecture Overview

### Core Components

**Source Files**:
- `src/core/drain.ts` - LogDrain implementation with ANSI fixes and Logtail integration (79 lines)
- `src/events/_start.ts` - Plugin lifecycle initialization (47 lines)
- `src/events/_stop.ts` - Cleanup heartbeat interval (8 lines)
- `src/events/_restart.ts` - Delegates to _stop.ts (3 lines)
- `src/index.ts` - Public exports (2 lines)
- `config/robo.mjs` - Plugin configuration

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Plugin Initialization (_start.ts)                            │
│    ├─ Read config from plugin config or environment variables   │
│    ├─ If sourceToken exists: create Logtail drain               │
│    ├─ Set drain on root logger via logger().setDrain()         │
│    ├─ If heartbeat.url exists: set up interval to ping URL     │
│    └─ Suppress Fetch API experimental warning                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. Logging Flow (drain.ts)                                      │
│    ├─ User calls logger.info('message')                        │
│    ├─ Drain receives (logger, 'info', 'message')               │
│    ├─ Parse data with inspect() for objects/errors/arrays      │
│    ├─ Apply ANSI fixes (magenta→blue, bold, resets)            │
│    ├─ Write to console (if logger level allows)                │
│    ├─ Forward to Logtail based on level mapping                │
│    └─ Return Promise.all([console, logtail])                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. Heartbeat Monitoring (_start.ts)                             │
│    ├─ setInterval fires every interval ms (default 5000)       │
│    ├─ Log debug message if debug enabled                       │
│    ├─ fetch(heartbeat.url)                                     │
│    └─ Catch and log errors, continue on failure                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. Cleanup (_stop.ts, _restart.ts)                              │
│    ├─ Clear heartbeat interval                                 │
│    └─ Prevent memory leaks                                     │
└─────────────────────────────────────────────────────────────────┘
```

### Dependencies

**Runtime Dependencies** (`package.json` lines 32-34):
- `@logtail/node` ^0.5.5 - Logtail SDK for log ingestion

**Peer Dependencies** (`package.json` lines 42-49):
- `robo.js` ^0.10.28 - Required (not optional)

## 3. Better Stack Account Setup Prerequisites

### Account Creation

1. Sign up at https://betterstack.com
2. Free tier available for small projects
3. Paid tiers for higher log volume and retention

### Logtail Source Setup (for log integration)

**Steps**:
1. Navigate to **Logtail** section in Better Stack dashboard
2. Click **Create Source**
3. Select **Node.js** or **Generic** source type
4. Copy the **source token** (long alphanumeric string)
5. Note the **ingesting host** (e.g., `in.logtail.com` for US, `in-eu.logtail.com` for EU)
6. Store token securely (treat as sensitive credential)

**Security**:
- Source token is a secret credential
- Never commit to version control
- Use environment variables in production
- Rotate tokens periodically

### Heartbeat Monitor Setup (for uptime monitoring)

**Steps**:
1. Navigate to **Uptime** section in Better Stack dashboard
2. Click **Create Monitor**
3. Select **Heartbeat** monitor type
4. Name it after your Robo (e.g., "MyBot Heartbeat")
5. Set **Expected Interval** (e.g., 10 seconds - should match your config)
6. Copy the **Heartbeat URL** (e.g., `https://uptime.betterstack.com/api/v1/heartbeat/...`)
7. Configure **Alert Channels** (email, Slack, Discord, etc.)

**Monitor Behavior**:
- Better Stack expects heartbeat within interval
- If no heartbeat received: monitor marked as down
- Alerts sent via configured channels
- Dashboard shows uptime percentage and history

### Regional Considerations

**US Region** (default):
- Ingesting host: `in.logtail.com`
- No configuration needed (default)

**EU Region** (GDPR compliance):
- Ingesting host: `in-eu.logtail.com`
- Set via `ingestingHost` config or `BETTER_STACK_INGESTING_HOST` env var

**Self-Hosted**:
- Custom ingesting host domain
- Set via `ingestingHost` config

## 4. Three Configuration Methods

### Method 1: Plugin Config File (Recommended for most projects)

**File**: `/config/plugins/roboplay/plugin-better-stack.mjs`

**Full Configuration**:
```javascript
export default {
  // Log integration
  sourceToken: 'YOUR_UNIQUE_SOURCE_TOKEN',
  ingestingHost: 'in.logtail.com',  // Optional, defaults to Logtail's default
  
  // Heartbeat monitoring
  heartbeat: {
    url: 'https://uptime.betterstack.com/api/v1/heartbeat/...',
    interval: 5000,  // Optional, defaults to 5000ms (5 seconds)
    debug: false     // Optional, defaults to false
  }
}
```

**Pros**:
- Centralized configuration
- Easy to version control (if tokens not sensitive)
- Clear structure
- Supports heartbeat monitoring

**Cons**:
- Tokens visible in config file
- Requires plugin config file creation

**When to Use**:
- Simple projects
- Non-sensitive tokens
- Heartbeat monitoring needed
- Team prefers centralized config

### Method 2: Environment Variables (Recommended for production)

**File**: `.env`

**Variables**:
```env
BETTER_STACK_SOURCE_TOKEN="YOUR_UNIQUE_SOURCE_TOKEN"
BETTER_STACK_INGESTING_HOST="in-eu.logtail.com"
```

**Plugin Config** (still required for heartbeat):
```javascript
export default {
  heartbeat: {
    url: 'https://uptime.betterstack.com/api/v1/heartbeat/...'
  }
}
```

**Configuration Precedence** (`src/events/_start.ts` lines 18-19):
- Plugin config overrides environment variables
- `config.sourceToken ?? process.env.BETTER_STACK_SOURCE_TOKEN`
- `config.ingestingHost ?? process.env.BETTER_STACK_INGESTING_HOST`

**Pros**:
- Tokens not in version control
- Standard practice for sensitive credentials
- Easy to change per environment
- Secure

**Cons**:
- Heartbeat still needs plugin config
- Two configuration locations

**When to Use**:
- Production deployments
- Sensitive tokens
- Standard security practices
- Multiple environments

### Method 3: Direct Drain Creation (Recommended for early log capture)

**File**: `config/robo.mjs`

**Implementation**:
```javascript
// @ts-check
import { createLogtailDrain } from '@robojs/better-stack'

/**
 * @type {import('robo.js').Config}
 **/
export default {
  // ... other configurations
  logger: {
    drain: createLogtailDrain(process.env.BETTER_STACK_SOURCE_TOKEN, {
      endpoint: process.env.BETTER_STACK_INGESTING_HOST 
        ? `https://${process.env.BETTER_STACK_INGESTING_HOST}` 
        : undefined
    })
  }
}
```

**Pros**:
- Captures logs earlier in Robo lifecycle
- Logs during plugin initialization captured
- Direct control over drain configuration
- Single configuration location for log integration

**Cons**:
- No heartbeat monitoring (must use plugin config for that)
- Requires manual endpoint URL construction
- More complex setup
- Requires import in robo.mjs

**When to Use**:
- Need to capture early logs (e.g., plugin initialization errors)
- Advanced use cases requiring custom drain configuration
- Don't need heartbeat monitoring
- Want single configuration location

### Combining Methods

**Scenario**: Need both early log capture AND heartbeat monitoring

**Solution**:
1. Use direct drain in `robo.mjs` for log integration
2. Use plugin config for heartbeat only (omit sourceToken)

**Example robo.mjs**:
```javascript
import { createLogtailDrain } from '@robojs/better-stack'

export default {
  logger: {
    drain: createLogtailDrain(process.env.BETTER_STACK_SOURCE_TOKEN, {
      endpoint: process.env.BETTER_STACK_INGESTING_HOST 
        ? `https://${process.env.BETTER_STACK_INGESTING_HOST}` 
        : undefined
    })
  }
}
```

**Example plugin config**:
```javascript
export default {
  heartbeat: {
    url: 'https://uptime.betterstack.com/api/v1/heartbeat/...'
  }
}
```

**⚠️ GOTCHA**: If both methods set sourceToken, drain is set twice (last wins, which is plugin config)

### Configuration Method Comparison

| Feature | Plugin Config | Environment Variables | Direct Drain |
|---------|--------------|----------------------|--------------|
| Log Integration | ✅ | ✅ | ✅ |
| Heartbeat Monitoring | ✅ | ✅ | ❌ |
| Early Log Capture | ❌ | ❌ | ✅ |
| Secure Tokens | ❌ | ✅ | ✅ (with env vars) |
| Setup Complexity | Low | Medium | High |
| Configuration Locations | 1 | 2 | 1 or 2 |

## 5. createLogtailDrain Function

### Function Signature

**Location**: `src/core/drain.ts` lines 9-64

```typescript
function createLogtailDrain(
  sourceToken: string, 
  options?: ConstructorParameters<typeof Logtail>[1]
): LogDrain
```

**Parameters**:
- `sourceToken: string` - **Required**. Logtail source token from Better Stack dashboard
- `options?: object` - **Optional**. Logtail constructor options
  - `endpoint?: string` - Custom ingesting host URL (e.g., `https://in-eu.logtail.com`)
  - Other options: See @logtail/node documentation

**Returns**:
- `LogDrain` - Function with signature `(logger: Logger, level: string, ...data: unknown[]) => Promise<void>`

### LogDrain Behavior

**Flow** (lines 9-64):
1. Parse data into string via `inspect` for objects/errors/arrays (lines 14-19)
2. Apply ANSI fixes via `fixAnsi` function (line 20)
3. Write to console (stdout for info/debug, stderr for warn/error) if logger level allows (lines 23-30)
4. Forward to Better Stack based on log level (lines 33-58)
5. Return Promise that resolves when both operations complete (lines 60-62)

### Data Parsing

**Implementation** (lines 14-19):
```typescript
const message = data
  .map((item) => {
    if (typeof item === 'object' || item instanceof Error || Array.isArray(item)) {
      return inspect(item, { colors: true, depth: null })
    }
    return item
  })
  .join(' ')
```

**Behavior**:
- **Objects**: `inspect(item, { colors: true, depth: null })`
- **Errors**: `inspect(item, { colors: true, depth: null })`
- **Arrays**: `inspect(item, { colors: true, depth: null })`
- **Other types**: Used as-is
- **Joined with spaces**: All items concatenated

**⚠️ GOTCHA**: `depth: null` means infinite depth - large objects may produce very long log messages

### Console Write Logic

**Implementation** (lines 23-30):
```typescript
const consoleWrite = new Promise<void>((resolve) => {
  const stream = level === 'warn' || level === 'error' ? process.stderr : process.stdout
  const levelValues: Record<string, number> = { trace: 0, debug: 1, info: 2, warn: 3, error: 4 }
  
  if (levelValues[logger.getLevel()] <= levelValues[level]) {
    stream.write(message + '\n')
  }
  resolve()
})
```

**Stream Selection**:
- **stderr**: warn, error
- **stdout**: trace, debug, info, wait, event

**Level Check**:
- Respects `logger.getLevel()` setting
- Example: If `logger.setLevel('warn')`, debug/info not written to console
- Uses level value comparison: `levelValues[logger.getLevel()] <= levelValues[level]`

**⚠️ GOTCHA**: Logtail still receives all logs regardless of logger level (line 33-58)

### Promise Handling

**Implementation** (lines 60-62):
```typescript
return Promise.all([consoleWrite, logtailSend]).then(() => {
  // noop
})
```

**Behavior**:
- Both console write and Logtail send must complete
- Returns void Promise (no value)
- **⚠️ GOTCHA**: Slow Logtail requests block logging - log calls may take longer than expected

## 6. ANSI Color Code Handling & Fixes

### Problem

Logtail doesn't support all ANSI color codes:
- Magenta color not supported
- Bold reset code not recognized
- Color codes without reset sequences cause issues

### fixAnsi Function

**Location**: `src/core/drain.ts` lines 66-78

**ANSI Regex Patterns** (lines 5-7):
```typescript
const ANSI_REGEX = /(\x1b\[[0-9;]+m)([^\x1b]*)/g
const MAGENTA_REGEX = /\x1b\[35m/g
const RESET_SEQUENCE = '\x1b[0m'
```

**Pattern Explanations**:
- `ANSI_REGEX`: Matches color code + text: `(ESC[...m)(text)`
- `MAGENTA_REGEX`: Matches magenta color code: `ESC[35m`
- `RESET_SEQUENCE`: Full reset code: `ESC[0m`

### Three Fixes

**Fix 1: Magenta to Blue** (line 70):
```typescript
message = message.replaceAll(MAGENTA_REGEX, '\x1b[34m')
```

**Behavior**:
- Replaces `ESC[35m` (magenta) with `ESC[34m` (blue)
- Logtail doesn't support magenta, blue is closest alternative
- Uses `replaceAll` for all occurrences

**Fix 2: Bold Reset** (line 72):
```typescript
message = message.replaceAll('\x1b[22m', RESET_SEQUENCE)
```

**Behavior**:
- Replaces `ESC[22m` (bold reset) with `ESC[0m` (full reset)
- Logtail doesn't recognize bold-specific reset
- Full reset works universally

**Fix 3: Add Reset Sequences** (lines 74-76):
```typescript
message = message.replace(ANSI_REGEX, (_, colorCode, text) => {
  return `${colorCode}${text}${RESET_SEQUENCE}`
})
```

**Behavior**:
- Regex captures: `(colorCode)(text)`
- Replaces with: `colorCode + text + RESET_SEQUENCE`
- Ensures every color code has matching reset
- Prevents color bleeding across log lines

### Example Transformations

**Magenta to Blue**:
- Input: `\x1b[35mMagenta text\x1b[0m`
- Output: `\x1b[34mMagenta text\x1b[0m`

**Bold Reset**:
- Input: `\x1b[1mBold\x1b[22m`
- Output: `\x1b[1mBold\x1b[0m`

**Reset Added**:
- Input: `\x1b[32mGreen text`
- Output: `\x1b[32mGreen text\x1b[0m`

### Why This Matters

- Better Stack log viewer renders ANSI colors
- Incorrect codes cause display issues
- Missing resets cause color bleeding
- Fixes ensure logs are readable in Better Stack UI

## 7. Log Level Mapping

### Implementation

**Location**: `src/core/drain.ts` lines 33-58

### Robo.js Levels → Logtail Methods

**trace** (lines 34-36):
```typescript
case 'trace':
  // Skip trace logs
  break
```
- **Action**: SKIPPED (no Logtail call)
- **Reason**: Too verbose for Better Stack
- **Console**: Still written if logger level allows
- **⚠️ GOTCHA**: trace logs never appear in Better Stack, only in console

**debug** (lines 37-39):
```typescript
case 'debug':
  logtail.debug(fixedMessage)
  break
```
- **Action**: `logtail.debug(message)`
- **Logtail Level**: debug
- **Use Case**: Development debugging, verbose information

**info** (lines 40-42):
```typescript
case 'info':
  logtail.info(fixedMessage)
  break
```
- **Action**: `logtail.info(message)`
- **Logtail Level**: info
- **Use Case**: General information, status updates

**wait** (lines 43-45):
```typescript
case 'wait':
  logtail.info(fixedMessage)
  break
```
- **Action**: `logtail.info(message)`
- **Logtail Level**: info (mapped to info)
- **Use Case**: Robo.js-specific waiting/loading messages
- **⚠️ GOTCHA**: No separate 'wait' level in Logtail, uses info

**event** (lines 46-48):
```typescript
case 'event':
  logtail.info(fixedMessage)
  break
```
- **Action**: `logtail.info(message)`
- **Logtail Level**: info (mapped to info)
- **Use Case**: Robo.js-specific event messages
- **⚠️ GOTCHA**: No separate 'event' level in Logtail, uses info

**warn** (lines 49-51):
```typescript
case 'warn':
  logtail.warn(fixedMessage)
  break
```
- **Action**: `logtail.warn(message)`
- **Logtail Level**: warn
- **Use Case**: Warnings, non-critical issues

**error** (lines 52-54):
```typescript
case 'error':
  logtail.error(fixedMessage)
  break
```
- **Action**: `logtail.error(message)`
- **Logtail Level**: error
- **Use Case**: Errors, exceptions, critical issues

**default** (lines 55-57):
```typescript
default:
  logtail.log(fixedMessage)
  break
```
- **Action**: `logtail.log(message)`
- **Logtail Level**: log (generic)
- **Use Case**: Fallback for unknown levels

### Level Filtering

**Console**:
- Respects `logger.getLevel()` (line 28)
- Filtered based on level value comparison

**Logtail**:
- Always receives logs (no level filtering)
- Better Stack UI allows filtering by level

### Level Mapping Table

| Robo.js Level | Logtail Method | Notes |
|---------------|----------------|-------|
| trace | SKIPPED | Too verbose for Better Stack |
| debug | debug() | Development debugging |
| info | info() | General information |
| wait | info() | Mapped to info |
| event | info() | Mapped to info |
| warn | warn() | Warnings |
| error | error() | Errors |
| default | log() | Fallback |

## 8. Heartbeat Monitoring Setup & Configuration

### Configuration Structure

**Type Definition** (`src/events/_start.ts` lines 7-15):
```typescript
interface PluginConfig {
  heartbeat?: {
    debug?: boolean    // Enable debug logging (default: false)
    interval?: number  // Ping interval in ms (default: 5000)
    url: string        // Heartbeat URL (required if heartbeat configured)
  }
  ingestingHost?: string  // Custom ingesting host (optional)
  sourceToken?: string    // Logtail source token (optional)
}
```

### Initialization Flow

**Location**: `src/events/_start.ts` lines 29-45

**Steps**:
1. Destructure config: `{ debug, interval = 5_000, url } = config.heartbeat ?? {}`
2. Check if url exists (skip if not configured)
3. Suppress Fetch API warning: `process.removeAllListeners('warning')` (line 33)
4. Create interval: `setInterval(() => { ... }, interval)`
5. Store interval ID: `heartbeatIntervalId` (exported for cleanup)
6. On each interval:
   - Log debug message if debug enabled (lines 37-39)
   - Fetch heartbeat URL (line 41)
   - Catch and log errors (lines 41-43)

**Code** (lines 30-45):
```typescript
const { debug, interval = 5_000, url } = config.heartbeat ?? {}
if (url) {
  // Remove fetch experimental warning
  process.removeAllListeners('warning')
  
  heartbeatIntervalId = setInterval(() => {
    if (debug) {
      logger.debug(`Sending heartbeat... ${new Date().toISOString()}`)
    }
    
    fetch(url).catch((error) => {
      logger.debug(`Failed to send heartbeat:`, error)
    })
  }, interval)
}
```

### Heartbeat URL Format

**Example**: `https://uptime.betterstack.com/api/v1/heartbeat/8XMvMa5y7xtONEtUfj2yb8f`

**Characteristics**:
- Unique per monitor
- GET request (no body needed)
- Response ignored (only request matters)
- No authentication beyond URL token

### Interval Configuration

**Default**: 5000ms (5 seconds)

**Recommended**: Match Better Stack monitor expected interval

**Considerations**:
- **Too frequent**: Unnecessary network requests, potential rate limits
- **Too infrequent**: Defeats purpose of monitoring
- **Minimum**: 1000ms (1 second)
- **Maximum**: No limit, but should match monitor expectations

**⚠️ GOTCHA**: Default 5 seconds may be too frequent for some use cases

### Debug Flag

**Default**: false (prevents log spam)

**When to Enable**:
- Verifying heartbeat setup
- Troubleshooting connection issues
- Initial configuration testing

**Output**: `Sending heartbeat... <timestamp>` every interval

**⚠️ GOTCHA**: Generates many logs if interval is short - can clutter logs

### Fetch Error Handling

**Implementation** (lines 41-43):
```typescript
fetch(url).catch((error) => {
  logger.debug(`Failed to send heartbeat:`, error)
})
```

**Behavior**:
- Errors caught and logged via `logger.debug`
- Heartbeat continues on error (doesn't stop interval)
- Better Stack marks monitor as down if no pings received
- Transient errors don't stop heartbeat system

### Cleanup

**Location**: `src/events/_stop.ts` lines 3-7

**Code**:
```typescript
export default () => {
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId)
  }
}
```

**Behavior**:
- Checks if `heartbeatIntervalId` exists
- Clears interval via `clearInterval(heartbeatIntervalId)`
- Prevents memory leaks from lingering intervals
- Also called on restart via `_restart.ts`

## 9. Environment Variables

### BETTER_STACK_SOURCE_TOKEN

**Purpose**: Logtail source token for log ingestion

**Format**: Long alphanumeric string (e.g., `abc123def456...`)

**Required**: Yes, for log integration (not for heartbeat-only)

**Sensitive**: Yes, treat as secret credential

**Usage**: Read in `src/events/_start.ts` line 19:
```typescript
const sourceToken = config.sourceToken ?? process.env.BETTER_STACK_SOURCE_TOKEN
```

**Precedence**: Plugin config `sourceToken` overrides this environment variable

**Security Best Practices**:
- Never commit to version control
- Add `.env` to `.gitignore`
- Use different tokens per environment (dev/staging/prod)
- Rotate tokens periodically

### BETTER_STACK_INGESTING_HOST

**Purpose**: Custom Logtail ingesting host

**Format**: Hostname without protocol (e.g., `in-eu.logtail.com`)

**Required**: No, defaults to Logtail's default endpoint

**Sensitive**: No, just a hostname

**Usage**: Read in `src/events/_start.ts` line 18:
```typescript
const ingestingHost = config.ingestingHost ?? process.env.BETTER_STACK_INGESTING_HOST
```

**Precedence**: Plugin config `ingestingHost` overrides this environment variable

**URL Construction** (line 24):
```typescript
endpoint: ingestingHost ? `https://${ingestingHost}` : undefined
```

**⚠️ GOTCHA**: Assumes ingestingHost doesn't include protocol - double protocol if user includes `https://`

### Regional Hosts

**US (default)**:
- Value: `in.logtail.com`
- No need to set (default)

**EU (GDPR compliance)**:
- Value: `in-eu.logtail.com`
- Set via environment variable or plugin config

**Self-hosted**:
- Value: Custom domain
- Set via environment variable or plugin config

### Environment File Example

**File**: `.env`

```env
BETTER_STACK_SOURCE_TOKEN="your_source_token_here"
BETTER_STACK_INGESTING_HOST="in-eu.logtail.com"
```

**⚠️ IMPORTANT**: Add `.env` to `.gitignore`

## 10. Plugin Config Structure

### File Location

`/config/plugins/roboplay/plugin-better-stack.mjs`

### Full Interface

**Type Definition** (`src/events/_start.ts` lines 7-15):
```typescript
interface PluginConfig {
  heartbeat?: {
    debug?: boolean    // Enable debug logging (default: false)
    interval?: number  // Ping interval in ms (default: 5000)
    url: string        // Heartbeat URL (required if heartbeat configured)
  }
  ingestingHost?: string  // Custom ingesting host (optional)
  sourceToken?: string    // Logtail source token (optional)
}
```

### Complete Example

```javascript
export default {
  // Log integration
  sourceToken: 'your_source_token_here',
  ingestingHost: 'in-eu.logtail.com',
  
  // Heartbeat monitoring
  heartbeat: {
    url: 'https://uptime.betterstack.com/api/v1/heartbeat/...',
    interval: 10000,  // 10 seconds
    debug: true       // Enable for testing
  }
}
```

### Minimal Examples

**Log Integration Only**:
```javascript
export default {
  sourceToken: 'your_source_token_here'
}
```

**Heartbeat Only**:
```javascript
export default {
  heartbeat: {
    url: 'https://uptime.betterstack.com/api/v1/heartbeat/...'
  }
}
```

**Environment Variables Only**:
```javascript
export default {
  // Empty config, reads from .env
}
```

**EU Region with Heartbeat**:
```javascript
export default {
  sourceToken: 'your_source_token_here',
  ingestingHost: 'in-eu.logtail.com',
  heartbeat: {
    url: 'https://uptime.betterstack.com/api/v1/heartbeat/...',
    interval: 30000,  // 30 seconds
    debug: false
  }
}
```

### Configuration Validation

**No Validation**:
- Plugin doesn't validate configuration
- Invalid sourceToken: Logtail SDK throws error
- Invalid heartbeat.url: Fetch fails silently (logged if debug enabled)
- Invalid interval: JavaScript accepts any number

**⚠️ GOTCHA**: Silent failures possible - enable debug to verify setup

## 11. Integration with Robo.js Logger System

### Logger Import

**Location**: `src/events/_start.ts` line 2

**Code**:
```typescript
import { logger } from 'robo.js'
```

**Pattern**: Uses root logger directly (no fork)

**⚠️ DEVIATION**: Unlike other plugins which fork logger (e.g., `logger.fork('analytics')`)

### Setting Drain

**Location**: `src/events/_start.ts` lines 21-27

**Code**:
```typescript
if (sourceToken) {
  const drain = createLogtailDrain(sourceToken, {
    endpoint: ingestingHost ? `https://${ingestingHost}` : undefined
  })
  logger().setDrain(drain)
}
```

**Flow**:
1. Calls `logger()` to get singleton Logger instance
2. Calls `logger().setDrain(drain)` to replace default drain
3. Drain receives all log calls from this point forward
4. Previous drain (if any) is replaced

### LogDrain Interface

**From robo.js**:
```typescript
type LogDrain = (
  logger: Logger, 
  level: string, 
  ...data: unknown[]
) => Promise<void> | void
```

### Drain Invocation Flow

```
User Code                    Logger                     LogDrain
    │                           │                           │
    ├─ logger.info('msg') ─────>│                           │
    │                           ├─ drain(logger,'info','msg')>│
    │                           │                           ├─ Write console
    │                           │                           ├─ Send Logtail
    │                           │<─ Promise<void> ──────────┤
    │<─ (awaited) ──────────────┤                           │
```

### Logger Level Interaction

**Console Write Logic** (`src/core/drain.ts` line 28):
```typescript
if (levelValues[logger.getLevel()] <= levelValues[level]) {
  stream.write(message + '\n')
}
```

**Behavior**:
- Drain checks `logger.getLevel()` before console write
- Respects user's logger level setting
- Example: If `logger.setLevel('warn')`, debug/info not written to console

**⚠️ GOTCHA**: Logtail still receives all logs regardless of logger level

### Multiple Drains

**Limitation**: Robo.js supports only one drain at a time

**Behavior**: `setDrain` replaces previous drain

**⚠️ GOTCHA**: If multiple plugins call setDrain, last one wins

**Workaround**: Use direct drain method in `robo.mjs` (sets drain earliest)

### Debug Logging

**Location**: `src/events/_start.ts` lines 38, 42

**Code**:
```typescript
logger.debug(`Sending heartbeat... ${new Date().toISOString()}`)
logger.debug(`Failed to send heartbeat:`, error)
```

**Behavior**:
- Uses `logger.debug` static method (not instance method)
- Logs heartbeat activity if debug enabled
- Goes through drain (written to console and Logtail)

## 12. When to Use Direct Drain vs Plugin Config

### Direct Drain Method

**Configuration**: `config/robo.mjs`

**Example**:
```javascript
import { createLogtailDrain } from '@robojs/better-stack'

export default {
  logger: {
    drain: createLogtailDrain(process.env.BETTER_STACK_SOURCE_TOKEN, {
      endpoint: process.env.BETTER_STACK_INGESTING_HOST 
        ? `https://${process.env.BETTER_STACK_INGESTING_HOST}` 
        : undefined
    })
  }
}
```

**Pros**:
- ✅ **Early Log Capture**: Captures logs during Robo initialization, before plugins load
- ✅ **Plugin Initialization Logs**: Logs from other plugins' _start events captured
- ✅ **Direct Control**: Full control over drain configuration
- ✅ **Single Location**: Don't need separate plugin config file

**Cons**:
- ❌ **No Heartbeat**: Can't configure heartbeat monitoring (must use plugin config for that)
- ❌ **Manual Setup**: Must construct endpoint URL manually
- ❌ **More Complex**: Requires understanding of Robo.js logger config
- ❌ **Import Required**: Must import createLogtailDrain in robo.mjs

**When to Use**:
- Need to capture early logs (e.g., plugin initialization errors)
- Advanced use cases requiring custom drain configuration
- Don't need heartbeat monitoring
- Want single configuration location

### Plugin Config Method

**Configuration**: `/config/plugins/roboplay/plugin-better-stack.mjs`

**Example**:
```javascript
export default {
  sourceToken: 'your_source_token_here',
  ingestingHost: 'in-eu.logtail.com',
  heartbeat: {
    url: 'https://uptime.betterstack.com/api/v1/heartbeat/...'
  }
}
```

**Pros**:
- ✅ **Heartbeat Support**: Can configure heartbeat monitoring
- ✅ **Simple Setup**: Just set sourceToken and optional ingestingHost
- ✅ **Standard Pattern**: Follows Robo.js plugin configuration pattern
- ✅ **Environment Variables**: Can use env vars instead of config file

**Cons**:
- ❌ **Late Log Capture**: Misses logs before plugin _start event
- ❌ **Plugin Initialization Logs**: Logs from this plugin's _start not captured
- ❌ **Two Locations**: Config file + env vars (if used)

**When to Use**:
- Need heartbeat monitoring
- Standard use case (most projects)
- Don't need early log capture
- Prefer environment variables for tokens

### Combining Both Methods

**Scenario**: Need both early log capture AND heartbeat monitoring

**Solution**:
1. Use direct drain in `robo.mjs` for log integration
2. Use plugin config for heartbeat only (omit sourceToken)

**robo.mjs**:
```javascript
import { createLogtailDrain } from '@robojs/better-stack'

export default {
  logger: {
    drain: createLogtailDrain(process.env.BETTER_STACK_SOURCE_TOKEN, {
      endpoint: process.env.BETTER_STACK_INGESTING_HOST 
        ? `https://${process.env.BETTER_STACK_INGESTING_HOST}` 
        : undefined
    })
  }
}
```

**plugin-better-stack.mjs**:
```javascript
export default {
  heartbeat: {
    url: 'https://uptime.betterstack.com/api/v1/heartbeat/...'
  }
}
```

**⚠️ GOTCHA**: If both methods set sourceToken, drain is set twice (last wins, which is plugin config)

### Decision Matrix

| Requirement | Recommended Method |
|-------------|-------------------|
| Early log capture | Direct Drain |
| Heartbeat monitoring | Plugin Config |
| Both early logs + heartbeat | Combined (Direct Drain + Plugin Config) |
| Production security | Plugin Config + Env Vars |
| Simple setup | Plugin Config |
| Custom drain options | Direct Drain |

## 13. Hidden Gotchas & Edge Cases

### 1. Fetch API Warning Suppression

**Location**: `src/events/_start.ts` line 33

**Code**:
```typescript
process.removeAllListeners('warning')
```

**Purpose**: Suppress Node.js experimental Fetch API warning

**⚠️ GOTCHA**: Removes ALL warning listeners, not just Fetch API

**Impact**: Other warnings may be silenced unintentionally

**Why**: Fetch API was experimental in older Node.js versions

**Modern Node**: Fetch is stable in Node 18+, warning may not appear

### 2. Trace Level Skipped

**Location**: `src/core/drain.ts` lines 34-36

**Code**:
```typescript
case 'trace':
  // Skip trace logs
  break
```

**⚠️ GOTCHA**: trace logs never sent to Better Stack

**Reason**: Too verbose for log aggregation service

**Console**: trace still written to console if logger level allows

**Impact**: trace logs won't appear in Better Stack UI

**Workaround**: Use debug level for logs you want in Better Stack

### 3. ANSI Color Fixes Required

**Location**: `src/core/drain.ts` lines 66-78

**Fixes Applied**:
- Magenta (ESC[35m) → Blue (ESC[34m)
- Bold Reset (ESC[22m) → Full Reset (ESC[0m)
- Reset Sequences added after each color code

**⚠️ GOTCHA**: Original ANSI codes may not render correctly in Better Stack

**Impact**: Colors may differ between console and Better Stack UI

### 4. Configuration Precedence

**Location**: `src/events/_start.ts` lines 18-19

**Code**:
```typescript
const ingestingHost = config.ingestingHost ?? process.env.BETTER_STACK_INGESTING_HOST
const sourceToken = config.sourceToken ?? process.env.BETTER_STACK_SOURCE_TOKEN
```

**Order**: Plugin config > Environment variables

**⚠️ GOTCHA**: Plugin config always wins, even if env var set

**Impact**: Can't override plugin config with env vars

### 5. Direct Drain Timing

**Direct Drain**: Set during Robo config load (earliest)

**Plugin Config**: Set during _start event (after plugins load)

**⚠️ GOTCHA**: Direct drain captures more logs

**Impact**: Plugin initialization logs only captured by direct drain

### 6. Heartbeat Interval Default

**Default**: 5000ms (5 seconds)

**⚠️ GOTCHA**: May be too frequent for some use cases

**Impact**: Unnecessary network requests, potential rate limits

**Recommendation**: Match Better Stack monitor expected interval

### 7. Debug Flag Default

**Default**: false

**⚠️ GOTCHA**: No output to verify heartbeat working

**Impact**: Silent failures if URL wrong

**Recommendation**: Enable debug during initial setup

### 8. sourceToken Optional

**Behavior**: Plugin works without sourceToken (heartbeat only)

**⚠️ GOTCHA**: No error if sourceToken missing

**Impact**: Logs not sent to Better Stack, no indication why

**Check**: Verify sourceToken set if logs not appearing

### 9. ingestingHost Optional

**Default**: Logtail's default endpoint (US region)

**⚠️ GOTCHA**: EU users may want in-eu.logtail.com for GDPR

**Impact**: Logs sent to US region by default

**Recommendation**: Set explicitly for EU region

### 10. Logger Level Check

**Location**: `src/core/drain.ts` line 28

**Code**:
```typescript
if (levelValues[logger.getLevel()] <= levelValues[level]) {
  stream.write(message + '\n')
}
```

**⚠️ GOTCHA**: Logtail always receives logs regardless of level

**Impact**: Better Stack may have more logs than console

**Reason**: Centralized logging should capture everything

### 11. No Logger Fork

**Pattern**: Plugin uses root logger directly

**Code** (`src/events/_start.ts` line 2):
```typescript
import { logger } from 'robo.js'
```

**⚠️ GOTCHA**: Deviates from standard plugin pattern

**Impact**: Logs not prefixed with 'better-stack'

**Reason**: Plugin is a drain, not a logger user

**Recommendation for Future**: Consider adding `logger.fork('better-stack')` for consistency

### 12. Heartbeat Cleanup

**Location**: `src/events/_stop.ts` lines 3-7

**Code**:
```typescript
if (heartbeatIntervalId) {
  clearInterval(heartbeatIntervalId)
}
```

**⚠️ GOTCHA**: Interval continues if cleanup fails

**Impact**: Memory leak from lingering intervals

**Prevention**: _stop.ts clears interval

### 13. Promise.all Pattern

**Location**: `src/core/drain.ts` line 60

**Code**:
```typescript
return Promise.all([consoleWrite, logtailSend]).then(() => {
  // noop
})
```

**⚠️ GOTCHA**: Slow Logtail requests block logging

**Impact**: Log calls may take longer than expected

**Reason**: Ensures logs not lost

### 14. Multiple Drains

**Behavior**: setDrain replaces previous drain

**⚠️ GOTCHA**: Only one drain active at a time

**Impact**: If multiple plugins call setDrain, last wins

**Workaround**: Use direct drain method (earliest)

### 15. Fetch Error Handling

**Location**: `src/events/_start.ts` lines 41-43

**Code**:
```typescript
fetch(url).catch((error) => {
  logger.debug(`Failed to send heartbeat:`, error)
})
```

**⚠️ GOTCHA**: Heartbeat continues on error

**Impact**: Monitor may show as down, but interval keeps running

**Reason**: Transient errors shouldn't stop heartbeat

### 16. Endpoint URL Construction

**Location**: `src/events/_start.ts` line 24

**Code**:
```typescript
endpoint: ingestingHost ? `https://${ingestingHost}` : undefined
```

**⚠️ GOTCHA**: Assumes ingestingHost doesn't include protocol

**Impact**: Double protocol if user includes `https://`

**Recommendation**: Document hostname-only format

### 17. Logtail Constructor Options

**Parameter**: `options?: ConstructorParameters<typeof Logtail>[1]`

**⚠️ GOTCHA**: Accepts any Logtail options, not validated

**Impact**: Invalid options may cause Logtail SDK errors

**Documentation**: See @logtail/node for available options

### 18. Inspect Depth

**Location**: `src/core/drain.ts` line 16

**Code**:
```typescript
inspect(item, { colors: true, depth: null })
```

**⚠️ GOTCHA**: `depth: null` means infinite depth

**Impact**: Large objects may produce very long log messages

**Reason**: Ensures complete object logging

### 19. Stream Selection

**Location**: `src/core/drain.ts` line 23

**Code**:
```typescript
const stream = level === 'warn' || level === 'error' ? process.stderr : process.stdout
```

**⚠️ GOTCHA**: Only warn and error go to stderr

**Impact**: Log aggregation tools may separate streams

**Standard**: Follows Unix convention

### 20. Heartbeat URL Validation

**Behavior**: No validation of heartbeat.url

**⚠️ GOTCHA**: Invalid URL causes fetch errors

**Impact**: Errors logged if debug enabled, silent otherwise

**Recommendation**: Verify URL format during setup

## 14. File Structure Reference

### Source Files

**Core Implementation**:
- `src/index.ts` - Public exports (2 lines)
  - Exports: `createLogtailDrain`
- `src/core/drain.ts` - LogDrain implementation with ANSI fixes (79 lines)
  - Function: `createLogtailDrain(sourceToken, options)`
  - Function: `fixAnsi(message)`
- `src/events/_start.ts` - Plugin lifecycle initialization (47 lines)
  - Event handler: Initialize drain and heartbeat
- `src/events/_stop.ts` - Cleanup heartbeat interval (8 lines)
  - Event handler: Clear heartbeat interval
- `src/events/_restart.ts` - Delegates to _stop.ts (3 lines)
  - Event handler: Call _stop event

### Configuration

**Files**:
- `config/robo.mjs` - Plugin configuration
  - Type: 'plugin'
  - Empty intents
- `/config/plugins/roboplay/plugin-better-stack.mjs` - User configuration
  - Plugin settings: sourceToken, ingestingHost, heartbeat

### Package Metadata

**Files**:
- `package.json` - Package metadata, dependencies, peer dependencies
  - Dependencies: @logtail/node ^0.5.5
  - Peer Dependencies: robo.js ^0.10.28 (required)
- `tsconfig.json` - TypeScript configuration

### Documentation

**Files**:
- `README.md` - User-facing documentation
- `DEVELOPMENT.md` - Plugin development guide
- `CHANGELOG.md` - Version history
- `LICENSE` - MIT license
- `AGENTS.md` - This file (AI coding agent documentation)

## 15. Logging Standards

### Logger Usage Pattern

**Import** (`src/events/_start.ts` line 2):
```typescript
import { logger } from 'robo.js'
```

**Pattern**: Uses root logger directly (no fork)

**⚠️ DEVIATION**: Unlike other plugins which fork logger

**Example from other plugins**:
```typescript
// Standard pattern (NOT used in better-stack)
const pluginLogger = logger.fork('better-stack')
pluginLogger.debug('Message')
```

### Logger Calls

**Singleton Instance** (line 22):
```typescript
logger().setDrain(drain)
```

**Static Method** (lines 38, 42):
```typescript
logger.debug(`Sending heartbeat... ${new Date().toISOString()}`)
logger.debug(`Failed to send heartbeat:`, error)
```

### Why No Fork

**Reasons**:
- Plugin is a drain, not a logger user
- Drain receives logs from all sources
- Forking would only affect plugin's own logs
- Plugin has minimal logging (only heartbeat debug)

### Recommendation for Future

**Consideration**: Add `logger.fork('better-stack')` for consistency

**Benefits**:
- Follows standard plugin pattern
- Easier to filter plugin-specific logs
- Consistent with other plugins (analytics, roadmap, etc.)
- Better log namespacing

**Implementation**:
```typescript
// In src/events/_start.ts
import { logger } from 'robo.js'

const betterStackLogger = logger.fork('better-stack')

// Use forked logger for heartbeat debug
if (debug) {
  betterStackLogger.debug(`Sending heartbeat... ${new Date().toISOString()}`)
}
```

## 16. Type Exports

### From Plugin

**Location**: `src/index.ts`

**Exports**:
```typescript
export { createLogtailDrain }
```

**Function**: Creates LogDrain for Robo.js logger integration

### From Dependencies

**Robo.js**:
- `LogDrain` - Type for drain functions
- `Logger` - Logger class type
- `Config` - Robo.js configuration type

**@logtail/node**:
- `Logtail` - Logtail SDK class

### PluginConfig Interface

**Location**: `src/events/_start.ts` lines 7-15

**Definition**:
```typescript
interface PluginConfig {
  heartbeat?: {
    debug?: boolean    // Enable debug logging (default: false)
    interval?: number  // Ping interval in ms (default: 5000)
    url: string        // Heartbeat URL (required if heartbeat configured)
  }
  ingestingHost?: string  // Custom ingesting host (optional)
  sourceToken?: string    // Logtail source token (optional)
}
```

**Usage**:
- Plugin config file type
- Environment variable fallback
- Validated at runtime (no TypeScript validation)

## 17. Dependencies

### Runtime Dependencies

**Location**: `package.json` lines 32-34

**@logtail/node** ^0.5.5:
- Logtail SDK for log ingestion
- Sends logs to Better Stack
- Provides debug/info/warn/error methods

### Peer Dependencies

**Location**: `package.json` lines 42-49

**robo.js** ^0.10.28:
- Required (not optional)
- Peer dependency to avoid version conflicts
- Provides Logger and LogDrain interfaces

### Dev Dependencies

**Location**: `package.json` lines 35-41

**Development Tools**:
- `@swc/core` ^1.3.44 - SWC compiler for faster builds
- `@types/node` ^18.14.6 - Node.js type definitions
- `discord.js` ^14.7.1 - Discord.js (for types)
- `robo.js` workspace:* - Local workspace dependency for development
- `typescript` ^5.0.0 - TypeScript compiler

## 18. ⚠️ IMPORTANT: Keep This File Updated

### CRITICAL: Self-Update Reminder for AI Coding Agents

When modifying the `@robojs/better-stack` plugin, **you MUST update this AGENTS.md file** to reflect your changes. This documentation is critical for AI coding agents (especially GPT-5 Codex and similar models) to understand the plugin's architecture and make informed decisions.

### What to Update

**Core Functionality Changes**:
- ✅ New or modified drain logic in `src/core/drain.ts`
- ✅ ANSI handling updates (fixAnsi function)
- ✅ Log level mapping changes
- ✅ Heartbeat monitoring modifications
- ✅ Promise handling updates

**Configuration Changes**:
- ✅ New configuration options in PluginConfig interface
- ✅ Environment variable changes (add/remove/rename)
- ✅ Plugin config structure updates
- ✅ Default value changes
- ✅ Configuration precedence changes

**Integration Changes**:
- ✅ Robo.js logger integration updates
- ✅ Logtail SDK version changes
- ✅ Better Stack API changes
- ✅ setDrain behavior changes

**New Features**:
- ✅ Additional monitoring capabilities
- ✅ New log processing features
- ✅ Custom drain options
- ✅ Advanced configuration options

**Bug Fixes**:
- ✅ ANSI handling fixes
- ✅ Fetch warning suppression changes
- ✅ Heartbeat cleanup improvements
- ✅ Promise handling updates
- ✅ Error handling improvements

**Hidden Gotchas**:
- ✅ New edge cases discovered
- ✅ Behavior changes that affect usage
- ✅ Workarounds for limitations
- ✅ Breaking changes

### Why This Matters

**AI Coding Agent Reliance**:
AI coding agents rely on this documentation to understand the plugin's architecture. Stale documentation leads to:

- ❌ Incorrect implementations
- ❌ Bugs introduced by misunderstanding behavior
- ❌ Missed optimization opportunities
- ❌ Inconsistent code patterns
- ❌ Breaking changes not properly handled
- ❌ Poor integration with Better Stack
- ❌ Security vulnerabilities from misconfiguration

### How to Update

**Step-by-Step Process**:

1. **Review Relevant Sections**: Identify which sections of this file are affected by your changes

2. **Update Descriptions**: Modify descriptions, function signatures, and behavior notes

3. **Add Cross-References**: Include file paths and line numbers for modified code
   - Example: `src/core/drain.ts` lines 66-78

4. **Document Gotchas**: Add any new edge cases or gotchas introduced by your changes

5. **Update Examples**: Modify code examples if behavior changed

6. **Add Breaking Changes**: Document any breaking changes or migration requirements

7. **Update File Structure**: Update the file structure reference if files were added/removed/renamed

8. **Update Configuration Examples**: Modify configuration examples if options changed

9. **Test Examples**: Verify all code examples are correct and functional

10. **Review Completeness**: Ensure all aspects of your change are documented

### Verification Checklist

Before committing changes, verify:

- [ ] Updated function signatures and return types
- [ ] Documented new configuration options
- [ ] Added new hidden gotchas or edge cases
- [ ] Updated ANSI handling if changed
- [ ] Updated log level mapping if changed
- [ ] Cross-referenced modified files with line numbers
- [ ] Updated integration points if affected
- [ ] Documented breaking changes
- [ ] Updated examples to reflect new behavior
- [ ] Updated Better Stack setup prerequisites if changed
- [ ] Verified all code examples compile and run
- [ ] Checked for outdated information
- [ ] Updated version information if applicable
- [ ] Added migration guide for breaking changes
- [ ] Reviewed consistency with other sections

### Common Update Scenarios

**Scenario 1: Added new configuration option**
- Update section 4 (Configuration Methods)
- Update section 10 (Plugin Config Structure)
- Update section 16 (Type Exports) with interface changes
- Add example usage
- Document default value and behavior

**Scenario 2: Changed ANSI handling**
- Update section 6 (ANSI Color Code Handling & Fixes)
- Update fixAnsi function documentation
- Add transformation examples
- Document why the change was needed

**Scenario 3: Modified log level mapping**
- Update section 7 (Log Level Mapping)
- Update mapping table
- Document new behavior
- Add gotchas if any

**Scenario 4: Changed heartbeat behavior**
- Update section 8 (Heartbeat Monitoring Setup & Configuration)
- Update initialization flow
- Document new parameters
- Add troubleshooting tips

**Scenario 5: Fixed a bug**
- Add to section 13 (Hidden Gotchas & Edge Cases)
- Document the issue
- Explain the fix
- Add workarounds if needed

### Remember

**This file is a living document.** Keep it current, and future developers (human and AI) will thank you.

**Documentation is code.** Treat this file with the same care and attention as source code.

**When in doubt, document.** Over-documentation is better than under-documentation for AI agents.

---

**Last Updated**: 2025-10-27 (Update this date when making changes)
