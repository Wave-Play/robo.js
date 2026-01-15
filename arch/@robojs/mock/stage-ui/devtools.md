# DevTools Panel

## Overview

Floating, resizable developer console with 8 tabs for event inspection, state viewing, network monitoring, and testing utilities.

## Architecture

**Directory:** `src/app/components/devtools/`

**Main Component:** `DevToolsPanel.tsx`

**Context:** `DevToolsContext` + `DevToolsProvider`

**Storage:** localStorage (`stage_devtools_open`, `stage_devtools_height`)

### Context Interface

```typescript
interface DevToolsContextValue {
  isOpen: boolean
  toggle: () => void                 // Ctrl/Cmd+Shift+D
  open: (tab?: Tab) => void
  close: () => void
  initialTab?: Tab
  requestedTab?: Tab
  clearRequestedTab: () => void
  height: number
  setHeight: (height: number) => void
  isMaximized: boolean
  toggleMaximize: () => void
}
```

### Height Constraints

- Default: 400px
- Minimum: 200px
- Maximum: 70% viewport height
- Clamping applied during resize

## Keyboard Shortcut

**Ctrl/Cmd+Shift+D** - Toggle DevTools open/closed

## The 8 Tabs

### Tab 1: Events (EventLog.tsx)

Inspect all WebSocket events from Discord Gateway.

**Features:**
- Event type filtering (12 types)
- Search query (previews, type names, JSON)
- Left pane: Scrollable list with seq, badge, preview, timestamp
- Right pane: Full event detail with JSON expansion
- Auto-scroll detection (resumes on new events)
- Copy-to-clipboard on JSON

**Filterable Types:** state_sync, message_create, message_update, message_delete, interaction_create, interaction_response, typing_start, message_reaction_add/remove, connected, heartbeat

### Tab 2: State (StateViewer.tsx)

Inspect current session state and entity counts.

**Summary Bar:**
- Guilds, Channels, Members, Roles, Messages, Commands counts

**State Tree:**
- Connection (sessionId, isConnected, error)
- UI (selectedGuildId, selectedChannelId, showMembers)
- Bot User (name, ID, avatar)
- Statistics (event count, last heartbeat)
- Full nested view: guilds, channels, members, roles, users, commands

### Tab 3: Network (NetworkLog.tsx)

REST API client and call history.

**Client Tab:**
- Method selector (GET, POST, PUT, PATCH, DELETE)
- Path input with autocomplete (fetches from /api/stage/routes)
- JSON request body textarea
- Response display (status, duration, headers, body)

**Log Tab:**
- REST call history from `rest_call` events
- Filter by path, method, endpoint
- Split view: list + detail pane
- Detail shows: method, status, duration, path, timestamp, request/response bodies

### Tab 4: Performance (PerformanceMetrics.tsx)

Monitor bot interaction latency and throughput.

**Primary Metrics (6 cards):**
- Total Events
- Interactions (INTERACTION_CREATE)
- Responses (INTERACTION_RESPONSE)
- Messages (MESSAGE_CREATE)
- Avg Response Time (color-coded: <200ms=green, <500ms=yellow, >500ms=red)
- Events/minute

**Event Type Breakdown:**
- Top 8 event types by frequency
- Horizontal bar chart with percentages

### Tab 5: Tools (ToolsPanel.tsx)

Testing and debugging utilities.

**A. Test Data Generation**
- Generate comprehensive dataset
- Creates: 5 test users, 2 bot users, multiple guilds/channels
- Generates: 30+ test events over 45 seconds

**B. Loop Protection**
- Toggle to enable/disable
- Detects: 10+ MESSAGE_CREATE events in 1 second
- Action: 5-second cooldown
- API: `/api/control/sessions/{id}/loop-protection`

**C. Rate Limit Simulation**
- Enable/Disable toggle
- Retry-After: 1-60 seconds slider
- Mode: One-shot vs. Persistent
- Scope: all, messages, interactions, guilds, channels
- API: `/api/control/sessions/{id}/rate-limit`

**D. Message States Testing**
- "Show Bot is thinking..." button
- "Show Failed Message" button

**E. Voice States Testing**
- Add user to voice channel
- Add multiple users with mute/deaf states
- Remove user from voice
- Simulate user speaking (3s)
- Triggers VOICE_STATE_UPDATE events

