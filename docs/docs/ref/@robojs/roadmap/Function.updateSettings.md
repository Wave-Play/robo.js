# Function: updateSettings()

```ts
function updateSettings(guildId, settings): RoadmapSettings
```

Updates roadmap settings for a guild (merges with existing).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `null` \| `string` | The Discord guild ID. |
| `settings` | `Partial`\<[`RoadmapSettings`](Interface.RoadmapSettings.md)\> | Partial settings to merge. |

## Returns

[`RoadmapSettings`](Interface.RoadmapSettings.md)

The merged settings.

## Throws

Error if guildId is null or undefined or persistence fails.
