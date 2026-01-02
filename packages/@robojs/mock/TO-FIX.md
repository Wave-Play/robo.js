# Codex CLI Task — Remaining UI Parity Fixes (Follow-up Pass)

## Context
Previous fixes improved the UI, but several issues remain. Fix all items below. Each item corresponds to the attached screenshots.

### Required runtime for reproduction/validation
Codex CLI MUST reproduce and validate using:
- Template: `templates/discord-bots/mockbot-ts`
- Run: `robo dev --mock` (or equivalent local Robo CLI invocation)
- Use Stage/Test tools to trigger: ephemeral messages, reactions, commands, components v2, and channel list behavior.
- Visually verify each item is fixed before finalizing.

## Hard Rules
- **NO COMMENTED-OUT CODE** anywhere (`//`, `/* */`, `{/* */}`).
- Keep changes focused in `packages/@robojs/mock` unless strictly necessary.
- No unrelated refactors.
- Do not hide issues by loosening TS/ESLint.
- Avoid absolute-position overlays that cause overlap; prefer normal document flow.

---

## Tasks (Fix all 9)

### 1) Test Tools buttons overflow outside their box
Issue:
- Buttons in the Stage/Test tools panel still overflow outside their container/card boundaries.

Fix requirements:
- Extend the containing card height OR make it layout correctly:
  - Ensure buttons wrap or the container grows.
  - If the tools panel is constrained, add `overflow: auto` and a proper internal scroll container.
  - Ensure padding/gap is consistent and no buttons are clipped.
- Must look correct at typical viewport sizes and when resizing.

Validation:
- Open Tools panel and confirm all buttons are fully visible and contained.

---

### 2) Message hover actions (“add reaction”) still overlap sometimes
Issue:
- The top-right hover actions still overlap adjacent content in some cases.

Fix requirements:
- Ensure hover actions are anchored inside the message container (not bleeding into previous/next message).
- Fix stacking context/z-index so hover controls do not cover other message headers/content.
- Ensure message container reserves enough space or handles hover overlays without collision.

Validation:
- Hover multiple messages (including edited messages and messages near each other) and confirm no overlap artifacts.

---

### 3) Ephemeral dismiss placement
Issue:
- The ephemeral “Dismiss message” control is positioned far right; it must be next to “Only you can see this”.

Fix requirements:
- In the ephemeral footer row, align “Only you can see this” and “Dismiss message” inline on the left area, like Discord.
- Ensure spacing is subtle (small gap) and the dismiss control remains low contrast.

Validation:
- Generate ephemeral message and confirm dismiss is adjacent to “Only you can see this”.

---

### 4) Slash command responses not sent by bot; interaction indicator missing
Issue:
- Running a command does not result in a bot response message in chat.
- Therefore the interaction reply indicator (e.g., “arqf used /ping”) never shows.

Fix requirements:
- Ensure the command trigger path creates a bot message in the selected channel.
- The bot response message must include interaction metadata so the UI can render the interaction indicator.
- Implement it for at least `/ping` (and preferably any slash test command path).
- UI-only is okay, but it must be deterministic and show in the message list.

Validation:
- Trigger `/ping` from the UI/tooling.
- Confirm:
  - A bot response message appears in the channel.
  - An interaction indicator row appears directly above the bot response (e.g., “[USER] used /ping”).
  - Indicator shows correct user and command.

---

### 5) Reaction picker shows no emoji options
Issue:
- Clicking “Add Reaction” opens something, but emoji options aren’t visible/selectable.

Fix requirements:
- Ensure an emoji picker/popup renders with visible emoji options.
- It does not need full functionality, but the UI must show selectable emoji items.
- Ensure it is positioned correctly relative to the message and not clipped by parent overflow.
- If there is a container with `overflow: hidden` clipping the picker, adjust via portal/overlay container or correct stacking context.

Validation:
- Click “Add Reaction” on a message.
- Confirm emoji options are visible (grid/list) and not clipped.

---

### 6) Excessive spacing between certain messages (embeds/code blocks/etc.)
Issue:
- Messages containing embeds/code blocks/components are adding too much spacing, and sometimes layout causes overlap risks.

Fix requirements:
- Normalize message vertical spacing so each message has consistent margins.
- Ensure message content blocks (embeds/codeblocks/components v2) do not introduce large external margins that push other messages away.
- Ensure no message content overlaps other message content (strict flow layout).
- Prefer adjusting component internal margins rather than adding global spacing hacks.

Validation:
- Scroll through sample messages (embeds, code blocks, components v2, normal text).
- Confirm consistent spacing and no odd large gaps.

---

### 7) Channel list alignment still off (names/icons/settings overlap)
Issue:
- Voice/text channel names shift right inconsistently.
- Channel icons also shift.
- Settings icon can appear on top of the channel name; it must be pinned to the far right and never overlap text.

Fix requirements:
- Implement a robust channel row layout:
  - Left: channel type icon
  - Middle: channel name text with ellipsis truncation
  - Right: settings icon area (fixed), never overlaps text
- Ensure consistent padding/indent for voice vs text channels.
- Ensure categories and channel rows align like Discord.

Validation:
- Use long channel names and normal names.
- Confirm text truncates and settings icon stays right-aligned.
- Confirm icon/name alignment is stable across channel types.

---

### 8) Ephemeral message should disappear on page refresh
Issue:
- Ephemeral message should not persist after refresh; it must be cleared on reload.

Fix requirements:
- Ephemeral messages must live only in memory (session state) and not persist via localStorage or any saved state.
- On page refresh, ephemeral messages should not be restored.
- If the state store persists messages, explicitly mark ephemeral messages as non-persisted and clear them on initialization.

Validation:
- Generate ephemeral message.
- Refresh the page.
- Confirm ephemeral message is gone.

---

### 9) Components V2: Section + Thumbnail and Section + Button still overlap other content
Issue:
- Section+Thumbnail and Section+Button components still overlap other message content, indicating incorrect layout sizing/positioning.

Fix requirements:
- Ensure these render as normal message blocks in flow.
- Remove absolute positioning that escapes message container.
- Ensure the container computes height properly (thumbnail/button should not float over neighbors).
- Ensure no overlap with the message above or below.

Validation:
- Generate Section+Thumbnail and Section+Button multiple times with messages above/below.
- Confirm no overlap and no extra blank space.

---

## Implementation Guidance
- Prefer fixing layout with flex/grid and correct padding/margins rather than absolute positioning.
- Fix clipping by using a portal/root overlay container if needed (for emoji picker), or by correcting overflow rules.
- Reuse existing primitives/styles.
- Keep diffs minimal and readable.

---

## Required Validation (Must do before final output)
Codex CLI MUST:
1. Run mockbot in mock mode.
2. Verify each numbered item via the UI and Stage/Test tools.
3. Confirm no new console errors and no new visual regressions.

---

## Deliverable
Provide a patch with:
- All 9 issues fixed
- Short summary mapping item number → what changed + files touched
- Confirmation that the app was run and visually verified for all items

Now implement the fixes.
