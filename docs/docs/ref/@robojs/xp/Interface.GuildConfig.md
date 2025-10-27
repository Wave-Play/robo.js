# Interface: GuildConfig

Per-guild XP system configuration

All fields have sensible defaults matching MEE6 behavior.

## Example

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
 *   }
 * }
```

## Properties

### cooldownSeconds

```ts
cooldownSeconds: number;
```

Minimum seconds between XP awards for same user (default: 60)

***

### leaderboard

```ts
leaderboard: object;
```

Leaderboard visibility settings

| Name | Type |
| ------ | ------ |
| `public` | `boolean` |

***

### multipliers?

```ts
optional multipliers: object;
```

Optional per-role, per-user, and server-wide multipliers

| Name | Type |
| ------ | ------ |
| `role`? | `Record`\<`string`, `number`\> |
| `server`? | `number` |
| `user`? | `Record`\<`string`, `number`\> |

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

| Name | Type |
| ------ | ------ |
| `backgroundUrl`? | `string` |
| `embedColor`? | `number` |

***

### xpRate

```ts
xpRate: number;
```

Global XP multiplier for this guild (default: 1.0)
