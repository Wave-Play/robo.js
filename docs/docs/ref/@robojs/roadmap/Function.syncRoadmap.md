# Function: syncRoadmap()

```ts
function syncRoadmap(options): Promise<SyncResult>
```

Synchronizes roadmap data from a provider to Discord forum posts.

Fetches cards and columns from the provider, updates forum tags, and creates/updates/archives
threads based on card state. The operation is idempotent - existing threads are tracked and
updated in place.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`SyncOptions`](Interface.SyncOptions.md) | Sync configuration (guild, provider, dryRun). |

## Returns

`Promise`\<[`SyncResult`](TypeAlias.SyncResult.md)\>

Sync result with statistics.

## Throws

Error if no forum channels configured or missing Discord permissions.

## Example

```ts
const result = await syncRoadmap({
  guild: interaction.guild,
  provider
});
```