**F. Components V2 Testing**
- TextDisplay + Separator
- Section + Thumbnail accessory
- Section + Button accessory
- MediaGallery (4 items)
- Container with accent color
- File component with spoiler
- Spoiler Container

**Toast Notifications:**
- Test buttons for info, success, warning, error

### Tab 6: Permissions (PermissionsPanel.tsx)

Test Discord permission enforcement.

**Enforcement Levels:**
- None: All operations allowed
- Basic: Simple permission checks
- Strict: Full Discord permission model

**Features:**

**A. Enforcement Level Selector**
- Three buttons to switch levels
- Shows current level and runtime override flag

**B. Quick Actions**
- Grant Admin: Add Administrator to all users
- Deny All: Deny SendMessages, ManageMessages, ManageChannels
- Reset: Clear all overrides

**C. Permission Overrides List**
- Target user ID (or "All Users" for *)
- Permission tags (grant=green, deny=red)
- Creation reason
- Delete button per override

**D. Permission Denied Log**
- Last 10 denied requests
- Timestamp, method, path, missing permissions
- Clear all button

### Tab 7: Emojis (EmojisPanel.tsx)

Manage custom guild emojis.

**A. Guild Selector**
- Dropdown lists all guilds
- Auto-selects first guild

**B. Emoji Grid**
- Shows all emojis for selected guild
- Preview (`:name:` format)
- Delete button per emoji

**C. Create Emoji Form**
- Name input (2-32 chars)
- Image uploader with preview
- Validation: PNG/GIF/JPEG, max 256KB
- Create button

**API:** `/api/control/sessions/{id}/emojis`

### Tab 8: Tests (TestResults.tsx)

Display automated test results and replay.

**A. Summary Bar**
- Status badge (running, passed, failed, error)
- Run ID
- Stats: total, passed, failed, skipped, duration
- Collapsible
- Refresh button

**B. Split Pane Layout**
- Left: File list with status icons, pass/fail counts
- Right: Detailed view with full path, status, duration, session ID

**C. Test Details**
- Status icon
- Test name
- Duration
- Error message and stack trace (if failed)
- Assertions list

**D. Assertion Details**
- Expandable items
- Pass/fail icon
- Description
- Expected vs actual values (JSON viewer)
- Diff text

**Actions:**
- View Logs: Opens Logs panel filtered to session
- Replay: Loads recording into playback mode

**Data Source:** `/api/control/tests/registry` (polls every 2s during tests)

## Resize and Maximize

**Resize Handle:**
- Top edge of panel (8px tall)
- Cursor: `ns-resize`
- Visual feedback on hover

**Drag Logic:**
- Tracks startY and startHeight
- Calculates delta (startY - currentY)
- Clamps to min/max constraints

**Maximized State:**
- Double-click header to toggle
- When maximized: height = 70% viewport
- Button shows maximize/restore icon
- Transition: 0.15s ease

**Persistence:**
- Height stored in localStorage
- Maximized state NOT persisted
- Open/closed state persisted

## Data Flow from Stores

### Store Connections

**PlaybackStore:**
- Used by: EventLog, NetworkLog, PerformanceMetrics, TestResults
- Data: events array, mode

**SessionStore:**
- Used by: StateViewer, ToolsPanel, PermissionsPanel, EmojisPanel
- Data: guilds, channels, members, messages, users, commands

**WebSocketStore:**
- Used by: DevTools context, TestResults
- Methods: sendCommand, disconnect, connect

**ToasterContext:**
- Used by: All tabs for user feedback

### API Endpoints

```
/api/control/sessions/{id}/dispatch        # Inject events
/api/control/sessions/{id}/loop-protection # Loop protection
/api/control/sessions/{id}/rate-limit      # Rate limit
/api/control/sessions/{id}/permissions/*   # Permissions
/api/control/sessions/{id}/emojis          # Emoji CRUD
/api/stage/routes                          # Autocomplete
/api/control/tests/registry                # Test results
```

## Key Files

| Component | Purpose |
|-----------|---------|
| DevToolsPanel.tsx | Main panel container |
| EventLog.tsx | Events tab |
| StateViewer.tsx | State tab |
| NetworkLog.tsx | Network tab |
| PerformanceMetrics.tsx | Performance tab |
| ToolsPanel.tsx | Tools tab |
| PermissionsPanel.tsx | Permissions tab |
| EmojisPanel.tsx | Emojis tab |
| TestResults.tsx | Tests tab |
