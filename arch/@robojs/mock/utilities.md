# Utility Functions

## Overview

14 utility files providing snowflake generation, token parsing, image processing, permission enforcement, and server configuration.

## File Structure

```
src/utils/
├── index.ts                 # Public exports
├── snowflake.ts             # Discord snowflake IDs
├── id.ts                    # Session/token generation
├── multipart.ts             # File upload parsing
├── image.ts                 # Image dimension detection
├── mention-parser.ts        # Mention syntax parsing
├── bot-user-resolver.ts     # Bot identity resolution
├── tls.ts                   # TLS certificate generation
├── permission-check.ts      # REST API permission enforcement
├── rate-limit-check.ts      # Rate limit simulation
├── server-info.ts           # Server discovery
├── server.ts                # Server configuration
├── json.ts                  # JSON serialization
└── notification-resolver.ts # User notification resolution
```

## Snowflake Generation

**File:** `src/utils/snowflake.ts`

Discord snowflake format (64-bit):
- Bits 63-22: Timestamp (ms since Discord Epoch 2015-01-01)
- Bits 21-17: Worker ID
- Bits 16-12: Process ID
- Bits 11-0: Increment (wraps at 4096)

```typescript
// Generate unique snowflake
generateSnowflake(): string

// Extract timestamp from snowflake
snowflakeToTimestamp(snowflake: string): number

// Create snowflake from timestamp
timestampToSnowflake(timestamp: number): string
```

## Session & Token Generation

**File:** `src/utils/id.ts`

```typescript
// Session ID: sess_<random>
generateSessionId(): string

// Interaction token (32 bytes, base64url)
generateInteractionToken(): string

// Gateway session ID (16 bytes, hex)
generateGatewaySessionId(): string

// Mock token format: <24>.<6 MOCK>.<27+>
createMockToken(sessionId: string): string

// Parse session ID from token
// Handles: mock:sess_xxx, Bot prefix, Discord-like format
parseMockToken(token: string): string | null
```

### Token Formats

**Simple format:** `mock:sess_abc123xyz789`

**Discord-like format:** `<base64_id>.<MOCK_marker>.<base64_session>`
- Part 1: Base64 of fake bot ID (24 chars)
- Part 2: Base64 of 'MOCK' marker (exactly 6 chars: `TU9DSw`)
- Part 3: Base64url of session ID

## Multipart Parsing

**File:** `src/utils/multipart.ts`

Parse file uploads in Discord message format:

```typescript
interface UploadedFile {
  filename: string
  contentType: string
  size: number
  data: Uint8Array
  isSpoiler: boolean              // filename starts with SPOILER_
}

interface ParsedMultipart {
  body: Record<string, unknown>   // payload_json parsed
  files: UploadedFile[]
}

// Parse multipart/form-data
parseMultipartMessage(request: Request): Promise<ParsedMultipart>

// Check if request is multipart
isMultipartRequest(request: Request): boolean
```

**Limits enforced:**
- Max 10 files per message
- Max 25MB total size
- Max 1024 char attachment description

## Image Dimension Detection

**File:** `src/utils/image.ts`

Extract dimensions without external dependencies:

```typescript
interface ImageDimensions {
  width: number
  height: number
}

// Main function (routes by MIME type)
getImageDimensions(data: Uint8Array, contentType: string): ImageDimensions | null

// Quick content-type check
isImageContentType(contentType: string): boolean

// Format-specific
getPngDimensions(data: Uint8Array): ImageDimensions | null   // bytes 16-23
getJpegDimensions(data: Uint8Array): ImageDimensions | null  // SOF0 marker
getGifDimensions(data: Uint8Array): ImageDimensions | null   // bytes 6-9
getWebpDimensions(data: Uint8Array): ImageDimensions | null  // RIFF container
```

**Supported formats:** PNG, JPEG, GIF, WebP (VP8, VP8L, VP8X)

## Mention Parsing

**File:** `src/utils/mention-parser.ts`

Parse Discord mention syntax:

```typescript
interface ParsedMentions {
  users: Snowflake[]      // <@id> or <@!id>
  roles: Snowflake[]      // <@&id>
  channels: Snowflake[]   // <#id>
  everyone: boolean       // @everyone
  here: boolean           // @here
}

class MentionParser {
  static parse(content: string): ParsedMentions
  static formatUserMention(userId: Snowflake): string       // <@123>
  static formatNicknameMention(userId: Snowflake): string   // <@!123>
  static formatRoleMention(roleId: Snowflake): string       // <@&123>
  static formatChannelMention(channelId: Snowflake): string // <#123>
  static hasMentions(content: string): boolean
  static stripMentions(content: string): string
}
```

## Bot User Resolution

**File:** `src/utils/bot-user-resolver.ts`

Three-tier fallback chain:

```typescript
interface ResolvedBotUser {
  config: MockUserConfig
  source: 'explicit' | 'discord-api' | 'default'
}

// Main resolution function
resolveBotUser(explicitConfig?: MockUserConfig): Promise<ResolvedBotUser>

// Fetch from Discord API (3s timeout)
fetchBotFromDiscord(token: string): Promise<DiscordAPIUser | null>
```

**Resolution order:**
1. Explicit config from `defaultSessionConfig.botUser`
2. Fetch via Discord API using `ROBO_MOCK_REAL_TOKEN`
3. Default "MockBot" fallback

## TLS Certificate Generation

**File:** `src/utils/tls.ts`

Self-signed certificates for Voice Gateway WSS:

```typescript
// Generate or return cached certificate
generateSelfSignedCert(): Promise<{ key: string; cert: string }>

// Clear cache (for testing)
clearCertCache(): void
```

