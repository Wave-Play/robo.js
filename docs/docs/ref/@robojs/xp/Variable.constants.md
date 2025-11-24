# Variable: constants

```ts
const constants: object;
```

Default configuration constants

These values represent the standard default configuration. Reference these
constants when:
- Building documentation or UI that references defaults
- Implementing custom XP calculations using the default formula
- Validating user input against default values
- Creating custom configurations that extend defaults

**Default Formula Coefficients:**
- **DEFAULT_CURVE_A (5)**: Quadratic coefficient - controls exponential growth rate
- **DEFAULT_CURVE_B (50)**: Linear coefficient - controls linear growth component
- **DEFAULT_CURVE_C (100)**: Constant term - base XP requirement for level 1
- **Formula**: `XP = 5*level² + 50*level + 100`

## Type declaration

### DEFAULT\_COOLDOWN

```ts
DEFAULT_COOLDOWN: number;
```

Default cooldown between XP awards (60 seconds)

### DEFAULT\_CURVE\_A

```ts
DEFAULT_CURVE_A: number;
```

Default level curve formula coefficient A (quadratic term: 5)

### DEFAULT\_CURVE\_B

```ts
DEFAULT_CURVE_B: number;
```

Default level curve formula coefficient B (linear term: 50)

### DEFAULT\_CURVE\_C

```ts
DEFAULT_CURVE_C: number;
```

Default level curve formula coefficient C (constant term: 100)

### DEFAULT\_LEADERBOARD\_PUBLIC

```ts
DEFAULT_LEADERBOARD_PUBLIC: boolean;
```

Default leaderboard visibility (false = restricted)

### DEFAULT\_REMOVE\_ON\_LOSS

```ts
DEFAULT_REMOVE_ON_LOSS: boolean;
```

Default remove rewards on XP loss (false = keep rewards)

### DEFAULT\_REWARDS\_MODE

```ts
DEFAULT_REWARDS_MODE: string;
```

Default rewards mode ('stack' = keep all role rewards)

### DEFAULT\_XP\_RATE

```ts
DEFAULT_XP_RATE: number;
```

Default XP rate multiplier (1.0 = no modification)

## Examples

### Reference Defaults in Documentation

```typescript
import { constants } from '@robojs/xp'

console.log(`Default cooldown: ${constants.DEFAULT_COOLDOWN}s`)
console.log(`Default XP rate: ${constants.DEFAULT_XP_RATE}x`)
console.log(`Default rewards mode: ${constants.DEFAULT_REWARDS_MODE}`)
```

### Use Formula Coefficients for Custom Calculations

```typescript
import { constants } from '@robojs/xp'

const { DEFAULT_CURVE_A, DEFAULT_CURVE_B, DEFAULT_CURVE_C } = constants

// Implement custom XP calculation
function calculateXpForLevel(level: number): number {
  return DEFAULT_CURVE_A * level ** 2 + DEFAULT_CURVE_B * level + DEFAULT_CURVE_C
}

// Calculate XP needed for level 50
const xpNeeded = calculateXpForLevel(50) // 15100
```

### Validate Against Defaults

```typescript
import { constants } from '@robojs/xp'

// Check if user config matches defaults
if (userConfig.cooldownSeconds === constants.DEFAULT_COOLDOWN) {
  console.log('Using default cooldown (60s)')
}

// Determine if custom XP rate is applied
const isCustomRate = guildConfig.xpRate !== constants.DEFAULT_XP_RATE
console.log(`Custom XP rate: ${isCustomRate ? 'Yes' : 'No'}`)
```

### Build Custom Config with Selective Overrides

```typescript
import { constants } from '@robojs/xp'

// Start with defaults, override specific values
const customConfig = {
  cooldownSeconds: constants.DEFAULT_COOLDOWN, // Keep default 60s
  xpRate: 1.5, // Override: +50% XP boost
  rewardsMode: constants.DEFAULT_REWARDS_MODE, // Keep default 'stack'
  removeRewardsOnLoss: false // Keep default behavior
}
```
