# Stage UI Architecture

## Overview

React-based Discord-like testing interface with WebSocket-based real-time updates, event recording/playback, and comprehensive debugging tools.

## Entry Point

**File:** `src/app/index.tsx`

**Mode Detection:**
- `?tests=true` or `?testResults=true` → Test Results Mode
- `UI_ONLY` flag → Static UI Showcase (dev mode)
- Default → Live Mock Server Mode

**Session Initialization:**
```typescript
// Priority order
1. ?session=<value> or ?token=<value>   // URL parameter
2. localStorage.getItem('stage_session_id')  // Persisted session
3. null  // No session found
```

## Provider Stack

```
ToasterProvider                    // Toast notifications
  ↓
DevToolsProvider                   // DevTools panel state
  ↓
PlaybackProvider                   // Event recording/replay
  ↓
LogsProvider                       // Real-time log capture
  ↓
UnifiedSelectionProvider           // Guild/channel selection
  ↓
SessionProvider                    // Session state (guilds, channels, etc.)
  ↓
WebSocketProvider                  // Connection management
  ↓
App                                // Root component
```

## View Modes

### Mode 1: Live Mode (Default)

Full Discord-like interface connected to mock server:
- ConnectionScreen (when not connected)
- AppShell (main UI when connected)
- KeyboardShortcuts
- ConnectionStatusOverlay
- Modal (for bot-sent modals)
- DisclaimerModal (first-time legal notice)

### Mode 2: Test Results Mode

DevTools-focused view for test result inspection:
- DevToolsPanel auto-opened to Tests tab
- No WebSocket connection required
- Keyboard hint for DevTools toggle

### Mode 3: UI Only (Development)

Static showcase without live data:
- AppShell with frozen state
- For UI component development

## App.tsx Structure

```typescript
export default function App({ testResultsMode = false })

// Hooks
useSession()       // Session data + connection state
usePlayback()      // Recording/playback state
hasEverConnected   // Track successful connections
showConnectionScreen // Overlay toggle

// Render Paths
1. No Connection → ConnectionScreen (full screen)
2. Reconnecting → AppShell + Overlay ConnectionScreen
3. Connected → KeyboardShortcuts + StatusOverlay + AppShell + Modal
4. Test Results → Centered text + DevToolsPanel
```

## WebSocket Connection

### URL Building

```typescript
function buildStageWebSocketUrls(sessionId: string): string[]
  // Primary: {protocol}//{host}{basePath}/ws?token={encodedToken}
  // Fallback: {protocol}//{host}/stage/ws?token={encodedToken}
  // Token: mock:{sessionId}
```

### Connection Lifecycle

```
1. Validate sessionId exists
2. Check if already connected
3. Build WebSocket URLs (primary + fallback)
4. Try primary URL, fallback on failure
5. On success: SET_CONNECTED, reset retry counter
6. On close:
   - Code 1000: Intentional close (no retry)
   - Code 4001: Session invalid (no retry)
   - Other: Exponential backoff retry
7. Backoff: 1s → 2s → 4s → 8s → 16s → 30s (max 5 attempts)
8. After max attempts: hasGivenUp=true
```

### Event Handling

```typescript
handleEvent(event: StageEvent):
  1. Record to playbackStore
  2. Dispatch to sessionStore reducer
  3. Handle special events:
     - connected: Mark connection established
     - state_sync: Full state population
     - message_create: Append message
     - message_update: Update message
     - message_delete: Remove message
     - interaction_response: Show modal or clear thinking
     - event_filtered: Intent diagnostic
     - loop_detected: Circuit breaker alert
     - session_invalid: Close connection
```

### Command Sending (RPC)

```typescript
sendCommand<T>(type: string, data: unknown): Promise<T>
  1. Generate unique command ID
  2. Create StageCommand: { id, type, data }
  3. Store promise resolve/reject in pendingCommands
  4. Send JSON over WebSocket
  5. 30s timeout for response
  6. On command_response: resolve/reject promise
```

## Keyboard Shortcuts

**File:** `src/app/components/common/KeyboardShortcuts.tsx`

| Shortcut | Action |
|----------|--------|
| Ctrl/Cmd+K | Focus message input, prepend '/' if empty |
| Space | Toggle playback play/pause |
| Left Arrow | Seek backward 5 seconds |
| Right Arrow | Seek forward 5 seconds |
| Ctrl/Cmd+Shift+D | Toggle DevTools panel |
| Ctrl/Cmd+Shift+L | Toggle Logs panel |
| Escape | Close modals/dropdowns |

Note: Shortcuts disabled when in input/textarea/contentEditable fields.

## Styling Approach

### CSS Variables (discord-theme.css)

```css
--brand-primary: #5865F2 (Discord blurple)
--main-chat-background: Dark chat area
--sidebar-left-background: Dark sidebar
--card-background: Element backgrounds
--text-bright: Primary text
--text-muted: Secondary text
--text-link: Link color
```

### Global Styles (globals.css)

- Border-box sizing
- 100vh height for html/body/#root
- Discord-like scrollbar styling (8px)
- Focus states (2px solid brand-primary)

## Server Communication

### Command Flow

```
User Action (click, input, submit)
    ↓
useSession() hook method
    ↓
sendCommand(type, data) → WebSocketProvider
    ↓
ws.send(JSON command)
    ↓
[Network - WebSocket]
    ↓
Mock Server processes
    ↓
Stage Bridge forwards events
    ↓
UI receives command_response + side effects
```

### Available Commands

```typescript
sendMessage(content, channelId?, reference?)
invokeCommand(commandName, options?, channelId?)
clickButton(messageId, customId, channelId?)
selectOption(messageId, customId, values, channelId?)
addReaction(messageId, emoji, channelId?)
removeReaction(messageId, emoji, channelId?)
submitModal(customId, components)
invokeContextCommand(name, type, targetId, targetData, channelId?)
joinVoice(channelId, guildId?, userId?)
leaveVoice(guildId?, userId?)
```

### REST API Usage

Some operations use REST directly:
- `pinMessage` → PUT /api/v10/channels/{channelId}/pins/{messageId}
- `unpinMessage` → DELETE /api/v10/channels/{channelId}/pins/{messageId}
- `openDM` → POST /api/v10/users/@me/channels

## Key Files

| Purpose | Path |
|---------|------|
| Entry Point | `src/app/index.tsx` |
| Root Component | `src/app/App.tsx` |
| Session Store | `src/app/stores/sessionStore.tsx` |
| Playback Store | `src/app/stores/playbackStore.tsx` |
| Logs Store | `src/app/stores/logsStore.tsx` |
| Keyboard Shortcuts | `src/app/components/common/KeyboardShortcuts.tsx` |
| Main Layout | `src/app/components/layout/AppShell.tsx` |
| Connection Screen | `src/app/components/layout/ConnectionScreen.tsx` |
| Discord Theme | `src/app/styles/discord-theme.css` |
| Global Styles | `src/app/styles/globals.css` |
| WebSocket Utils | `src/app/utils/stage-websocket.ts` |
