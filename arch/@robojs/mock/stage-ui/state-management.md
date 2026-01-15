# Stage UI State Management

## Overview

Composable store architecture using React Context with reducer pattern. Four specialized stores manage session state, playback, selection, and logging.

## Store Files

| Store | Purpose |
|-------|---------|
| `sessionStore.tsx` | Discord state + WebSocket connection |
| `playbackStore.tsx` | Event recording and replay |
| `unifiedSelectionStore.tsx` | Guild/channel selection |
| `logsStore.tsx` | Session logging with filtering |

## SessionStore

**File:** `src/app/stores/sessionStore.tsx` (~1284 lines)

### State Structure

```typescript
interface SessionState {
  // Connection
  sessionId: string | null
  isConnected: boolean
  isConnecting: boolean
  error: string | null

  // Discord data
  guilds: StageGuild[]
  channels: StageChannel[]
  members: StageMember[]
  roles: StageRole[]
  voiceStates: StageVoiceState[]
  users: StageUser[]
  messages: Record<string, StageMessage[]>  // channelId → messages
  commands: StageApplicationCommand[]
  botUser: StageUser | null

  // UI state
  selectedGuildId: string | null
  selectedChannelId: string | null
  showMembers: boolean
  currentUser: StageUser | null
  voicePanel: { channelId: string | null; mode: 'closed' | 'split' | 'full' }
  typingUsers: Record<string, TypingUser[]>
  activeModal: { modal: ModalData; sourceInteractionId: string } | null
  pendingInteractions: PendingInteraction[]
  pendingMessages: PendingMessage[]
  replyingTo: StageMessage | null

  // Diagnostics
  filteredEvents: FilteredEvent[]
  loopWarning: LoopWarning | null
  eventCount: number
  lastHeartbeat: number | null
}
```

### Action Types (39 actions)

**Connection:** SET_SESSION_ID, SET_CONNECTING, SET_CONNECTED, SET_ERROR

**State Sync:** HANDLE_STATE_SYNC

**Messages:** HANDLE_MESSAGE_CREATE, HANDLE_MESSAGE_UPDATE, HANDLE_MESSAGE_DELETE

**Reactions:** HANDLE_REACTION_ADD, HANDLE_REACTION_REMOVE

**Typing:** HANDLE_TYPING_START

**Voice:** HANDLE_VOICE_STATE_UPDATE

**Selection:** SELECT_GUILD, SELECT_CHANNEL

**UI State:** TOGGLE_MEMBERS, SET_VOICE_PANEL

**User:** SET_CURRENT_USER

**Stats:** INCREMENT_EVENT_COUNT, SET_HEARTBEAT

**Reset:** RESET

**Data Injection:** INJECT_MESSAGES, INJECT_MEMBERS, INJECT_CHANNELS, INJECT_USERS

**Modal:** SHOW_MODAL, CLOSE_MODAL

**Pending:** ADD_PENDING_INTERACTION, REMOVE_PENDING_INTERACTION, ADD_PENDING_MESSAGE, MARK_MESSAGE_FAILED, REMOVE_PENDING_MESSAGE

**Threads:** DELETE_THREAD

**DM:** ADD_DM_CHANNEL

**Reply:** SET_REPLYING_TO, CLEAR_REPLYING_TO

**Diagnostics:** ADD_FILTERED_EVENT, CLEAR_FILTERED_EVENTS, SET_LOOP_WARNING, CLEAR_LOOP_WARNING

### Reducer Highlights

- **Message Capping:** Keeps last 100 messages per channel
- **Thread Tracking:** Updates `message_count` on parent channel
- **Typing Expiry:** Sets `expiresAt` to `Date.now() + 10000`
- **Guild Selection:** Auto-selects first text/announcement channel

## WebSocketProvider

**Location:** Lines 735-1283 in `sessionStore.tsx`

### Interface

```typescript
interface WebSocketContextValue {
  connect: () => void
  disconnect: () => void
  sendCommand: <T>(type: string, data: unknown) => Promise<T>
  isConnected: boolean
  isConnecting: boolean
  error: string | null
  hasGivenUp: boolean
  isSessionInvalid: boolean
  retryCount: number
  retry: () => void
}
```

