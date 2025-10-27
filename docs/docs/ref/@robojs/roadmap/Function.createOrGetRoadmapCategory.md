# Function: createOrGetRoadmapCategory()

```ts
function createOrGetRoadmapCategory(options): Promise<object>
```

Creates or retrieves the roadmap category with forum channels for each column (idempotent).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`CreateRoadmapForumsOptions`](Interface.CreateRoadmapForumsOptions.md) | Guild and columns to create forums for. |

## Returns

`Promise`\<`object`\>

Category and map of column names to forum channels.

### category

```ts
category: CategoryChannel;
```

### forums

```ts
forums: Map<string, ForumChannel>;
```

## Throws

Error if bot lacks Manage Channels permission.

## Example

```ts
const { category, forums } = await createOrGetRoadmapCategory({
  guild: interaction.guild,
  columns: [{ id: 'backlog', name: 'Backlog', order: 0 }]
});
```