**Parameters:**
- Key size: 2048 bits
- Validity: 365 days
- Algorithm: SHA256
- CN: localhost

## Permission Enforcement

**File:** `src/utils/permission-check.ts`

REST API permission checks:

```typescript
interface EnforcePermissionsOptions {
  body?: unknown
  messageId?: string
  messageAuthorId?: string
  targetUserId?: string
  targetRoleId?: string
}

// Returns Response if denied, null if allowed
enforcePermissions(
  session: Session,
  method: string,
  path: string,
  channelId?: string,
  guildId?: string,
  options?: EnforcePermissionsOptions
): Response | null

// Get enforcement level
getEnforcementLevel(session: Session): 'none' | 'basic' | 'strict'
```

**Enforcement levels:**
- `none`: Skip all checks
- `basic`: Check basic permissions
- `strict`: Full Discord permission system

## Rate Limit Simulation

**File:** `src/utils/rate-limit-check.ts`

```typescript
// Returns 429 Response if rate limited, null otherwise
checkRateLimitForEndpoint(session: Session, endpoint: string): Response | null
```

**Response includes:**
- Status: 429 (Too Many Requests)
- Headers: `Retry-After`, `X-RateLimit-*`
- Body: `{ message, retry_after, global }`

## Server Discovery

**File:** `src/utils/server-info.ts`

Port discovery between standalone server and bots:

```typescript
const STANDALONE_MOCK_PORT = 6625  // Phone keypad: M=6, O=6, C=2, K=5

interface MockServerInfo {
  port: number
  startedAt: string          // ISO timestamp
  pid: number                // Process ID
  gatewayUrl: string
  restApiUrl: string
  controlUrl?: string
}

// Write to .robo/mock/server.json
writeServerInfo(info: MockServerInfo): Promise<void>

// Read server info
readServerInfo(): Promise<MockServerInfo | null>

// Delete on shutdown
deleteServerInfo(): Promise<void>

// Check if server is running (validates PID)
isServerRunning(): Promise<boolean>
```

## Server Configuration

**File:** `src/utils/server.ts`

Get configuration from @robojs/server plugin:

```typescript
// Get full server config
getServerConfig(): ServerPluginConfig

// Get port (plugin config > PORT env > 3000)
getServerPort(): number

// Get hostname (plugin config > ROBO_HOSTNAME env > 'localhost')
getServerHostname(): string

// Get base URL
getMockServerUrl(): string  // 'http://localhost:3000'

// Get REST API URL
getMockRestApiUrl(): string // 'http://localhost:3000/api'

// Get plugin prefix (default: '/mock')
getMockPluginPrefix(): string

// Build Stage UI URL with session token
getStageUIUrl(sessionToken: string): string
// 'http://localhost:3000/mock/stage/?token=mock%3Asess_xxx'
```

## JSON Serialization

**File:** `src/utils/json.ts`

Handle BigInt and circular references:

```typescript
// BigInt to string replacer
bigIntReplacer(_key: string, value: unknown): unknown

// Handles both BigInt and circular references
createSafeReplacer(): (key: string, value: unknown) => unknown

// Safe stringify (drop-in replacement)
safeStringify(value: unknown, space?: string | number): string
```

**Usage:**
```typescript
// Discord.js objects have BigInt IDs
const safe = safeStringify(discordJsObject)
```

## Notification Resolution

**File:** `src/utils/notification-resolver.ts`

Determine which users to notify:

```typescript
interface NotificationResult {
  notifiedUsers: Set<Snowflake>
  mentionsCurrentUser: boolean
  mentionedChannels: Snowflake[]
  mentionedRoles: Snowflake[]
  mentionsEveryone: boolean
  mentionsHere: boolean
}

class NotificationResolver {
  // Resolve all notifications
  static resolve(
    message: MockMessage,
    state: MockServerState,
    currentUserId?: Snowflake
  ): NotificationResult

  // Quick check for specific user
  static mentionsUser(
    message: MockMessage,
    userId: Snowflake,
    state: MockServerState
  ): boolean

  // Count of notified users
  static getNotificationCount(
    message: MockMessage,
    state: MockServerState
  ): number
}
```

**Features:**
- Expands role mentions to member IDs
- @everyone: All guild members
- @here: Online members only (online/idle/dnd)
- Excludes message author

## Public Exports

**File:** `src/utils/index.ts`

```typescript
export * from './snowflake.js'    // Snowflake generation
export * from './id.js'           // Session/token IDs
export * from './json.js'         // JSON serialization
export * from './multipart.js'    // Form-data parsing
export * from './image.js'        // Image dimensions
export * from './server.js'       // Server configuration
```

Note: Some utilities (`permission-check.ts`, `mention-parser.ts`, etc.) are imported directly rather than re-exported.

## Key Files

| Purpose | Path |
|---------|------|
| Snowflake IDs | `src/utils/snowflake.ts` |
| Token Generation | `src/utils/id.ts` |
| File Uploads | `src/utils/multipart.ts` |
| Image Detection | `src/utils/image.ts` |
| Mention Parsing | `src/utils/mention-parser.ts` |
| Bot Resolution | `src/utils/bot-user-resolver.ts` |
| TLS Certs | `src/utils/tls.ts` |
| Permissions | `src/utils/permission-check.ts` |
| Rate Limits | `src/utils/rate-limit-check.ts` |
| Server Discovery | `src/utils/server-info.ts` |
| Server Config | `src/utils/server.ts` |
| JSON Helpers | `src/utils/json.ts` |
| Notifications | `src/utils/notification-resolver.ts` |
