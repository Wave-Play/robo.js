# Function: setGuildSettings()

```ts
function setGuildSettings(guildId, settings): Promise<void>
```

Persist custom giveaway settings for a Discord guild.

This overwrites the guild's stored configuration, replacing the default
values provided by DEFAULT_SETTINGS. Values are stored in
Flashcore under a deterministic namespace keyed by the guild ID.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | Discord guild ID whose settings should be updated. |
| `settings` | [`GuildSettings`](Interface.GuildSettings.md) | Complete [GuildSettings](Interface.GuildSettings.md) object to persist. |

## Returns

`Promise`\<`void`\>

Promise that resolves once the settings have been written.

## Example

```ts
await setGuildSettings('123456789012345678', {
  defaults: { winners: 2, duration: '2h', buttonLabel: 'Join', dmWinners: true },
  limits: { maxWinners: 10, maxDurationDays: 14 },
  restrictions: { allowRoleIds: [], denyRoleIds: [], minAccountAgeDays: null }
})
```
