# Function: syncSingleCard()

```ts
function syncSingleCard(
   card, 
   guild, 
provider): Promise<object | null>
```

Synchronizes a single roadmap card to Discord and returns thread metadata.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `card` | [`RoadmapCard`](TypeAlias.RoadmapCard.md) | The roadmap card to sync. |
| `guild` | `Guild` | The Discord guild to sync to. |
| `provider` | [`RoadmapProvider`](Class.RoadmapProvider.md)\<[`ProviderConfig`](TypeAlias.ProviderConfig.md)\> | The roadmap provider instance. |

## Returns

`Promise`\<`object` \| `null`\>

Object containing thread ID and URL, or null if skipped (e.g., archived column).

## Throws

Error if forums not configured, card column not found, or Discord sync fails.

## Example

```ts
const result = await syncSingleCard(newCard, guild, provider);
if (result) {
  const { threadId, threadUrl } = result;
}
```
