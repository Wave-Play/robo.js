# Type Alias: GlobalConfig

```ts
type GlobalConfig: Partial<GuildConfig>;
```

Global configuration defaults applied to all guilds

Partial GuildConfig - only specified fields override guild defaults.
Used for setting system-wide defaults via setGlobalConfig.

## Example

```ts
{
 *   cooldownSeconds: 90,
 *   xpRate: 1.2
 * }
```
