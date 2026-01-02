# Codex CLI Task — Fix Small Visual Parity Issues (Discord Mock Server UI)

## Context
We have a working Discord-like mock UI, but there are several small visual parity issues that need polishing. Fix all items listed below.

### Required runtime for reproduction/validation
Codex CLI MUST reproduce and verify fixes using:
- Template: `templates/discord-bots/mockbot-ts`
- Run: `robo dev --mock` (or equivalent local Robo CLI invocation if `npx robo` is unavailable)
- Use the built-in Stage/Test tools panels to trigger states (message indicators, voice states, components v2, pins, etc.)
- Take care to visually verify each fix in the running UI before finalizing.

## Hard Rules
- **NO COMMENTED-OUT CODE** anywhere (`//`, `/* */`, `{/* */}`).
- Keep changes focused in `packages/@robojs/mock` unless a template config change is strictly required.
- No unrelated refactors.
- Do not weaken TS/ESLint rules to hide problems.
- Ensure changes don’t introduce regressions in hover/selected states.

## Tasks (Fix all 14)
### 1) Mute icon looks weird sometimes (voice channels)
Issue: In the voice channel member list, the mute icon appears visually “off” intermittently (alignment/size/baseline/cropping).
Fix:
- Inspect the voice member row layout and icon container sizing.
- Ensure consistent icon size, line-height, and vertical alignment.
- Ensure icons don’t jump when state toggles (muted/deafened/speaking).
- Confirm in UI by toggling voice states (join, mute, speaking).

### 2) “Bot is thinking” + “Failed Message” indicators overlap/appear like floating overlays
Issue: The “Bot is thinking…” indicator and “Failed message” indicator visually overlap content behind them, likely due to being rendered as overlay elements with a gray background instead of as normal message items.
Fix:
- These indicators should behave like Discord: render as standard messages in the message list flow (take vertical space, don’t overlap).
- Remove/avoid overlay positioning, absolute positioning, or background blocks that cause overlap.
- Apply the exact same fix pattern to BOTH indicators (thinking + failed).

### 3) Edited messages: hover buttons overlap messages below
Issue: When a message is marked edited, the top-right hover action buttons (“add reaction”, etc.) overlap the message below.
Fix:
- Ensure hover buttons are positioned within the message container without escaping into the next message row.
- Confirm z-index and positioning (avoid negative margins / absolute with wrong anchoring).
- Validate by hovering edited messages with a message immediately below.

### 4) Testing tools buttons overlap in Voice States (Phase 5P) and Components V2 (Phase 5Q)
Issue: Buttons in these tool cards overlap each other (likely layout/overflow/flex-wrap issue).
Fix:
- Ensure button stacks use a proper column layout with consistent gap and no negative margins.
- Ensure the card body can scroll if needed or expands naturally.
- Validate by resizing window and checking the entire tools panel layout.

### 5) Long channel names: settings icon overlaps text
Issue: For long channel names, the settings/gear icon overlaps the channel text. Expected: the icon stays pinned to the right edge, text truncates.
Fix:
- Implement proper flex row: `text` should truncate with ellipsis, icon should not shrink/overlap.
- Ensure hit targets remain correct.
- Validate with a very long channel name.

### 6) Voice channel names too far from microphone icon
Issue: Voice channel name text is spaced too far right from the mic icon.
Fix:
- Reduce left padding/margin or adjust icon/text gap to match Discord.
- Validate in channel list with voice channels.

### 7) Pins: “its context menu.” wraps incorrectly (Pro Tip section)
Issue: In the pinned messages empty state, the line “its context menu.” is separated/inline-wrapped incorrectly. It should read naturally as one sentence:
“Users with the 'Pin Messages' permission can pin a message from its context menu.”
Fix:
- Adjust markup so the sentence flows inline, not broken into separate blocks/lines.
- Ensure “PROTIP:” and following text match Discord-like typography/spacing.

### 8) Timestamp “AM” drops to next line
Issue: Message timestamp shows like:
`4:17` on one line and `AM` below. It should be inline: `4:17 AM`.
Fix:
- Ensure timestamp container doesn’t wrap mid-token.
- Use `white-space: nowrap;` where appropriate.
- Confirm for various timestamps and narrow widths.

### 9) Codeblock messages have too much vertical spacing
Issue: Messages containing codeblocks appear excessively spaced out (likely extra margins/padding from codeblock styling).
Fix:
- Inspect markdown/codeblock styles.
- Reduce top/bottom margins to match Discord density.
- Ensure codeblock still looks correct (padding, border radius, background) but doesn’t add huge whitespace.

### 10) Ephemeral message styling + dismiss control
Issue:
- Ephemeral messages should have:
  1) A small, subtle gray “Dismiss message” control (small X button or “Dismiss” link) like Discord.
  2) A very light, almost transparent blue-ish background treatment in the chat.
- Current UI shows an ephemeral callout but lacks the proper dismiss UI and background treatment.

