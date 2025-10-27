# Function: getSettings()

```ts
function getSettings(guildId): RoadmapSettings
```

Retrieves roadmap settings for a guild.

Returns empty object if no settings exist.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `null` \| `string` | The Discord guild ID. |

## Returns

[`RoadmapSettings`](Interface.RoadmapSettings.md)

The guild's roadmap settings.

## Throws

Error if guildId is null or undefined.
