# Logging System

## Overview

Complete logging pipeline from Robo.js bot process through session storage to Stage UI display with ANSI color rendering, time filtering, and density visualization.

## Pipeline Flow

```
Robo.js Logger
    ↓
Log Drain (createSessionLogDrain)
    ↓
Session.recordLog() + LogRecorder.record()
    ↓
StageBridge.onLogEntry() broadcasts
    ↓
Stage WebSocket → LogsStore → UI Display
```

## Log Drain System

**File:** `src/session/log-drain.ts`

### Drain Options

```typescript
interface SessionLogDrainOptions {
  sessionId: string
  connectionId: string
  botInfo?: { userId?: string; username?: string }
  onLog: (entry: Omit<SessionLogEntry, 'id'>) => void
  minLevel?: SessionLogLevel     // default: 'trace'
}
```

### Log Level Priority

```
trace: 0 → debug: 1 → info: 2 → wait: 3 → other: 4 →
event: 5 → ready: 6 → warn: 7 → error: 8
```

### Drain Processing

1. Receives `(logger, level, ...data)`
2. Converts level string → numeric value
3. Filters against `minLevelValue`
4. Processes data array:
   - Errors: Extracts message + stack trace
   - Strings: Preserves as-is (ANSI codes intact)
   - Objects: Calls `safeStringify()`
5. Extracts logger prefix
6. Builds LogSource with connection metadata
7. Calls `onLog()` callback

**Key:** ANSI codes preserved throughout pipeline for UI rendering.

## LogRecorder

**File:** `src/session/log-recorder.ts`

### Class Structure

```typescript
class LogRecorder implements ILogRecorder {
  private logs: SessionLogEntry[] = []
  private maxLogs: number = 10000
  private idCounter = 0
  private sessionId: string
}
```

### LRU Eviction

At 10,000 logs: Removes oldest 10% (1,000), keeps newest 9,000.

```typescript
if (this.logs.length > this.maxLogs) {
  const removeCount = Math.floor(this.maxLogs * 0.1)
  this.logs = this.logs.slice(removeCount)
}
```

### Methods

| Method | Purpose |
|--------|---------|
| `record(entry)` | Add log, return with ID |
| `getAll()` | Return all logs |
| `getSince(timestamp)` | Logs ≥ timestamp |
| `getByLevel(level)` | Filter by level |
| `getByLevels(levels[])` | Filter by multiple levels |
| `getByConnection(connectionId)` | Multi-bot filtering |
| `search(query)` | Case-insensitive search |
| `getInRange(startTime, endTime)` | Time-bounded query |
| `getErrors()` | Returns warn + error logs |
| `clear()` | Reset logs and counter |

### ID Generation

```typescript
`log_${sessionId}_${++idCounter}`
```

## SessionLogEntry Structure

```typescript
interface SessionLogEntry {
  id: string
  timestamp: number              // Unix ms
  level: SessionLogLevel
  message: string                // May contain ANSI codes
  data?: unknown[]               // Structured data
  prefix?: string                // Logger prefix
  source: LogSource
}

type SessionLogLevel = 'trace' | 'debug' | 'info' | 'wait' | 'event' | 'ready' | 'warn' | 'error'

interface LogSource {
  connectionId: string
  sessionId: string
  botUserId?: string
  botUsername?: string
}
```

## ANSI Code Rendering

**File:** `src/app/components/logs/AnsiText.tsx`

### Supported ANSI Codes

| Code | Effect |
|------|--------|
| 0 | Reset all |
| 1 | Bold |
| 2 | Dim |
| 3 | Italic |
| 4 | Underline |
| 7 | Inverse |
| 8 | Hidden |
| 9 | Strikethrough |
| 22-29 | Reset variants |
| 30-37 | Foreground colors |
| 90-97 | Bright foreground |
| 40-47 | Background colors |
| 100-107 | Bright background |

### Color Mapping

- Code 31 → `#F44336` (red)
- Code 32 → `#4CAF50` (green)
- Code 34 → `#2196F3` (blue)
- Code 39 → `inherit` (default)
- Code 90 → `#9E9E9E` (bright gray)

### Rendering Process

```typescript
parseAnsiToSegments(text)
  → tokenizes text and codes
  → builds TextSegment[]
  → applies CSS styles
```

### Stripping for Search

```typescript
stripAnsi(text: string): string {
  return text.replace(/\x1b\[.*?m/g, '')
}
```

## Time Range Filtering

**File:** `src/app/stores/logsStore.tsx`

### Relative Ranges

| Range | Duration |
|-------|----------|
| last30m | 30 min |
| last1h | 1 hour |
| last3h | 3 hours |
| last6h | 6 hours |
| last12h | 12 hours |
| last24h | 24 hours |
| last2d | 2 days |
| last7d | 7 days |
| last14d | 14 days |
| last30d | 30 days |
| everything | No limit |

### TimeRange Type

```typescript
interface TimeRange {
  type: 'relative' | 'custom'
  relative?: RelativeTimeRange
  customStart?: number
  customEnd?: number
}
```

### Bounds Calculation

