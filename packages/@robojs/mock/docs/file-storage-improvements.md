# File Storage Improvements for Hosted Deployment

This document outlines strategies for improving file attachment storage when deploying `@robojs/mock` as a hosted service.

## Storage Interface (Already Implemented)

The storage layer is now abstracted via the `AttachmentStorage` interface, making it easy to swap backends:

```typescript
import {
  MemoryAttachmentStorage,
  createStorage,
  type AttachmentStorage
} from '@robojs/mock'

// Using the default in-memory storage
const storage = createStorage({ type: 'memory' })

// Future: Using S3 storage
const storage = createStorage({
  type: 's3',
  options: { bucket: 'my-bucket' }
})
```

### Interface Definition

```typescript
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

## Current Architecture

The current implementation stores attachments entirely in-memory:

```typescript
// Session state holds attachments in a Map
readonly attachments: Map<Snowflake, StoredAttachment>

interface StoredAttachment {
  id: Snowflake
  channelId: Snowflake
  messageId: Snowflake
  filename: string
  contentType: string
  size: number
  data: Uint8Array  // Binary data stored in memory
  width?: number
  height?: number
}
```

### Current Limitations

1. **Memory Pressure**: Each attachment consumes RAM equal to its file size
2. **No Persistence**: Attachments are lost when sessions end or server restarts
3. **Single Process**: Cannot scale horizontally without shared storage
4. **No Cleanup**: Long-running sessions accumulate attachments until explicitly deleted

---

## Improvement Options

### Option 1: File System Storage

**Best for**: Single-server deployments, simple setup

Store attachment data on the local file system instead of memory.

```typescript
interface FileSystemStorageConfig {
  basePath: string       // e.g., '/var/mock-discord/attachments'
  maxStorageBytes: number // Total storage limit
}

// File path pattern: {basePath}/{sessionId}/{channelId}/{attachmentId}/{filename}
```

**Implementation Changes**:
1. Replace `data: Uint8Array` with `filePath: string` in StoredAttachment
2. Write files asynchronously when storing
3. Stream files from disk in CDN endpoint
4. Add periodic cleanup job for expired sessions

**Pros**:
- Simple implementation
- No external dependencies
- Works with existing infrastructure

**Cons**:
- Limited to single server
- Disk I/O can become bottleneck
- Manual cleanup required

---

### Option 2: Object Storage (S3-Compatible)

**Best for**: Scalable cloud deployments

Use S3, MinIO, R2, or similar object storage for attachments.

```typescript
interface ObjectStorageConfig {
  endpoint: string        // S3 endpoint
  bucket: string          // Bucket name
  region?: string
  accessKeyId: string
  secretAccessKey: string
  prefix?: string         // Optional key prefix
}

// Object key pattern: {prefix}/{sessionId}/{channelId}/{attachmentId}/{filename}
```

**Implementation Changes**:
1. Add S3 client dependency (e.g., `@aws-sdk/client-s3`)
2. Upload files on store, delete on cleanup
3. Generate pre-signed URLs or proxy through CDN endpoint
4. Use lifecycle policies for automatic expiration

**Pros**:
- Horizontally scalable
- Built-in redundancy
- Automatic lifecycle management
- Cost-effective for large volumes

**Cons**:
- Requires external service
- Network latency for operations
- Additional cost

**Example Integration**:
```typescript
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

class S3AttachmentStorage {
  private client: S3Client
  private bucket: string

  async store(attachment: StoredAttachment): Promise<string> {
    const key = `${attachment.channelId}/${attachment.id}/${attachment.filename}`
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: attachment.data,
      ContentType: attachment.contentType,
      Metadata: {
        messageId: attachment.messageId,
        width: attachment.width?.toString(),
        height: attachment.height?.toString()
      }
    }))
    return key
  }

  async get(key: string): Promise<Uint8Array> {
    const response = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: key
    }))
    return new Uint8Array(await response.Body!.transformToByteArray())
  }
}
```

---

### Option 3: Redis with LRU Eviction

**Best for**: High-performance, distributed caching

Store attachments in Redis with automatic eviction of least-recently-used files.

```typescript
interface RedisStorageConfig {
  url: string             // Redis connection URL
  maxMemoryMB: number     // Memory limit for attachments
  keyPrefix: string       // Key prefix for namespacing
}

