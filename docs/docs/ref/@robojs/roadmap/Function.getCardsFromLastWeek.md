# Function: getCardsFromLastWeek()

```ts
function getCardsFromLastWeek(provider, dateField): Promise<readonly RoadmapCard[]>
```

Fetches cards from the last 7 days (inclusive of today).

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `provider` | [`RoadmapProvider`](Class.RoadmapProvider.md)\<[`ProviderConfig`](TypeAlias.ProviderConfig.md)\> | `undefined` | The roadmap provider instance. |
| `dateField` | `undefined` \| `"created"` \| `"updated"` | `'updated'` | The date field to filter on (defaults to 'updated'). |

## Returns

`Promise`\<readonly [`RoadmapCard`](TypeAlias.RoadmapCard.md)[]\>

Array of cards from the last 7 days.

## Throws

Error if provider is null/undefined or doesn't support date filtering.

## Example

```typescript
const cards = await getCardsFromLastWeek(provider);
```