```typescript
const getTimeRangeBounds = (): { start: number | null; end: number | null } => {
  if (timeRange.type === 'custom') {
    return { start: timeRange.customStart, end: timeRange.customEnd }
  }
  const ms = RELATIVE_RANGE_MS[timeRange.relative]
  if (ms === null) return { start: null, end: null }
  return { start: Date.now() - ms, end: Date.now() }
}
```

## Log Density Graph

**File:** `src/app/components/logs/LogDensityGraph.tsx`

### Configuration

```typescript
const BUCKET_COUNT = 60      // 60 bars
const BAR_GAP = 1            // 1px between bars
```

### Density Calculation

```typescript
const getLogDensity = (bucketCount, startTime, endTime): number[] => {
  const bucketSize = (endTime - startTime) / bucketCount
  const density = new Array(bucketCount).fill(0)

  for (const log of logs) {
    if (log.timestamp >= startTime && log.timestamp <= endTime) {
      const bucketIndex = Math.floor((log.timestamp - startTime) / bucketSize)
      density[bucketIndex]++
    }
  }
  return density
}
```

### Time Axis Labels

| Duration | Interval |
|----------|----------|
| ≤ 1h | 10 min |
| ≤ 6h | 1 hour |
| ≤ 24h | 3 hours |
| ≤ 7d | 12 hours |
| > 7d | 1 day |

### Interactivity

- Click bar → Seek to timestamp
- Hover → Shows "N logs\nHH:MM - HH:MM" tooltip
- Y-axis: max, 50%, 0 grid lines

## Search and Level Filtering

### Filter Structure

```typescript
interface LogFilters {
  levels: Set<SessionLogLevel>     // Empty = show all
  search: string
  timestampStart: number | null
  timestampEnd: number | null
  usePlaybackRange: boolean
  sessionId: string | null
}
```

### Filtered Logs Computation

```typescript
let result = logs

// 1. Filter by session ID
if (filters.sessionId) {
  result = result.filter(log => log.source?.sessionId === filters.sessionId)
}

// 2. Filter by levels
if (filters.levels.size > 0) {
  result = result.filter(log => filters.levels.has(log.level))
}

// 3. Filter by search (strip ANSI)
if (filters.search) {
  const searchLower = filters.search.toLowerCase()
  result = result.filter(log =>
    stripAnsi(log.message).toLowerCase().includes(searchLower) ||
    (log.prefix && log.prefix.toLowerCase().includes(searchLower))
  )
}

// 4. Filter by timestamp range
if (!filters.usePlaybackRange) {
  if (filters.timestampStart) result = result.filter(log => log.timestamp >= filters.timestampStart)
  if (filters.timestampEnd) result = result.filter(log => log.timestamp <= filters.timestampEnd)
}
```

### Level Buttons

```typescript
const LOG_LEVELS = [
  { level: 'trace', label: 'T', color: '#72767d' },
  { level: 'debug', label: 'D', color: '#5865f2' },
  { level: 'info', label: 'I', color: '#3ba55c' },
  { level: 'warn', label: 'W', color: '#faa81a' },
  { level: 'error', label: 'E', color: '#ed4245' }
]
```

### Search Syntax

- `level=info` → Sets level filter
- `session:xxx` → Sets session filter
- Plain text → Search message + prefix

## Log Storage and Retrieval

### REST API Endpoint

`GET /api/control/sessions/:id/logs`

**Query Parameters:**
| Param | Purpose |
|-------|---------|
| level | Filter by level |
| since | Logs after timestamp |
| search | Search message/prefix |
| connectionId | Multi-bot filtering |
| limit | Max returned (default: 100) |
| offset | Pagination |

**Response:**
```typescript
{
  logs: SessionLogEntry[],
  total: number,
  limit: number,
  offset: number
}
```

### localStorage Persistence

| Key | Stores |
|-----|--------|
| `stage_logs_open` | Panel open state |
| `stage_logs_width` | Panel width |
| `stage_logs_time_range` | TimeRange (JSON) |
| `stage_logs_recent_ranges` | Recent custom ranges |

### LRU at UI Level

Keeps max 10,000 entries. At limit: removes oldest 1,000.

### Event-Based Sync

```typescript
window.addEventListener('stage:log_entry', (event) => {
  if (sessionFilterRef.current === null) {
    addLog(event.detail)
  }
})
```

## Key Files

| Purpose | Path |
|---------|------|
| Log Drain | `src/session/log-drain.ts` |
| Log Recorder | `src/session/log-recorder.ts` |
| Logs Store | `src/app/stores/logsStore.tsx` |
| ANSI Rendering | `src/app/components/logs/AnsiText.tsx` |
| Log Entry | `src/app/components/logs/LogEntry.tsx` |
| Density Graph | `src/app/components/logs/LogDensityGraph.tsx` |
| Time Picker | `src/app/components/logs/TimeRangePicker.tsx` |
| Log Filters | `src/app/components/logs/LogFilters.tsx` |
| Search Bar | `src/app/components/logs/LogSearchBar.tsx` |
| Logs Panel | `src/app/components/logs/LogsPanel.tsx` |
| REST Endpoint | `src/api/control/sessions/[id]/logs.ts` |
