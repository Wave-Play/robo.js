# Stage UI Components

## Overview

~126 component files organized across 17 directories providing a complete Discord-like testing interface with virtualized message rendering, playback controls, and debugging tools.

## Directory Structure

```
src/app/components/
├── layout/       - Main application shell
├── sidebar/      - Left sidebar (servers, channels)
├── messages/     - Message rendering and input
├── members/      - Member list sidebar
├── playback/     - Playback control bar
├── modals/       - Modal dialogs
├── devtools/     - Developer tools panel
├── common/       - Shared utilities
├── context/      - Context menus
├── friends/      - Friends UI and DM system
├── threads/      - Thread panels
├── logs/         - Logs panel
├── icons/        - SVG icon components (30+)
├── base/         - Low-level UI primitives
├── ui/           - Basic reusable components
├── notifications/- Notification components
└── pinned/       - Pinned messages components
```

## Layout Components

**Directory:** `layout/`

| Component | Purpose |
|-----------|---------|
| AppShell.tsx | Main layout grid (sidebar + content + members) |
| StageAppShell.tsx | Stage-specific variant for recording mode |
| Header.tsx | Channel info bar with toggles |
| StatusBar.tsx | Bottom status (heartbeat, event count) |
| ConnectionScreen.tsx | Session connection overlay |
| ConnectionStatusOverlay.tsx | Real-time connection indicator |
| FilteredEventsWarning.tsx | Intent filtering warning |

## Sidebar Components

**Directory:** `sidebar/`

| Component | Purpose |
|-----------|---------|
| ServerList.tsx | Guild icons (vertical left edge) |
| ChannelList.tsx | Channels grouped by category |
| VoiceChannel.tsx | Voice channel with participant count |
| VoiceControlDock.tsx | Bottom voice controls |
| UserArea.tsx | Current user profile |
| UserControlBar.tsx | User settings buttons |
| UserSwitcher.tsx | Account switching |
| UserProfilePopout.tsx | User card popup |
| ServerMenu.tsx | Server context menu |
| CreateChannelModal.tsx | Channel creation modal |
| StatusEditorModal.tsx | Status editing modal |
| UserSettingsModal.tsx | User preferences modal |
| ControlIconButton.tsx | Reusable icon button |

## Message Components

**Directory:** `messages/`

### Core Components

| Component | Purpose |
|-----------|---------|
| MessageArea.tsx | Virtualized message container |
| Message.tsx | Single message with all content |
| MessageInput.tsx | Text input with autocomplete |
| PendingMessage.tsx | Optimistic message (sending/failed) |
| TypingIndicator.tsx | "X is typing..." indicator |
| ThinkingIndicator.tsx | "Bot is thinking..." indicator |

### Rich Content

| Component | Purpose |
|-----------|---------|
| Embed.tsx | Discord embeds |
| Attachments.tsx | File/image/video attachments |
| MediaGallery.tsx | Grid layout for multiple images |
| Reactions.tsx | Emoji reactions with counts |
| Button.tsx | Interactive buttons |
| SelectMenu.tsx | Dropdown select menus |
| ComponentRow.tsx | Action row container |

### Special Views

| Component | Purpose |
|-----------|---------|
| ForumChannelView.tsx | Forum with thread list |
| VoiceChannelView.tsx | Voice channel participants |

### Interactive Features

| Component | Purpose |
|-----------|---------|
| CommandAutocomplete.tsx | Slash command suggestions |
| CommandOptionInput.tsx | Command option fields |
| MentionAutocomplete.tsx | @ mention autocomplete |
| EphemeralBadge.tsx | Ephemeral message indicator |
| TextDisplay.tsx | Markdown text rendering |
| Separator.tsx | Visual divider |
| Thumbnail.tsx | Image thumbnail |
| FileComponentV2.tsx | V2 file display |

### Virtualization

Uses `@tanstack/react-virtual` for 100+ messages.

**Height Estimation:**
- Message header: 44px (if first in group)
- Content: ~19px per line
- Code blocks: lines × 18 + 24px padding
- Embeds: 104px base + fields + images
- Attachments: 64-300px depending on type
- Components: 40px per action row
- Date dividers: 40px

**Message Grouping:**
- Same author + within 5-minute window
- Reduces avatar repetition

## Playback Controls

