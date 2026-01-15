# Storage and Persistence

## Overview

@robojs/mock uses memory-only storage by default with pluggable interfaces for future hosted instance scaling.

## Memory-Only Abstractions

### Design Philosophy

All storage is in-memory by default:
- **No database required** for local development
- **Ephemeral by design** - state doesn't survive restarts
- **Pluggable interfaces** for future backends
- **Designed for horizontal scaling** in hosted deployments

### Storage Interfaces

Two key interfaces designed for future extensibility:

```typescript
// Session storage
interface SessionStorage {
  get(id: string): Session | undefined
  set(id: string, session: Session): void
  delete(id: string): boolean
  values(): IterableIterator<Session>
  clear(): void
  readonly size: number
}

// Attachment storage
interface AttachmentStorage {
  store(attachment: StoredAttachment): Promise<void>
  get(id: Snowflake): Promise<StoredAttachment | undefined>
  delete(id: Snowflake): Promise<boolean>
  getForMessage(messageId: Snowflake): Promise<StoredAttachment[]>
  deleteForMessage(messageId: Snowflake): Promise<number>
  getStats(): Promise<StorageStats>
  clear(): Promise<number>
}
```

## AttachmentStorage Interface

**File:** `src/storage/attachment-storage.ts`

### MemoryAttachmentStorage (Default)

```typescript
class MemoryAttachmentStorage implements AttachmentStorage {
  private attachments = new Map<Snowflake, StoredAttachment>()

  async store(attachment: StoredAttachment): Promise<void>
  async get(id: Snowflake): Promise<StoredAttachment | undefined>
  async delete(id: Snowflake): Promise<boolean>
  async getForMessage(messageId: Snowflake): Promise<StoredAttachment[]>
  async deleteForMessage(messageId: Snowflake): Promise<number>
  async getStats(): Promise<StorageStats>
  async clear(): Promise<number>

  // Synchronous methods for backwards compatibility
  storeSync(attachment: StoredAttachment): void
  getSync(id: Snowflake): StoredAttachment | undefined
}
```

### StoredAttachment Structure

```typescript
interface StoredAttachment {
  id: Snowflake
  channelId: Snowflake
  messageId: Snowflake
  filename: string
  contentType: string           // MIME type
  size: number
  data: Uint8Array              // Binary content
  width?: number                // For images
  height?: number
}

interface StorageStats {
  count: number                 // Total attachments
  totalBytes: number            // Total size
  type: string                  // Backend identifier
}
```

### Future Storage Backends (Stubbed)

```typescript
// File system storage
class FileSystemAttachmentStorage implements AttachmentStorage {
  constructor(basePath: string)
}

// S3/Cloud storage
class S3AttachmentStorage implements AttachmentStorage {
  constructor(bucket: string, region: string)
}

// Redis cache
class RedisAttachmentStorage implements AttachmentStorage {
  constructor(redisUrl: string)
}
```

### Factory Pattern

```typescript
interface StorageConfig {
  type: 'memory' | 'filesystem' | 's3' | 'redis'
  options?: Record<string, unknown>
}

function createStorage(config: StorageConfig = { type: 'memory' }): AttachmentStorage {
  switch (config.type) {
    case 'memory':
      return new MemoryAttachmentStorage()
    case 'filesystem':
      return new FileSystemAttachmentStorage(config.options?.basePath)
    // Future implementations...
  }
}
```

## SessionStorage Interface

**File:** `src/session/storage.ts`

### InMemoryStorage (Default)

```typescript
class InMemoryStorage implements SessionStorage {
  private sessions = new Map<string, Session>()

  get(id: string): Session | undefined
  set(id: string, session: Session): void
  delete(id: string): boolean
  values(): IterableIterator<Session>
  clear(): void
  get size(): number
}
```

### Future: Distributed Session Storage

For hosted instances with horizontal scaling:

```typescript
// Redis-backed sessions for distributed deployment
class RedisSessionStorage implements SessionStorage {
  constructor(redisUrl: string)
  // Sessions serialized to Redis
  // State handoff between instances
}
```

## File-Based Persistence

### Session Persistence

**File:** `src/core/persistence.ts`

For saving sessions to disk (CLI commands, debugging):

```typescript
interface PersistedSession {
  id: string
  name?: string
  createdAt: number
  endedAt: number
  summary: SessionSummary
  actions: RecordedAction[]
  state: SerializedSessionState
}

// Functions
async function persistSession(session: Session, dataDirectory: string): Promise<void>
async function loadPersistedSession(sessionId: string, dataDirectory: string): Promise<PersistedSession | null>
async function listPersistedSessions(dataDirectory: string): Promise<PersistedSessionMetadata[]>
async function deletePersistedSession(sessionId: string, dataDirectory: string): Promise<boolean>
async function cleanupOldSessions(keepCount: number, dataDirectory: string): Promise<number>
async function getPersistedSessionsSize(dataDirectory: string): Promise<number>
```

**Storage location:** `.robo/mock/{sessionId}.json`

### Recording Persistence

**File:** `src/session/recording-storage.ts`

```typescript
interface SessionRecording {
  version: 1
  metadata: RecordingMetadata
  initialConfig: SessionConfig
  actions: RecordedAction[]
  logs?: SessionLogEntry[]
}

interface RecordingMetadata {
  sessionId: string
  sessionName?: string
  startTime: number
  endTime: number
  duration: number
  botUserId?: string
  botUsername?: string
}

// Functions
function saveRecording(sessionId: string, recording: SessionRecording): void
function loadRecording(sessionId: string): SessionRecording | null
function listRecordings(): RecordingMetadata[]
function deleteRecording(sessionId: string): boolean
function recordingExists(sessionId: string): boolean
function cleanupRecordings(keepCount: number): number
```