Fix requirements:
- Add a small, low-contrast dismiss affordance on the ephemeral message (Discord-like).
- Add a subtle light-blue background tint (very low opacity), and keep the left accent bar.
- Dismiss should remove the ephemeral message from view (UI-only state is fine; no backend needed).
- Ensure hover states for the dismiss control match Discord (appears on hover or remains subtle).

Validation:
- Use the existing test tool that generates ephemeral messages.
- Confirm ephemeral message can be dismissed and disappears without breaking layout.

---

### 11) Notification setting selection indicator does not update (blue circle)
Issue:
- When changing notification settings (All Messages / Only @mentions / Nothing), the selected option is not visually marked with the blue filled indicator / selection ring as expected.

Fix requirements:
- The selected option MUST visually update immediately:
  - Blue filled dot/circle for selected option
  - Unselected options show empty ring
- This can be UI-only state, but it must persist while the menu is open and reflect the last selection.
- Ensure the click target and keyboard focus styling are reasonable.

Validation:
- Open the notification settings menu for a channel.
- Click each option and confirm the selection indicator updates correctly every time.

---

### 12) Thread panel missing close control (needs X)
Issue:
- When opening the thread panel, there is no small close “X” control to dismiss/close the thread view.
- Discord has an obvious close button in the thread panel header area.

Fix requirements:
- Add a close “X” button in the thread panel header (top right).
- It should close the thread panel and return to normal channel view.
- UI-only behavior is fine (local state in store/component).

Validation:
- Open the thread panel.
- Close it via the new X button.
- Confirm panel closes cleanly without layout glitches.

---

### 13) Components V2: Section + Thumbnail rendering causes blank space and overlap
Issue:
- When generating the "Section + Thumbnail" mock test:
  - A medium-sized blank area appears above/before the section.
  - Sometimes the thumbnail overlaps other messages above (should never overlap).
- This strongly suggests incorrect layout flow, wrong margins/padding, or absolute positioning.

Fix requirements:
- Remove the unintended blank space.
- Ensure section + thumbnail renders as a normal message block within message flow.
- Ensure thumbnail never overlaps adjacent messages:
  - Avoid absolute positioning for the thumbnail unless strictly contained.
  - Ensure container establishes correct height.
- Keep Discord-like spacing: the block should be compact and aligned.

### 14) Interaction reply indicator is missing
Issue:
- There is no interaction reply indicator that shows who used what command.
- Required behavior: when a user runs a slash command (e.g., `/ping`), the bot sends a message, and above that bot message there should be a small indicator like:
  - “[USER] used /ping”
- This indicator should visually match Discord’s interaction indicator style (small, subtle row above the message, with user + command).

Fix requirements:
- Implement the interaction indicator in the message list:
  - Render as a small row directly above the associated bot response message.
  - Should include:
    - The invoking user display name (or mention-like styling)
    - The command used (e.g., `/ping`)
- The indicator must appear for slash command-generated bot responses in the mock UI.
- If the current data model already stores interaction metadata, wire it correctly to the message render.
- If metadata is missing, extend the mock/stage state so slash-command tool actions attach:
  - `interaction: { userId, userName?, commandName }` (or repo-equivalent shape)
  to the message being created.
- Must be UI-only and deterministic for the mock environment.

## Implementation Guidance
- Prefer CSS/layout fixes over structural rewrites unless required for correct flow (especially for indicators in #2).
- Reuse existing style primitives/tokens already in the repo.
- Prefer fixing layout by using normal document flow (flex/grid) rather than absolute positioning.
- Reuse existing UI primitives and patterns in `@robojs/mock`.
- Keep diffs minimal, targeted, focused, and consistent with existing styling conventions.

## Required Validation (Must do before final output)
Codex CLI MUST run the project and visually verify each item:
1. Start mockbot: `templates/discord-bots/mockbot-ts` in mock mode.
2. Use the Stage/Test tools to trigger:
   - voice states (mute/speaking)
   - thinking + failed indicators
   - edited message hover
   - pins empty state
   - long channel names (create or mock)
   - codeblock messages (existing test data)
3. Confirm:
  - Bot sends a message
  - The indicator row appears above it
  - Shows the correct user + command
  - No overlap with hover buttons or other message UI
  - The message layout is consistent with existing styling conventions.
4. Validate each item:
     - Generate ephemeral message → verify blue tint + dismiss control works
     - Change notification option → verify blue selection dot updates
     - Open thread panel → verify close X works
     - Generate Section + Thumbnail → verify no blank space and no overlaps
     - Trigger /ping (or other slash) → verify interaction indicator appears above bot response
5. Ensure no new console errors or layout regressions.
6. Confirm each issue is resolved and no regressions appear.
- Trigger a slash command event in the mock UI (e.g., run `/ping` using existing test tooling).

## Deliverable
Provide a patch with:
- All 14 issues fixed
- Short summary: files changed + what was adjusted for each numbered item
- Confirmation that you ran the app and visually verified each fix

Now implement the fixes.
