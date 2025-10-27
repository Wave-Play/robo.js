# Function: getRoadmapCategory()

```ts
function getRoadmapCategory(guild): Promise<CategoryChannel | null>
```

Retrieves the roadmap category for a guild.

This is a helper function for validation before operations. It returns
null if no category is configured or if the channel was deleted.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guild` | `Guild` | The Discord guild |

## Returns

`Promise`\<`CategoryChannel` \| `null`\>

The category channel, or null if not found

## Example

```ts
const category = await getRoadmapCategory(guild);
if (!category) {
  return interaction.reply('No roadmap category configured. Run /roadmap setup first.');
}
```
