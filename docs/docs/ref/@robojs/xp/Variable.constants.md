# Variable: constants

```ts
const constants: object;
```

Default configuration constants

These values match MEE6 behavior for seamless migration. Reference these
constants when:
- Building documentation or UI that references defaults
- Implementing custom XP calculations using the MEE6 formula
- Validating user input against default values
- Creating custom configurations that extend defaults

**MEE6 Formula Coefficients:**
- **CURVE_A (5)**: Quadratic coefficient - controls exponential growth rate
- **CURVE_B (50)**: Linear coefficient - controls linear growth component
- **CURVE_C (100)**: Constant term - base XP requirement for level 1
- **Formula**: `XP = 5*level² + 50*level + 100`

## Type declaration

### CURVE\_A

```ts
CURVE_A: number;
```

MEE6 level curve formula coefficient A (quadratic term: 5)

### CURVE\_B

```ts
CURVE_B: number;
```

MEE6 level curve formula coefficient B (linear term: 50)

### CURVE\_C

```ts
CURVE_C: number;
```

MEE6 level curve formula coefficient C (constant term: 100)

### DEFAULT\_COOLDOWN

```ts
DEFAULT_COOLDOWN: number;
```

Default cooldown between XP awards (60 seconds) - MEE6 parity

### DEFAULT\_LEADERBOARD\_PUBLIC

```ts
DEFAULT_LEADERBOARD_PUBLIC: boolean;
```

Default leaderboard visibility (false = restricted) - MEE6 parity

### DEFAULT\_REMOVE\_ON\_LOSS

```ts
DEFAULT_REMOVE_ON_LOSS: boolean;
```

Default remove rewards on XP loss (false = keep rewards) - MEE6 parity

### DEFAULT\_REWARDS\_MODE

```ts
DEFAULT_REWARDS_MODE: string;
```

Default rewards mode ('stack' = keep all role rewards) - MEE6 parity

### DEFAULT\_XP\_RATE

```ts
DEFAULT_XP_RATE: number;
```

Default XP rate multiplier (1.0 = no modification) - MEE6 parity

## Examples

### Reference Defaults in Documentation

```typescript
import { constants } from '@robojs/xp'

console.log(`Default cooldown: ${constants.DEFAULT_COOLDOWN}s (MEE6 parity)`)
console.log(`Default XP rate: ${constants.DEFAULT_XP_RATE}x`)
console.log(`Default rewards mode: ${constants.DEFAULT_REWARDS_MODE}`)
```

### Use Formula Coefficients for Custom Calculations

```typescript
import { constants } from '@robojs/xp'

const { CURVE_A, CURVE_B, CURVE_C } = constants

// Implement custom XP calculation
function calculateXpForLevel(level: number): number {
  return CURVE_A * level ** 2 + CURVE_B * level + CURVE_C
}

// Calculate XP needed for level 50
const xpNeeded = calculateXpForLevel(50) // 15100
```

### Validate Against Defaults

```typescript
import { constants } from '@robojs/xp'

// Check if user config matches MEE6 defaults
if (userConfig.cooldownSeconds === constants.DEFAULT_COOLDOWN) {
  console.log('Using MEE6 default cooldown (60s)')
}

// Determine if custom XP rate is applied
const isCustomRate = guildConfig.xpRate !== constants.DEFAULT_XP_RATE
console.log(`Custom XP rate: ${isCustomRate ? 'Yes' : 'No'}`)
```

### Build Custom Config with Selective Overrides

```typescript
import { constants } from '@robojs/xp'

// Start with MEE6 defaults, override specific values
const customConfig = {
  cooldownSeconds: constants.DEFAULT_COOLDOWN, // Keep default 60s
  xpRate: 1.5, // Override: +50% XP boost
  rewardsMode: constants.DEFAULT_REWARDS_MODE, // Keep default 'stack'
  removeRewardsOnLoss: false // Keep default behavior
}
```