**Storage location:** `.robo/mock/recordings/{sessionId}.json`

## Serialization

### State Serialization

**File:** `src/session/state.ts`

Converting in-memory state to JSON:

```typescript
function serializeSessionState(state: MockServerState): SerializedSessionState

// Conversions:
// - Maps → Arrays
// - Uint8Array → Base64 strings
// - BigInt → String
// - Composite keys preserved as properties
```

### Attachment Serialization

```typescript
interface SerializedStoredAttachment {
  id: Snowflake
  channelId: Snowflake
  messageId: Snowflake
  filename: string
  contentType: string
  size: number
  data: string                  // Base64-encoded
  width?: number
  height?: number
}

// Conversion functions
function serializeStoredAttachment(attachment: StoredAttachment): SerializedStoredAttachment
function deserializeStoredAttachment(serialized: SerializedStoredAttachment): StoredAttachment
```

## LRU Eviction

### Action Recording

**File:** `src/session/recorder.ts`

```typescript
class ActionRecorder {
  private maxActions = 10000

  record(action): RecordedAction {
    if (this.actions.length >= this.maxActions) {
      // Remove oldest 10%
      const removeCount = Math.floor(this.maxActions * 0.1)
      this.actions = this.actions.slice(removeCount)
    }
    // Add new action
  }
}
```

### Log Recording

**File:** `src/session/log-recorder.ts`

```typescript
class LogRecorder {
  private maxLogs = 10000

  record(entry): SessionLogEntry {
    if (this.logs.length >= this.maxLogs) {
      // Remove oldest 10%
      const removeCount = Math.floor(this.maxLogs * 0.1)
      this.logs = this.logs.slice(removeCount)
    }
    // Add new log
  }
}
```

### Stage UI Event Buffer

**File:** `src/core/stage.ts`

```typescript
// Per-session event buffer
private eventBuffers = new Map<string, BufferedStageEvent[]>()
private maxBufferSize = 1000

// LRU when buffer full
if (buffer.length >= this.maxBufferSize) {
  buffer.shift()  // Remove oldest
}
```

## Hosted Instance Considerations

### Horizontal Scaling Design

For a future hosted mock server service:

```
┌─────────────────┐     ┌─────────────────┐
│  Load Balancer  │     │  Load Balancer  │
└────────┬────────┘     └────────┬────────┘
         │                       │
    ┌────┴────┐             ┌────┴────┐
    │         │             │         │
┌───▼───┐ ┌───▼───┐     ┌───▼───┐ ┌───▼───┐
│Mock 1 │ │Mock 2 │     │Mock 3 │ │Mock 4 │
└───┬───┘ └───┬───┘     └───┬───┘ └───┬───┘
    │         │             │         │
    └────┬────┴─────────────┴────┬────┘
         │                       │
    ┌────▼────┐             ┌────▼────┐
    │  Redis  │             │   S3    │
    │(Sessions│             │(Attach- │
    │ + State)│             │ ments)  │
    └─────────┘             └─────────┘
```

### Session Handoff

Requirements for distributed sessions:
1. **Serializable state** - Already implemented
2. **Sticky sessions** - Route same session to same instance
3. **State sync** - Redis pub/sub for cross-instance events
4. **Attachment offload** - S3 for binary data

### Configuration for Hosted Mode

```typescript
interface HostedMockConfig extends MockPluginConfig {
  storage: {
    sessions: {
      type: 'redis'
      url: string
      prefix?: string
    }
    attachments: {
      type: 's3'
      bucket: string
      region: string
    }
  }
  scaling: {
    maxSessionsPerInstance: number
    sessionAffinityTTL: number
  }
}
```

### State Handoff Implementation

```typescript
// Serialize session for handoff
async function exportSessionForHandoff(session: Session): Promise<ExportedSession> {
  return {
    config: session.config,
    state: serializeSessionState(session.state),
    actions: session.recorder.getAll(),
    logs: session.logRecorder.getAll(),
    connectionStates: Array.from(session.connections.values())
  }
}

// Import session on new instance
async function importSessionFromHandoff(exported: ExportedSession): Promise<Session> {
  const session = await sessionManager.create({
    id: exported.config.id,
    config: deserializeSessionConfig(exported.config)
  })
  // Restore state, actions, logs
  return session
}
```

## Server Info File

**File:** `src/utils/server-info.ts`

For standalone server port discovery:

```typescript
interface MockServerInfo {
  port: number
  startedAt: string              // ISO timestamp
  pid: number                    // Process ID
  gatewayUrl: string
  restApiUrl: string
  controlUrl?: string
}

// Location: .robo/mock/server.json

async function writeServerInfo(info: MockServerInfo): Promise<void>
async function readServerInfo(): Promise<MockServerInfo | null>
async function deleteServerInfo(): Promise<void>
async function isServerRunning(): Promise<boolean>  // Check if PID exists
```

## Key Files

| Purpose | Path |
|---------|------|
| Attachment Storage | `src/storage/attachment-storage.ts` |
| Session Storage | `src/session/storage.ts` |
| Persistence | `src/core/persistence.ts` |
| Recording Storage | `src/session/recording-storage.ts` |
| State Serialization | `src/session/state.ts` |
| Server Info | `src/utils/server-info.ts` |

## Summary

| Storage Type | Default | Future Hosted |
|--------------|---------|---------------|
| Sessions | In-memory Map | Redis |
| Attachments | In-memory Map | S3 |
| Actions | In-memory Array (LRU) | Redis streams |
| Logs | In-memory Array (LRU) | Redis streams |
| Recordings | File system JSON | S3 |
| Server Info | .robo/mock/server.json | Service discovery |
