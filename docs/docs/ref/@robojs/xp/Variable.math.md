# Variable: math

```ts
const math: object;
```

MEE6-style level curve mathematics

Provides pure, deterministic functions for XP calculations using the MEE6
formula: `XP = 5 * level² + 50 * level + 100`

**Features:**
- Calculate XP requirements for levels
- Compute level from total XP
- Calculate progress within a level
- Validate XP and level values
- Compute XP differences between level ranges

**Performance:** All operations are O(1) or O(log n) - suitable for real-time use.

**Formula Coefficients:**
- CURVE_A (5): Quadratic coefficient - controls exponential growth
- CURVE_B (50): Linear coefficient - controls linear growth
- CURVE_C (100): Constant - base XP for level 1

## Type declaration

### computeLevelFromTotalXp()

```ts
computeLevelFromTotalXp: (totalXp) => LevelProgress;
```

Compute current level and progress from total XP

Computes current level and progress from total XP
Inverse calculation of totalXpForLevel

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `totalXp` | `number` | Total XP accumulated (must be >= 0) |

#### Returns

[`LevelProgress`](Interface.LevelProgress.md)

LevelProgress with current level, XP in level, and XP to next level

#### Example

```ts
computeLevelFromTotalXp(0)   // { level: 0, inLevel: 0, toNext: 155 }
computeLevelFromTotalXp(100) // { level: 0, inLevel: 100, toNext: 55 }
computeLevelFromTotalXp(155) // { level: 1, inLevel: 0, toNext: 220 }
computeLevelFromTotalXp(200) // { level: 1, inLevel: 45, toNext: 175 }
```

### isValidLevel()

```ts
isValidLevel: (level) => boolean;
```

Validate if a level is valid (non-negative)

Validates if a level is valid (non-negative integer)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `level` | `number` | Level to validate |

#### Returns

`boolean`

True if level is non-negative integer

#### Example

```ts
isValidLevel(0)    // true
isValidLevel(10)   // true
isValidLevel(-1)   // false
isValidLevel(1.5)  // true (implementation accepts fractional levels)
```

### isValidXp()

```ts
isValidXp: (xp) => boolean;
```

Validate if XP amount is valid (non-negative)

Validates if XP amount is valid (non-negative number)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `xp` | `number` | XP to validate |

#### Returns

`boolean`

True if XP is non-negative number

#### Example

```ts
isValidXp(0)     // true
isValidXp(1500)  // true
isValidXp(-100)  // false
isValidXp(1.5)   // true
```

### progressInLevel()

```ts
progressInLevel: (totalXp) => object;
```

Calculate progress within current level (absolute and percentage)

Calculates progress within current level as absolute values and percentage

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `totalXp` | `number` | Total XP accumulated |

#### Returns

`object`

Object with current XP in level, XP needed for next level, and percentage

##### current

```ts
current: number;
```

##### needed

```ts
needed: number;
```

##### percentage

```ts
percentage: number;
```

#### Example

```ts
progressInLevel(0)   // { current: 0, needed: 155, percentage: 0 }
progressInLevel(77.5) // { current: 77.5, needed: 155, percentage: 50 }
progressInLevel(155) // { current: 0, needed: 220, percentage: 0 }
progressInLevel(265) // { current: 110, needed: 220, percentage: 50 }
```

### totalXpForLevel()

```ts
totalXpForLevel: (level) => number;
```

Calculate cumulative XP needed to reach a level

Calculates cumulative XP needed to reach a level
This is the total XP required to be at the START of the specified level

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `level` | `number` | Target level (must be >= 0) |

#### Returns

`number`

Cumulative XP from level 0 to specified level

#### Example

```ts
totalXpForLevel(0) // 0
totalXpForLevel(1) // 155 (0 + 155)
totalXpForLevel(2) // 375 (155 + 220)
```

### xpDeltaForLevelRange()

```ts
xpDeltaForLevelRange: (fromLevel, toLevel) => number;
```

Calculate XP difference between two levels

Calculates XP difference between two levels
Useful for multi-level jumps and XP grants

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `fromLevel` | `number` | Starting level |
| `toLevel` | `number` | Target level |

#### Returns

`number`

XP delta (positive if toLevel > fromLevel, negative if toLevel < fromLevel)

#### Example

```ts
xpDeltaForLevelRange(0, 0)  // 0
xpDeltaForLevelRange(0, 1)  // 155
xpDeltaForLevelRange(1, 2)  // 220
xpDeltaForLevelRange(2, 1)  // -220
```

### xpNeededForLevel()

```ts
xpNeededForLevel: (level) => number;
```

Calculate XP required to reach a specific level from level 0

Calculates XP required to reach a specific level from level 0
Uses MEE6 formula: 5 * level^2 + 50 * level + 100

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `level` | `number` | Target level (must be >= 0) |

#### Returns

`number`

Total XP needed to reach the specified level

#### Throws

Error if level is negative

#### Example

```ts
xpNeededForLevel(0) // 0
xpNeededForLevel(1) // 155
xpNeededForLevel(2) // 220
xpNeededForLevel(10) // 1100
```

## Examples

### Basic Level Calculations

```typescript
import { math } from '@robojs/xp'

// Calculate XP needed to reach level 10 from level 0
const xpNeeded = math.xpNeededForLevel(10) // 1100

// Calculate cumulative XP needed to reach level 50
const totalXp = math.totalXpForLevel(50) // 137600

// Calculate XP difference between levels 10 and 20
const delta = math.xpDeltaForLevelRange(10, 20) // 2500
```

### Computing Level from XP

```typescript
import { math } from '@robojs/xp'

// Get current level and progress from total XP
const progress = math.computeLevelFromTotalXp(1500)
console.log(`Level ${progress.level}`) // Level 10
console.log(`Progress: ${progress.inLevel}/${progress.toNext}`) // Progress: 400/1200
```

### Building Progress Bars

```typescript
import { math } from '@robojs/xp'

// Calculate progress for UI display
const { percentage, inLevel, toNext } = math.progressInLevel(1500)
console.log(`${percentage.toFixed(1)}% to next level`) // 33.3% to next level

// Build a progress bar
const barLength = 20
const filled = Math.floor((inLevel / (inLevel + toNext)) * barLength)
const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled)
console.log(`[${bar}] ${inLevel}/${inLevel + toNext} XP`)
```

### Validating User Input

```typescript
import { math } from '@robojs/xp'

// Validate user input before setting XP
const userInput = parseInt(input)
if (!math.isValidXp(userInput)) {
  throw new Error('XP must be a non-negative number')
}

// Validate level before calculations
if (!math.isValidLevel(targetLevel)) {
  throw new Error('Level must be a non-negative number')
}
```

### Reward Planning

```typescript
import { math, constants } from '@robojs/xp'

// Calculate XP rewards for reaching milestones
const xpFor50 = math.totalXpForLevel(50)
const xpFor100 = math.totalXpForLevel(100)
const reward = Math.floor((xpFor100 - xpFor50) * 0.1) // 10% of XP difference

console.log(`Reward for level 100: ${reward} XP`)

// Use formula coefficients for custom calculations
const { CURVE_A, CURVE_B, CURVE_C } = constants
const customXp = (level: number) => CURVE_A * level ** 2 + CURVE_B * level + CURVE_C
```

## Remarks

All math functions are pure and deterministic - same inputs always produce
same outputs. No side effects or external dependencies. Safe for concurrent use.