**File:** `playback/PlaybackControls.tsx`

| Feature | Description |
|---------|-------------|
| Mode Toggle | Live/Playback modes |
| Transport | Skip, rewind 5s, play/pause, forward 5s, skip |
| Timeline | Drag-to-seek progress bar |
| Event Markers | Clickable markers for events |
| Log Density | 50-point histogram |
| Speed Control | 0.5x, 1x, 2x, 4x |
| Time Display | Current/Duration (MM:SS) |
| Event Counter | Total events recorded |
| Logs Toggle | Open/close logs panel |
| DevTools Toggle | Open DevTools |
| Clear Button | Erase recorded events |

## Modal System

**Directory:** `modals/`

**Modal.tsx Features:**
- Form validation (required, min/max length)
- Error display per field
- Escape to close
- Click outside to close
- Submit state handling
- Error clearing on input

## DevTools Panel

**File:** `devtools/DevToolsPanel.tsx`

8 tabs: Events, State, Network, Performance, Tools, Permissions, Emojis, Tests

(See devtools.md for detailed documentation)

## Members List

**Directory:** `members/`

| Component | Purpose |
|-----------|---------|
| MemberList.tsx | Right sidebar grouped by role |
| UserProfilePopout.tsx | User card with profile info |

## Friends UI

**Directory:** `friends/`

| Component | Purpose |
|-----------|---------|
| FriendsAppShell.tsx | Friends/Home view layout |
| FriendsMain.tsx | Main friends content |
| FriendsList.tsx | List of friend users |
| ActiveNowPanel.tsx | Online friends panel |
| FriendsOnlinePanel.tsx | Online status panel |
| FriendsAllPanel.tsx | All friends panel |
| DirectMessageHeader.tsx | DM header bar |
| DirectMessageView.tsx | DM conversation view |

## Threads

**Directory:** `threads/`

| Component | Purpose |
|-----------|---------|
| ThreadPanel.tsx | Side panel for viewing/creating |
| ThreadList.tsx | List of threads in channel |

## Common Utilities

**Directory:** `common/`

| Component | Purpose |
|-----------|---------|
| ErrorBoundary.tsx | React error boundary |
| Toaster.tsx | Toast notification system |
| EmojiPicker.tsx | Emoji picker modal |
| Markdown.tsx | Markdown rendering |
| Portal.tsx | React portal utility |
| Skeleton.tsx | Loading skeleton |
| KeyboardShortcuts.tsx | Global keyboard handler |

## Logs Panel

**Directory:** `logs/`

| Component | Purpose |
|-----------|---------|
| LogsPanel.tsx | Sliding right panel |
| LogEntry.tsx | Single log with ANSI support |
| LogFilters.tsx | Level filtering |
| LogSearchBar.tsx | Text search |
| LogDensityGraph.tsx | Timeline histogram |
| TimeRangePicker.tsx | Time range selection |
| AnsiText.tsx | ANSI color rendering |

## Base Components

**Directory:** `base/`

| Component | Purpose |
|-----------|---------|
| DropdownContainer.tsx | Dropdown/popover wrapper |
| ListItem.tsx | List item with selection |
| useDropdown.ts | Dropdown open/close hook |

## UI Components

**Directory:** `ui/`

| Component | Purpose |
|-----------|---------|
| Avatar.tsx | User avatar with fallback |
| IconButton.tsx | Icon-only button |
| SearchInput.tsx | Search input with icon |

## Context Menus

**Directory:** `context/`

| Component | Purpose |
|-----------|---------|
| ContextMenu.tsx | Right-click menu for messages/users |

## Icons

**Directory:** `icons/`

30+ SVG icon components:
- channel, channel_lock, voice_channel, forum, thread
- mic, phone, screen_share, video, headphones
- emoji, stickers, gif, gift
- pin, notification, quests, shop, signal
- magnifying_glass, cogwheel, equalizer, file
- apps, create, invite

## Component Statistics

| Metric | Count |
|--------|-------|
| Total Component Files | ~126 |
| TSX Components | ~104 |
| Type/Utility Files | ~22 |
| Icon Components | 30+ |
| Directories | 17 |
| Layout Components | 7 |
| Sidebar Components | 14 |
| Message Components | 25+ |
| DevTools Tabs | 8 |