### Reconnection Logic

```typescript
const MAX_RECONNECT_ATTEMPTS = 5

// Exponential backoff delays
// Attempt 1: 1000ms (1s)
// Attempt 2: 2000ms (2s)
// Attempt 3: 4000ms (4s)
// Attempt 4: 8000ms (8s)
// Attempt 5: 16000ms (16s)
// Capped at: 30000ms (30s)
```

**Close Code Handling:**
- Code 1000: Intentional close (no retry)
- Code 4001: Session invalid (no retry)
- Other: Exponential backoff retry

### Event Handling

| Event | Action |
|-------|--------|
| connected | SET_CONNECTED: true |
| state_sync | HANDLE_STATE_SYNC |
| message_create | HANDLE_MESSAGE_CREATE |
| message_update | HANDLE_MESSAGE_UPDATE |
| message_delete | HANDLE_MESSAGE_DELETE |
| message_reaction_add | HANDLE_REACTION_ADD |
| message_reaction_remove | HANDLE_REACTION_REMOVE |
| typing_start | HANDLE_TYPING_START |
| voice_state_update | HANDLE_VOICE_STATE_UPDATE |
| command_response | Resolve pending promise |
| interaction_response | SHOW_MODAL / pending interaction |
| interaction_edit | REMOVE_PENDING_INTERACTION |
| heartbeat | SET_HEARTBEAT |
| event_filtered | ADD_FILTERED_EVENT |
| loop_detected | SET_LOOP_WARNING |
| session_invalid | Error state |

## PlaybackStore

**File:** `src/app/stores/playbackStore.tsx` (~714 lines)

### State Structure

```typescript
interface PlaybackState {
  mode: 'live' | 'playback'
  isPlaying: boolean
  currentTime: number          // ms from first event
  duration: number             // total ms
  speed: number                // 0.5x, 1x, 2x, 4x
  events: RecordedEvent[]
}
```

### RecordedEvent

```typescript
interface RecordedEvent {
  id: string
  seq: number
  type: StageEventType
  timestamp: number
  data: unknown
}
```

### Actions (8)

- SET_MODE
- SET_PLAYING
- SEEK
- SET_SPEED
- ADD_EVENT
- ADD_EVENTS
- CLEAR_EVENTS
- UPDATE_TIME

### Animation Loop

Uses `requestAnimationFrame` for smooth playback:

```typescript
const tick = (frameTime: number) => {
  if (lastFrameTimeRef.current !== null) {
    const delta = (frameTime - lastFrameTimeRef.current) * speed
    dispatch({ type: 'UPDATE_TIME', payload: currentTime + delta })
  }
  lastFrameTimeRef.current = frameTime
  animationFrameRef.current = requestAnimationFrame(tick)
}
```

### usePlaybackControls() Hook

```typescript
{
  mode, isPlaying, currentTime, duration, speed, events, eventCount,
  setMode, togglePlay, play, pause, seek, setSpeed,
  addEvent, addEvents, clearEvents,
  getEventsAtCurrentTime(), getEventMarkers()
}
```

### Playback Data Hooks

- `usePlaybackMessages(channelId)` - Reconstruct messages from events
- `usePlaybackTypingUsers(channelId)` - Reconstruct typing indicators
- `usePlaybackChannels(guildId)` - Extract channels from state_sync
- `usePlaybackMembers(guildId)` - Extract members from state_sync
- `usePlaybackGuilds()` - Extract guilds from state_sync
- `usePlaybackVoiceStates(guildId)` - Extract voice states from state_sync

## UnifiedSelectionStore

**File:** `src/app/stores/unifiedSelectionStore.tsx` (~186 lines)

### State Structure

```typescript
interface UnifiedSelectionState {
  selectedGuildId: string | null
  selectedChannelId: string | null
  liveGuildId: string | null       // Preserved for playback return
  liveChannelId: string | null     // Preserved for playback return
}
```

### Actions (5)

