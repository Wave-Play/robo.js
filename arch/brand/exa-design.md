# Exa Design System

Exa Design is Robo's visual language: sharp, modern geometry with a strict **no rounded corners** rule. The aesthetic is Cyberpunk/Tron-inspired while remaining functional and approachable.

> **Related**: For brand terminology and capitalization, see [terminology.md](terminology.md). For UI copy patterns, see [ux-copy.md](ux-copy.md).

---

## Philosophy

### Core Principles

1. **Zero border radius** - No rounded corners anywhere, ever
2. **Sharp geometry** - Sloped corners, hexagons, angular shapes
3. **Dark-first** - Deep backgrounds with bright accents
4. **Fluid animation** - Smooth motion despite sharp edges

### Design Goals

- **Balanced complexity**: Rich, precise geometry with simple, predictable APIs
- **Futuristic but functional**: Looks cutting-edge without sacrificing usability
- **Distinctive identity**: Instantly recognizable, differentiated from "rounded everything" trends

---

## Visual Identity

### Technical Description

Angular dark-mode interface with hexagonal shape language. All containers use beveled hexagonal forms (Exa shapes) with zero border-radius. Primary backgrounds are near-black (#0a0e14 range) with subtle geometric overlays. Teal/cyan (#00d4aa range) serves as the primary accent for selections and active states. Selection states are indicated by glowing borders rather than fill changes. Layouts use grid-based structures with fixed-size slots. Diagonal magenta/red light beams create atmospheric depth on full-screen views. App icons use filled hexagons with centered glyphs and distinct background colors. Typography is clean sans-serif with high contrast against dark backgrounds.

### Evocative Description

The UI feels like operating a high-tech terminal in a sci-fi world. Everything is cut at angles—no soft edges exist. Dark backgrounds absorb light while teal borders glow like energy circuits. Diagonal laser beams slice through the background, giving depth to what could otherwise feel flat. When you select something, it doesn't just highlight—it illuminates, as if powering on. The whole aesthetic suggests you're interfacing with something digital and alive, not just browsing a menu.

---

## Shape System

### Shape Variants

#### Default (Sloped Rectangle)

The primary container shape with **two diagonal cuts** on opposing corners:

- **Top-left corner**: Sloped at 45° angle
- **Top-right corner**: Straight (90°)
- **Bottom-right corner**: Sloped at 45° angle
- **Bottom-left corner**: Straight (90°)

```
        slope
         ╱|‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾|
        ╱ |                 |
       |  |                 |
       |  |                 |
       |  |                 |
       |                  ╲ |
       |__________________|╲|
                           slope
```

**Used for:** Cards, modals, buttons, panels, containers

#### Hexagon (Horizontal)

- Flat top and bottom edges
- Pointed left and right vertices
- Width divided into 4 sections for point placement

```
       ╱‾‾‾‾‾‾‾‾╲
      ╱          ╲
     <            >
      ╲          ╱
       ╲________╱
```

**Used for:** Special emphasis, badges, status indicators

#### Hexagon2 (Vertical)

- Pointed top and bottom vertices
- Flat left and right edges
- Rotated variant for vertical layouts

```
          ╱╲
         ╱  ╲
        |    |
        |    |
         ╲  ╱
          ╲╱
```

**Used for:** Play buttons, action icons, primary CTAs

### Shape Parameters

| Parameter          | Default   | Description                     |
| ------------------ | --------- | ------------------------------- |
| `slope`            | 24px      | Diagonal corner cut size        |
| `innerBorderWidth` | 2px       | Stroke width                    |
| `opacity`          | 0.69      | Fill opacity (semi-transparent) |
| `innerColor`       | `#171b21` | Fill color                      |
| `outerColor`       | `#31363c` | Stroke color                    |

### Accent Edges

Optional colored lines that emphasize the angular geometry:

- **Sloped edge**: Traces the diagonal cut (top-left or bottom-right)
- **Horizontal edge**: Traces the bottom edge with corner treatments
- Default accent color: `#489178` (muted green)
- Can be inverted for right-side emphasis

---

## Color Palette

### Primary Accent Colors

| Name         | Hex       | RGB          | Usage                                |
| ------------ | --------- | ------------ | ------------------------------------ |
| Accent Gold  | `#F0B90B` | 240, 185, 11 | Primary CTAs, highlights, buttons    |
| Accent Dark  | `#F57F17` | 245, 127, 23 | Disabled gold states                 |
| Primary Teal | `#1DE9B6` | 29, 233, 182 | Secondary accent, particles, success |
| Highlight    | `#00BFA5` | 0, 191, 165  | Hover states                         |

### Background Colors (Dark Theme)

| Name              | Hex                      | Usage                   |
| ----------------- | ------------------------ | ----------------------- |
| Page Background   | `#0D1126`                | Deep blue-purple base   |
| Card Dark         | `#171b21`                | Container fill          |
| Card Border       | `#31363c`                | Container stroke        |
| Card Darker       | `#0a0b11`                | Animating/pressed state |
| Editor Background | `#1e1e1e`                | VS Code-inspired        |
| Input Background  | `#25272C`                | Text fields             |
| Overlay           | `rgba(26, 35, 126, 0.5)` | Atmospheric blur        |

### Text Colors

| Name      | Value                      | Usage                  |
| --------- | -------------------------- | ---------------------- |
| Primary   | `rgba(255, 255, 255, 1)`   | Main text, headings    |
| Secondary | `rgba(255, 255, 255, 0.7)` | Descriptions, hints    |
| Hint      | `rgba(255, 255, 255, 0.3)` | Placeholders, disabled |
| Accent    | `#F0B90B`                  | Links, emphasis        |

### State Colors

| State             | Hex       | Usage              |
| ----------------- | --------- | ------------------ |
| Online/Info       | `#2196F3` | Blue indicator     |
| Success           | `#4ec9b0` | Green/teal success |
| Error/Destructive | `#f44336` | Red text, borders  |
| Warning/Attention | `#FFD600` | Yellow indicator   |
| Offline/Muted     | `#546E7A` | Gray indicator     |

### Semantic Editor Colors

| Purpose         | Hex       | Usage                |
| --------------- | --------- | -------------------- |
| Info/Explain    | `#569cd6` | Questions, info mode |
| Plan/Caution    | `#dcdcaa` | Planning, warnings   |
| Execute/Success | `#4ec9b0` | Execution, success   |
| Error           | `#f44747` | Errors, destructive  |

---

## Typography

### Font Stack

```css
/* Sans-serif (UI) */
font-family: 'Roboto', 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;

/* Monospace (Code) */
font-family: 'JetBrains Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
```

### Type Scale

| Element       | Size | Weight | Line Height |
| ------------- | ---- | ------ | ----------- |
| Page title    | 24px | 600    | 1.2         |
| Section title | 20px | 600    | 1.2         |
| Card title    | 18px | 600    | 1.2         |
| Body          | 16px | 400    | 1.5         |
| Button        | 16px | 600    | 1.25        |
| Small/Meta    | 14px | 400    | 1.4         |
| Hint/Caption  | 12px | 400    | 1.3         |
| Micro         | 10px | 400    | 1.2         |

### Text Styling

- Headings: White, bold (600)
- Body: White or secondary (70% opacity)
- Links: Accent gold, no underline (underline on hover optional)
- Code: Monospace, slightly smaller
- Error text: Red (`#f44336`)

---

## Components

### ExaShape (Core Container)

The foundation component for all angular containers:

```tsx
import { ExaShape } from '@robojs/exa/react'
import { cardDark, cardDarkBorder, colorHighlight } from '@robojs/exa/core/colors'
;<ExaShape
	shape="default" // 'default' | 'hexagon' | 'hexagon2'
	slope={24} // Corner cut size in pixels
	innerColor={cardDark} // Fill color: #171b21
	outerColor={cardDarkBorder} // Stroke color: #31363c
	innerBorderWidth={2} // Stroke width
	opacity={0.69} // Fill opacity
	blur={true} // Enable backdrop blur
	clip={true} // Clip children to shape boundary
	highlight={true} // Highlight on hover
	highlightColor={colorHighlight} // Hover highlight: #00BFA5
	accentColor="#489178" // Accent edge color
	accentLineWidth={2} // Accent edge thickness
	padding={true} // Apply content padding
	onHover={(isHovered) => {}}
>
	{children}
</ExaShape>
```

### ExaButton

Button with angular borders and tactile feedback:

```tsx
import { ExaButton } from '@robojs/exa/react'
;<ExaButton
	preset="primary" // 'primary' | 'secondary' | 'danger'
	slope={12} // Tighter slope than containers
	disabled={false}
	onPress={() => {}}
>
	Continue
</ExaButton>
```

**Presets:**

| Preset    | Inner Color | Border Color | Text  |
| --------- | ----------- | ------------ | ----- |
| primary   | `#F0B90B`   | `#F0B90B`    | White |
| secondary | Card dark   | Card border  | White |
| danger    | Transparent | `#B71C1C`    | Red   |

**Specs:**

- Height: 48px default
- Slope: 12px (tighter than containers)
- Scale on press: 0.95x

### ExaGrow

Tactile hover wrapper for scale feedback:

```tsx
import { ExaGrow } from '@robojs/exa/react'
;<ExaGrow
	scale={1.05} // Scale factor on hover
	disabled={false}
	onHover={(isHovered) => {}}
>
	{children}
</ExaGrow>
```

**Specs:**

- Default scale: 1.05x
- Transition: 300ms ease-in-out

### ExaShake

Attention-grabbing animation for errors or emphasis:

```tsx
import { ExaShake } from '@robojs/exa/react'
;<ExaShake
	enabled={true}
	type="shake" // 'shake' | 'shiver'
	duration={300}
>
	{children}
</ExaShake>
```

**Animation Types:**

- `shake`: ±4° rotation oscillation
- `shiver`: Tiny movements + rotation (subtle vibration)

### ExaField

Text input with sharp borders:

```tsx
import { ExaField } from '@robojs/exa/react'
;<ExaField
	label="Email"
	placeholder="you@example.com"
	value={value}
	onChange={setValue}
	error="Invalid email" // Shows red border + message
	type="text" // 'text' | 'password' | 'email'
	disabled={false}
/>
```

**Specs:**

- Height: 48px
- Border width: 2px
- Background: `#25272C`
- Border transitions: gray → accent (focus) → red (error)

### ExaMenu

Dropdown menu with angular container:

```tsx
import { ExaMenu, ExaMenuItem } from '@robojs/exa/react'
;<ExaMenu open={isOpen} onClose={() => setOpen(false)} anchor={anchorElement}>
	<ExaMenuItem onPress={handleAction}>Action</ExaMenuItem>
	<ExaMenuItem onPress={handleDanger} danger>
		Delete
	</ExaMenuItem>
</ExaMenu>
```

**Specs:**

- Min width: 144px
- Background: `rgba(0, 0, 0, 0.8)` with blur
- Padding: 8px
- MenuItem height: 32px

### ExaCheckbox

Sharp square checkbox (not rounded):

```tsx
import { ExaCheckbox } from '@robojs/exa/react'
;<ExaCheckbox checked={isChecked} onChange={setChecked} label="Remember me" />
```

**Specs:**

- Size: 16x16px
- Border: 1px solid
- No border-radius (perfectly square)

---

## Animation

### Timing Standards

| Animation        | Duration | Easing      |
| ---------------- | -------- | ----------- |
| Hover feedback   | 300ms    | ease-in-out |
| Color transition | 300ms    | ease-in-out |
| Panel open/close | 300ms    | ease        |
| Menu open        | 150ms    | ease        |
| Modal entry      | 300ms    | spring      |
| Button press     | 200ms    | ease        |
| Page transition  | 400ms    | ease        |

### Animation Presets

```tsx
import { useAnimate } from '@robojs/exa/react'

// Fade in
const style = useAnimate({ preset: 'fade-in' })

// Scale in
const style = useAnimate({ preset: 'scale-in' })

// Slide up
const style = useAnimate({ preset: 'slide-up' })
```

| Preset        | Initial State                 | Final State               |
| ------------- | ----------------------------- | ------------------------- |
| `fade-in`     | opacity: 0                    | opacity: 1                |
| `fade-out`    | opacity: 1                    | opacity: 0                |
| `scale-in`    | scale: 0.9, opacity: 0        | scale: 1, opacity: 1      |
| `scale-out`   | scale: 1                      | scale: 1.08, opacity: 0   |
| `slide-up`    | translateY: 12px, opacity: 0  | translateY: 0, opacity: 1 |
| `slide-down`  | translateY: -12px, opacity: 0 | translateY: 0, opacity: 1 |
| `slide-left`  | translateX: 12px, opacity: 0  | translateX: 0, opacity: 1 |
| `slide-right` | translateX: -12px, opacity: 0 | translateX: 0, opacity: 1 |

### Spring Animation

For bouncy modal/panel entry:

```tsx
// CSS
transition-timing-function: cubic-bezier(0.175, 0.885, 0.32, 1.8);
```

### Animation Constants

```typescript
export const MenuOpenDuration = 150
export const OverlayAnimation = 300
export const RoboPanelDuration = 200
export const ViewPagerDuration = 400
export const AppOpenDuration = 500
```

---

## Icons & Indicators

### App Icons

- Size: 72x72px base
- Shape: ExaShape with 12px slope
- Nested structure: outer border + inner clipped image
- External link: diamond badge (16x16, rotated 45°)

```tsx
<ExaShape slope={12} clip>
	<Image src={appIcon} />
	{isExternal && <DiamondBadge />}
</ExaShape>
```

### Status Indicators

| State     | Color                  | Animation |
| --------- | ---------------------- | --------- |
| Online    | `#2196F3` (blue)       | None      |
| Starting  | `#64B5F6` (light blue) | Pulse     |
| Attention | `#FFD600` (yellow)     | Pulse     |
| Error     | `#F44336` (red)        | None      |
| Offline   | `#546E7A` (gray)       | None      |

**Indicator Specs:**

- Size: 8px dot or ring
- Pulse: scale 1 → 1.1 → 1 (infinite)

### Diamond Badge

- Used for: External links leaving the app
- Size: 16x16px
- Rotation: 45° (corner facing up)
- Sharp borders (no radius)

---

## Layout & Spacing

### Spacing Scale

| Token | Value |
| ----- | ----- |
| xs    | 4px   |
| sm    | 8px   |
| md    | 16px  |
| lg    | 24px  |
| xl    | 32px  |
| 2xl   | 48px  |

### Container Padding

| Container | Padding                        |
| --------- | ------------------------------ |
| Card      | 40px vertical, 48px horizontal |
| Modal     | 40px vertical, 48px horizontal |
| Button    | 16px horizontal                |
| Menu      | 8px                            |
| Menu item | 8px horizontal                 |

### Max Widths

| Element      | Max Width        |
| ------------ | ---------------- |
| Modal        | 512px            |
| Card         | 400px            |
| Content area | 1200px           |
| Input        | 100% (container) |

### Z-Index Scale

| Layer          | Z-Index |
| -------------- | ------- |
| Background     | 0       |
| Content        | 1       |
| Floating panel | 10      |
| Dropdown       | 20      |
| Modal overlay  | 30      |
| Modal          | 40      |
| Toast          | 50      |
| Tooltip        | 60      |

---

## Background Effects

### Particle System

```tsx
// tsparticles configuration
{
  particles: {
    color: { value: '#1DE9B6' },    // Teal
    opacity: { value: 0.25 },
    shape: { type: 'polygon', sides: 6 },  // Hexagons
    move: { speed: 5 }
  },
  emitters: {
    rate: { quantity: 1, delay: 0.25 }
  }
}
```

### Atmospheric Overlay

```css
/* Dream-like depth effect */
box-shadow: inset 0 0 144px rgba(26, 35, 126, 0.5);
```

---

## Anti-Patterns

### Never Do

| Don't                      | Why                           |
| -------------------------- | ----------------------------- |
| Use `border-radius`        | Use `slope` parameter instead |
| Use circles                | Use hexagons or squares       |
| Use soft drop shadows      | Use hard borders              |
| Use gradients for fills    | Use solid colors              |
| Use rounded buttons        | Use ExaButton                 |
| Use light theme as default | Dark-first always             |
| Use spinners               | Use skeleton loaders          |
| Use emoji in UI            | Against brand                 |

### Always Do

| Do                               | Why                   |
| -------------------------------- | --------------------- |
| Sharp corners with slope         | Core design language  |
| Dark backgrounds with light text | High contrast         |
| Gold/teal accents for emphasis   | Brand colors          |
| Scale animation on press         | Physical feedback     |
| 24px slope for containers        | Consistency           |
| 12px slope for buttons           | Tighter, more refined |

---

## Component Checklist

When building a new component:

- [ ] Uses ExaShape or respects shape parameters
- [ ] No `border-radius` anywhere
- [ ] Uses brand color palette
- [ ] Has hover state with highlight
- [ ] Has press state with scale
- [ ] Respects dark theme
- [ ] Uses proper spacing tokens
- [ ] Includes accessibility attributes

---

## Changelog

- **2026-01-02**: Initial Exa Design specification created.
