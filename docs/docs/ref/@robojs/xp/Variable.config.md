# Variable: config

```ts
const config: object;
```

Configuration management for XP system

Provides comprehensive configuration management with validation, defaults,
and guild-specific overrides. All configuration changes are persisted to
Flashcore immediately.

**Features:**
- Guild-specific and global configuration
- Automatic validation with detailed error messages
- Standard defaults for easy setup
- Role rewards, multipliers, and No-XP zones
- Cache invalidation when using setGlobal

**Config Precedence** (highest to lowest):
1. Guild-specific config (via `config.set()`)
2. Global config defaults (via `config.setGlobal()`)
3. System defaults

## Type declaration

### get()

```ts
get: (guildId, options?) => Promise<GuildConfig> = getConfig;
```

Get guild configuration with all defaults applied

Retrieves guild configuration with all defaults applied
Primary entry point for reading guild configuration

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | Guild ID |
| `options`? | [`FlashcoreOptions`](Interface.FlashcoreOptions.md) | Optional Flashcore options (e.g., storeId for multi-store support) |

#### Returns

`Promise`\<[`GuildConfig`](Interface.GuildConfig.md)\>

Complete GuildConfig (never null, uses defaults if needed)

#### Example

```ts
// Default store
const config = await getConfig('123456789012345678')
if (config.cooldownSeconds > 0) {
  // Check cooldown before awarding XP
}

// Custom store (e.g., reputation system)
const repConfig = await getConfig('123456789012345678', { storeId: 'reputation' })
```

### getDefault()

```ts
getDefault: () => GuildConfig = getDefaultConfig;
```

Get default configuration

Returns default guild configuration

#### Returns

[`GuildConfig`](Interface.GuildConfig.md)

GuildConfig with all default values

#### Example

```ts
const defaults = getDefaultConfig()
console.log('Default cooldown:', defaults.cooldownSeconds) // 60
```

### getGlobal()

```ts
getGlobal: () => Promise<GlobalConfig> = getGlobalConfig;
```

Get global configuration defaults

Retrieves current global configuration defaults

Global config is shared across all stores as base defaults.

#### Returns

`Promise`\<[`GlobalConfig`](TypeAlias.GlobalConfig.md)\>

GlobalConfig (empty object if not set)

#### Example

```ts
const global = await getGlobalConfig()
console.log('Global cooldown:', global.cooldownSeconds ?? DEFAULT_COOLDOWN)
```

### set()

```ts
set: (guildId, partial, options?) => Promise<GuildConfig> = setConfig;
```

Update guild configuration with validation

Updates guild configuration with validation
Merges partial values with existing config

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | Guild ID |
| `partial` | `Partial`\<[`GuildConfig`](Interface.GuildConfig.md)\> | Partial config to merge |
| `options`? | [`FlashcoreOptions`](Interface.FlashcoreOptions.md) | Optional Flashcore options (e.g., storeId for multi-store support) |

#### Returns

`Promise`\<[`GuildConfig`](Interface.GuildConfig.md)\>

Complete merged GuildConfig

#### Throws

Error if validation fails

#### Example

```ts
// Default store
const updated = await setConfig('123...', {
  cooldownSeconds: 90,
  roleRewards: [
    { level: 5, roleId: '345678901234567890' }
  ]
})

// Custom store (e.g., reputation system)
const repUpdated = await setConfig('123...', {
  cooldownSeconds: 120
}, { storeId: 'reputation' })
```

### setGlobal()

```ts
setGlobal: (config) => Promise<void> = setGlobalConfig;
```

Set global configuration defaults

Updates global configuration defaults
Clears all guild config caches to force re-merge on next access

Global config is shared across all stores as base defaults.
Each store can then apply its own guild-specific overrides on top.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `config` | `Partial`\<[`GuildConfig`](Interface.GuildConfig.md)\> | Partial config to use as global defaults |

#### Returns

`Promise`\<`void`\>

#### Throws

Error if validation fails

#### Example

```ts
await setGlobalConfig({
  cooldownSeconds: 90,
  xpRate: 1.2
})
```

### validate()

```ts
validate: (config) => object = validateConfig;
```

Validate configuration object

Validates configuration object

Validates level curve configuration if present, including type-specific
parameter validation (positive numbers, sorted arrays, etc.).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `config` | `Partial`\<[`GuildConfig`](Interface.GuildConfig.md)\> | Partial config to validate |