- SELECT_GUILD
- SELECT_CHANNEL
- SAVE_LIVE_SELECTION
- RESTORE_LIVE_SELECTION
- SET_SELECTION

### Mode Switch Logic

1. Entering playback: `saveLiveSelection()` stores current
2. Exiting playback: `restoreLiveSelection()` restores previous

## LogsStore

**File:** `src/app/stores/logsStore.tsx` (~636 lines)

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

type RelativeTimeRange =
  | 'last30m' | 'last1h' | 'last3h' | 'last6h' | 'last12h' | 'last24h'
  | 'last2d' | 'last7d' | 'last14d' | 'last30d' | 'everything'
```

### Context Methods (18)

**Panel Control:**
- isOpen, toggle, open, close, width, setWidth

**Log Management:**
- logs, addLog, addLogs, clearLogs

**Filtering:**
- filters, setLevelFilter, toggleLevelFilter, setSearchFilter
- setTimestampRange, setUsePlaybackRange, setSessionFilter
- openWithSessionFilter

**Computed:**
- filteredLogs, timeRange, setTimeRange
- recentCustomRanges, addRecentRange
- getTimeRangeBounds, timeFilteredLogs
- getTimeRangeLabel, getLogDensity

### LRU Eviction

Keeps max 10,000 log entries. At limit: removes oldest 1,000.

### localStorage Persistence

| Key | Stores |
|-----|--------|
| `stage_logs_open` | Panel open state |
| `stage_logs_width` | Panel width |
| `stage_logs_time_range` | TimeRange (JSON) |
| `stage_logs_recent_ranges` | Recent custom ranges |

### Convenience Hooks

```typescript
useLogs()           // Full context
useLogsPanel()      // Panel control
useLogsFilters()    // Filtering
useLogManagement()  // Log operations
useLogsTimeRange()  // Time filtering
```

## Store Integration

### Provider Stack Order

```
LogsProvider
  SessionProvider
    WebSocketProvider
      PlaybackProvider
        UnifiedSelectionProvider
          App
```

### Data Flow

```
WebSocket message
    ↓
parseEvent()
    ↓
SessionStore.dispatch(action)
    ↓
Updates SessionState
    ↓
UI components re-render
```

### Event → Store Mapping

| Event | SessionStore | PlaybackStore | LogsStore |
|-------|--------------|---------------|-----------|
| state_sync | HANDLE_STATE_SYNC | ADD_EVENT | - |
| message_create | HANDLE_MESSAGE_CREATE | ADD_EVENT | log_entry |
| message_update | HANDLE_MESSAGE_UPDATE | ADD_EVENT | - |
| message_delete | HANDLE_MESSAGE_DELETE | ADD_EVENT | - |
| interaction_response | SHOW_MODAL | ADD_EVENT | - |
| log_entry | - | - | addLog |

## Scenario: Send Message

```
1. UI: User types and sends
2. MessageInput: sendCommand('send_message', {content, channel_id})
3. WebSocketProvider: Creates command ID, sends via WebSocket
4. SessionStore: ADD_PENDING_MESSAGE (optimistic)
5. Server: Processes, sends message_create event
6. WebSocketProvider: handleEvent({type: 'message_create', ...})
7. PlaybackStore: ADD_EVENT (record)
8. SessionStore: HANDLE_MESSAGE_CREATE (update)
9. UI: Message appears in message area
```

## Scenario: Enter Playback

```
1. PlaybackControls: User clicks "Enter Playback"
2. PlaybackStore: SET_MODE: 'playback'
3. UnifiedSelectionStore: SAVE_LIVE_SELECTION
4. UI: Shows playback controls
5. usePlaybackMessages(): Returns reconstructed state
6. Message area: Renders from events
```

## Scenario: Reconnect

```
1. WebSocket.onclose: Called with code 1006
2. WebSocketProvider: isConnected=false
3. Check: Not code 1000 or 4001
4. Check: attempts < MAX_RECONNECT_ATTEMPTS
5. Calculate: exponential backoff delay
6. Schedule: setTimeout(connect, delay)
7. After delay: connect() fires
8. On success: Reset attempts, state_sync
```