// Key pattern: {keyPrefix}:attachment:{attachmentId}
```

**Implementation Changes**:
1. Add Redis client (e.g., `ioredis`)
2. Store attachment data as binary strings
3. Use Redis `MAXMEMORY` policy for automatic eviction
4. Store metadata separately from binary data

**Pros**:
- Very fast access
- Automatic memory management via LRU
- Distributed across multiple servers
- Built-in TTL support

**Cons**:
- Memory-bound (expensive for large files)
- Data loss if Redis restarts without persistence
- Not ideal for files >10MB

---

### Option 4: Tiered Storage (Hybrid)

**Best for**: Production-grade deployments with mixed workloads

Combine multiple storage backends based on file characteristics.

```typescript
interface TieredStorageConfig {
  hot: {
    type: 'memory' | 'redis'
    maxBytes: number
    ttlSeconds: number
  }
  warm: {
    type: 'filesystem' | 's3'
    maxBytes: number
    ttlSeconds: number
  }
  cold: {
    type: 's3'
    bucket: string
    lifecycleDays: number
  }
}
```

**Storage Tiers**:
1. **Hot (Memory/Redis)**: Recent attachments, <1MB, accessed within 5 minutes
2. **Warm (Filesystem/S3)**: Older attachments, any size, accessed within 1 hour
3. **Cold (S3 with lifecycle)**: Archived attachments, automatic deletion after N days

**Implementation Changes**:
1. Add storage tier abstraction layer
2. Implement promotion/demotion logic
3. Background job for tier migration
4. Cache hot tier metadata for fast lookups

**Pros**:
- Optimized cost/performance ratio
- Handles varied access patterns
- Graceful degradation under load

**Cons**:
- Complex implementation
- More infrastructure to manage
- Potential latency spikes during tier transitions

---

## Migration Strategy

### Step 1: Abstract Storage Interface

Create a pluggable storage interface that the current in-memory implementation satisfies:

```typescript
interface AttachmentStorage {
  store(attachment: StoredAttachment): Promise<void>
  get(id: Snowflake): Promise<StoredAttachment | null>
  delete(id: Snowflake): Promise<boolean>
  getForMessage(messageId: Snowflake): Promise<StoredAttachment[]>
  cleanup(sessionId: string): Promise<number>
}

// Current implementation
class MemoryAttachmentStorage implements AttachmentStorage {
  private attachments = new Map<Snowflake, StoredAttachment>()
  // ... existing logic
}
```

### Step 2: Add Configuration

Allow storage backend selection via configuration:

```typescript
interface MockServerConfig {
  storage?: {
    type: 'memory' | 'filesystem' | 's3' | 'redis' | 'tiered'
    options?: Record<string, unknown>
  }
}
```

### Step 3: Implement Additional Backends

Add storage implementations as needed, starting with the most impactful for your use case.

---

## Recommendations by Scale

| Sessions | Files/Day | Recommended Storage |
|----------|-----------|---------------------|
| <10 | <100 | Memory (current) |
| 10-100 | 100-1000 | File System |
| 100-1000 | 1000-10000 | S3/Object Storage |
| 1000+ | 10000+ | Tiered Storage |

---

## Memory Budget Calculation

For planning purposes, estimate memory usage:

```
Memory per session = (avg_attachments × avg_file_size) + overhead

Example:
- 100 concurrent sessions
- 5 attachments per session average
- 500KB average file size
- 10% overhead

Memory = 100 × 5 × 500KB × 1.1 = 275MB

With 25MB max per message (10 files × 2.5MB):
Worst case per session = 250MB
100 sessions worst case = 25GB
```

---

## Implementation Priority

1. ~~**Immediate**: Add storage interface abstraction (no breaking changes)~~ ✅ **DONE**
2. **Short-term**: Implement file system storage for dev/staging
3. **Medium-term**: Add S3 storage for production scalability
4. **Long-term**: Consider tiered storage for cost optimization

The abstraction layer (Step 1) has been implemented. The `AttachmentStorage` interface and `MemoryAttachmentStorage` class are available, and `createStorage()` is ready for new backends.
