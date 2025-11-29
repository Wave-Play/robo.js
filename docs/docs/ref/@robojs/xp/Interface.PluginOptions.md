# Interface: PluginOptions

Plugin configuration options for @robojs/xp

Configure global defaults that apply to all guilds.
Individual guilds can override these via /xp config commands or the XP.config.set() API.

## Example

```ts
// config/plugins/robojs/xp.ts
import type { PluginOptions } from '@robojs/xp'

export default {
  defaults: {
    cooldownSeconds: 90,
    xpRate: 1.5,
    labels: { xpDisplayName: 'Reputation' },
    multipliers: { server: 2.0 },
    roleRewards: [
      { level: 5, roleId: 'ROLE_ID_HERE' },
      { level: 10, roleId: 'ROLE_ID_HERE' }
    ]
  }
} satisfies PluginOptions
```

## Properties

### defaults?

```ts
optional defaults: Partial<GuildConfig>;
```

Global XP configuration defaults (optional)

***

### levels?

```ts
optional levels: object;
```

Advanced level curve customization

Provides code-based, per-guild/per-store curve logic via the getCurve callback.
This is the highest precedence configuration option, overriding both guild
config presets and default quadratic curve.

| Name | Type | Description |
| ------ | ------ | ------ |
| `getCurve`? | (`guildId`, `storeId`) => `null` \| `LevelCurve` \| `Promise`\<`null` \| `LevelCurve`\> | Curve factory callback for advanced per-guild/per-store customization May be synchronous or asynchronous. Return null to fall through to guild config preset or default curve. **Remarks** This callback has highest precedence in the configuration hierarchy. Async callbacks are supported for dynamic logic based on external data (e.g., fetching guild info, database lookups, API calls). |

#### Remarks

The getCurve callback is invoked during XP calculations to dynamically determine
the level curve for a specific guild and store. This enables advanced scenarios
that cannot be achieved with static configuration alone.

Configuration precedence (highest to lowest):
1. getCurve callback return value (if non-null)
2. GuildConfig.levels preset (stored in Flashcore)
3. Default quadratic curve (a=5, b=50, c=100)

Return null from getCurve to fall through to guild config or defaults.

Unlike GuildConfig.levels (which is stored in Flashcore and serializable),
the getCurve callback is code-based and not persisted. This allows dynamic
logic based on runtime conditions, external data, or complex business rules.

#### Examples

```ts
Different curves per store (synchronous)
// config/plugins/robojs/xp.ts
export default {
  levels: {
    getCurve: (guildId, storeId) => {
      if (storeId === 'reputation') {
        return {
          xpForLevel: (level) => level * 100,
          levelFromXp: (xp) => Math.floor(xp / 100)
        }
      }
      return null // Use guild config or default
    }
  }
} satisfies PluginOptions
```

```ts
Special guild gets custom curve (synchronous)
export default {
  levels: {
    getCurve: (guildId, storeId) => {
      if (guildId === '123456789012345678') {
        return {
          xpForLevel: (level) => 50 * level * level + 200 * level + 500,
          levelFromXp: (xp) => {
            // Solve quadratic formula for custom coefficients
            return Math.floor((-200 + Math.sqrt(40000 + 200 * (xp - 500))) / 100)
          },
          maxLevel: 100
        }
      }
      return null
    }
  }
} satisfies PluginOptions
```

```ts
Dynamic curve based on guild size (asynchronous)
export default {
  levels: {
    getCurve: async (guildId, storeId) => {
      const guild = await client.guilds.fetch(guildId)
      const memberCount = guild.memberCount

      // Larger guilds get steeper curves
      if (memberCount > 1000) {
        return {
          xpForLevel: (level) => 10 * level * level + 100 * level + 200,
          levelFromXp: (xp) => {
            return Math.floor((-100 + Math.sqrt(10000 + 40 * (xp - 200))) / 20)
          }
        }
      }
      return null
    }
  }
	 * } satisfies PluginOptions
	 *
	 *
```

```ts
Per-guild customization with multiple special guilds
	 * export default {
	 *   levels: {
	 *     getCurve: (guildId, storeId) => {
	 *       // Partner guilds get gentler curves
	 *       const partnerGuilds = ['111111111111111111', '222222222222222222']
	 *       if (partnerGuilds.includes(guildId)) {
	 *         return {
	 *           xpForLevel: (level) => level * 50, // Linear, 50 XP per level
	 *           levelFromXp: (xp) => Math.floor(xp / 50),
	 *         }
	 *       }
	 *
	 *       // Premium guilds get steeper curves with level cap
	 *       const premiumGuilds = ['333333333333333333', '444444444444444444']
	 *       if (premiumGuilds.includes(guildId)) {
	 *         return {
	 *           xpForLevel: (level) => 10 * level * level + 100 * level + 200,
	 *           levelFromXp: (xp) => Math.floor((-100 + Math.sqrt(10000 + 40 * (xp - 200))) / 20),
	 *           maxLevel: 100,
	 *         }
	 *       }
	 *
	 *       return null // All other guilds use default
	 *     },
	 *   },
	 * } satisfies PluginOptions
	 *
	 *
```

```ts
Per-store customization for multi-currency economy
	 * export default {
	 *   levels: {
	 *     getCurve: (guildId, storeId) => {
	 *       // Default store: standard curve via fallback
	 *       if (storeId === 'default') {
	 *         return null // Use default quadratic curve
	 *       }
	 *
	 *       // Reputation store: Slow linear progression
	 *       if (storeId === 'reputation') {
	 *         return {
	 *           xpForLevel: (level) => level * 500,
	 *           levelFromXp: (xp) => Math.floor(xp / 500),
	 *         }
	 *       }
	 *
	 *       // Coins store: Faster linear progression
	 *       if (storeId === 'coins') {
	 *         return {
	 *           xpForLevel: (level) => level * 100,
	 *           levelFromXp: (xp) => Math.floor(xp / 100),
	 *         }
	 *       }
	 *
	 *       // Gems store: Exponential with a cap (premium currency)
	 *       if (storeId === 'gems') {
	 *         return {
	 *           xpForLevel: (level) => 100 * Math.pow(2, level),
	 *           levelFromXp: (xp) => Math.floor(Math.log2(xp / 100)),
	 *           maxLevel: 20,
	 *         }
	 *       }
	 *
	 *       return null // Unknown stores use defaults
	 *     },
	 *   },
	 * } satisfies PluginOptions
	 *
	 *
```

```ts
Use cases for getCurve callback:
	 * - Different curves per store (e.g., reputation vs default vs coins vs gems)
	 * - Special guilds get unique progression (e.g., partner guilds, premium guilds)
	 * - Dynamic curves based on guild size or activity
	 * - Seasonal or time-based progression changes
	 * - A/B testing different curve configurations
	 * - Complex business logic that can't be expressed in static config
	 * - Multi-currency economy systems with different progression rates
	 * - Tiered guild systems (free, partner, premium) with different curves
	 *
	 *
```

#### See

 - README.md "Custom Level Curves" section for user-facing examples
	 *
 - AGENTS.md Section 15 for architecture and integration details
