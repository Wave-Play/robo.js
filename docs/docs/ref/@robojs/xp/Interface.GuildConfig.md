# Interface: GuildConfig

Per-guild XP system configuration

All fields have sensible defaults matching standard behavior.

## Examples

```ts
{
 *   cooldownSeconds: 120,
 *   xpRate: 1.5,
 *   noXpRoleIds: ['123456789012345678'],
 *   noXpChannelIds: ['234567890123456789'],
 *   roleRewards: [
 *     { level: 5, roleId: '345678901234567890' },
 *     { level: 10, roleId: '456789012345678901' }
 *   ],
 *   rewardsMode: 'stack',
 *   removeRewardOnXpLoss: true,
 *   leaderboard: { public: true },
 *   multipliers: {
 *     server: 2.0,
 *     role: { '567890123456789012': 1.5 },
 *     user: { '678901234567890123': 0.5 }
 *   },
 *   theme: {
 *     embedColor: 0x5865F2,
 *     backgroundUrl: 'https://example.com/background.png'
 *   },
 *   labels: {
 *     xpDisplayName: 'Reputation'
 *   }
 * }
```

```ts
Common terminology alternatives:
- 'Reputation' - For community reputation systems
- 'Points' - For point-based reward systems
- 'Karma' - For Reddit-style karma systems
- 'Credits' - For economy/currency systems
- 'Stars' - For achievement/rating systems
```

## Properties

### cooldownSeconds

```ts
cooldownSeconds: number;
```

Minimum seconds between XP awards for same user (default: 60)

***

### labels?

```ts
optional labels: object;
```

Optional custom terminology for XP system branding

| Name | Type | Description |
| ------ | ------ | ------ |
| `xpDisplayName`? | `string` | Custom display name for XP (e.g., 'Reputation', 'Karma', 'Points') **Default** `'XP'` |

***

### leaderboard

```ts
leaderboard: object;
```

Leaderboard visibility settings

| Name | Type | Description |
| ------ | ------ | ------ |
| `public` | `boolean` | Whether the leaderboard is publicly visible **Default** `false` |

***

### levels?

```ts
optional levels: LevelCurveConfig;
```

Level curve configuration defining how XP maps to levels

Controls the progression curve for this guild/store. Supports four preset types:
- 'quadratic': Smooth, accelerating growth (default)
- 'linear': Constant XP per level
- 'exponential': Rapid, accelerating growth (requires level cap)
- 'lookup': Hand-tuned thresholds from array

Each store can have a different curve (e.g., default store uses quadratic,
reputation store uses linear). Configuration is stored in Flashcore and can
be set via XP.config.set() or /xp config commands.

#### Default

```ts
Quadratic curve with default values (a=5, b=50, c=100)
```

#### Examples

```ts
Linear curve with 100 XP per level
{
  levels: {
    type: 'linear',
    params: { xpPerLevel: 100 }
  }
}
```

```ts
Lookup table with custom thresholds
{
  levels: {
    type: 'lookup',
    params: {
      thresholds: [0, 100, 250, 500, 1000, 2000, 5000]
    }
  }
}
```

```ts
Exponential curve with level cap
{
  levels: {
    type: 'exponential',
    params: { base: 1.5, multiplier: 100 },
    maxLevel: 50
  }
}
```

#### Remarks

Per-store configuration enables multi-dimensional progression systems:
- Default store: Standard quadratic leveling
- Reputation store: Linear progression (100 XP per level)
- Combat store: Exponential prestige levels

Configuration precedence (highest to lowest):
1. PluginOptions.levels.getCurve callback (code-based)
2. GuildConfig.levels preset (stored in Flashcore)
3. Default quadratic curve (a=5, b=50, c=100)

***

### multipliers?

```ts
optional multipliers: object;
```

Optional per-role, per-user, and server-wide multipliers

| Name | Type | Description |
| ------ | ------ | ------ |
| `role`? | `Record`\<`string`, `number`\> | Per-role multipliers (roleId → multiplier) |
| `server`? | `number` | Server-wide multiplier applied to all users (stacks with xpRate) |
| `user`? | `Record`\<`string`, `number`\> | Per-user multipliers (userId → multiplier) |

***

### noXpChannelIds

```ts
noXpChannelIds: string[];
```

Messages in these channels don't award XP (default: [])

***

### noXpRoleIds

```ts
noXpRoleIds: string[];
```

Users with these roles don't gain XP (default: [])

***

### removeRewardOnXpLoss

```ts
removeRewardOnXpLoss: boolean;
```

Remove roles when user loses levels (default: false)

***

### rewardsMode

```ts
rewardsMode: RewardsMode;
```

How role rewards stack (default: 'stack')

***

### roleRewards

```ts
roleRewards: RoleReward[];
```

Roles awarded at specific levels (default: [])

***

### theme?

```ts
optional theme: object;
```

Optional theme customization for rank and leaderboard embeds

| Name | Type | Description |
| ------ | ------ | ------ |
| `backgroundUrl`? | `string` | Reserved for future web-based rank card renderer |
| `embedColor`? | `number` | Custom embed color in hex (e.g., 0x5865F2 for Discord Blurple) |

***

### xpRate

```ts
xpRate: number;
```

Global XP multiplier for this guild (default: 1.0)
