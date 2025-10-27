# Function: getGuildSettings()

```ts
function getGuildSettings(guildId): Promise<GuildSettings>
```

Resolve the persisted giveaway settings for a Discord guild.

Defaults are applied automatically when a guild has not stored any custom
settings yet, ensuring downstream consumers always receive a complete
[GuildSettings](Interface.GuildSettings.md) object.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | Discord guild ID to load settings for. |

## Returns

`Promise`\<[`GuildSettings`](Interface.GuildSettings.md)\>

Promise that resolves to the guild's configured giveaway settings.

## Example

```ts
const settings = await getGuildSettings('123456789012345678')
console.log(settings.defaults.winners)
```