#### Returns

`object`

Validation result with error messages

##### errors

```ts
errors: string[];
```

##### valid

```ts
valid: boolean;
```

#### Examples

```ts
const result = validateConfig({ cooldownSeconds: -10 })
if (!result.valid) {
  console.error('Errors:', result.errors)
}
```

```ts
const result = validateConfig({
  levels: {
    type: 'linear',
    params: { xpPerLevel: -100 }
  }
})
// result.valid: false
// result.errors: ['levels.params.xpPerLevel must be positive number']
```

## Examples

### Basic Configuration

```typescript
import { config } from '@robojs/xp'

// Get guild config (creates with defaults if not found)
const guildConfig = await config.get('123456789012345678')
console.log(`Cooldown: ${guildConfig.cooldownSeconds}s`)

// Update guild config
await config.set('123456789012345678', {
  cooldownSeconds: 120, // 2 minutes between XP awards
  xpRate: 1.5 // +50% XP boost for entire guild
})
```

### Role Rewards Configuration

```typescript
import { config } from '@robojs/xp'

// Configure role rewards with stack mode (users keep all qualifying roles)
await config.set('123456789012345678', {
  roleRewards: [
    { level: 5, roleId: '234567890123456789' },
    { level: 10, roleId: '345678901234567890' },
    { level: 25, roleId: '456789012345678901' }
  ],
  rewardsMode: 'stack', // Users accumulate all roles
  removeRewardsOnLoss: false // Keep roles even if user loses XP
})

// Configure with replace mode (only highest level role)
await config.set('123456789012345678', {
  rewardsMode: 'replace' // Users get only their highest qualifying role
})
```

### XP Multipliers (Premium Features)

```typescript
import { config } from '@robojs/xp'

// Set up multipliers for premium users
await config.set('123456789012345678', {
  multipliers: {
    user: {
      'premiumUserId1': 1.5, // +50% XP boost
      'vipUserId2': 2.0 // +100% XP boost (double XP)
    },
    role: {
      'boosterRoleId': 1.2, // +20% for server boosters
      'donorRoleId': 1.3 // +30% for donors
    }
  }
})

// Multipliers stack: user with both roles gets 1.2 * 1.3 = 1.56x total
```

### No-XP Zones Configuration

```typescript
import { config } from '@robojs/xp'

// Configure roles and channels to exclude from XP gains
await config.set('123456789012345678', {
  noXpRoles: [
    'mutedRoleId', // Muted users don't gain XP
    'botRoleId' // Bots don't gain XP
  ],
  noXpChannels: [
    'spamChannelId', // Spam channels don't award XP
    'botCommandsChannelId' // Command channels excluded
  ]
})
```

### Validation Before Updates

```typescript
import { config } from '@robojs/xp'

// Validate config before applying
const userConfig = {
  cooldownSeconds: -10, // Invalid: negative value
  xpRate: 'invalid' // Invalid: not a number
}

const validation = config.validate(userConfig)
if (!validation.valid) {
  console.error('Config validation failed:', validation.errors)
  // Errors: ['cooldownSeconds must be non-negative', 'xpRate must be a number']
} else {
  await config.set(guildId, userConfig)
}
```

### Global Defaults for Bot Networks

```typescript
import { config } from '@robojs/xp'

// Set global defaults for all guilds
await config.setGlobal({
  cooldownSeconds: 90, // Default 90s cooldown for all guilds
  xpRate: 1.0,
  rewardsMode: 'stack'
})

// Individual guilds can still override
await config.set('specificGuildId', {
  cooldownSeconds: 60 // This guild uses 60s instead of global 90s
})
```

### Default Configuration Setup

```typescript
import { config } from '@robojs/xp'

// Default config uses standard settings - no setup needed!
const defaultConfig = config.getDefault()
console.log(defaultConfig)
// {
//   cooldownSeconds: 60,
//   xpRate: 1.0,
//   rewardsMode: 'stack',
//   removeRewardsOnLoss: false,
//   ...
// }

// Get guild config with defaults applied
const guildConfig = await config.get('123456789012345678')
// Returns default configuration if not customized
```

## Remarks

- Config changes are validated before persistence
- Global config updates invalidate caches for consistency
- Default settings: 60s cooldown, 15-25 XP/msg, stack mode
- Multipliers stack multiplicatively (user * role * guild)
