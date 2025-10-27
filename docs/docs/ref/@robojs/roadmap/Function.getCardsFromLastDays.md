# Function: getCardsFromLastDays()

```ts
function getCardsFromLastDays(
   provider, 
   days, 
dateField): Promise<readonly RoadmapCard[]>
```

Fetches cards from the last N days (inclusive of today).

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `provider` | [`RoadmapProvider`](Class.RoadmapProvider.md)\<[`ProviderConfig`](TypeAlias.ProviderConfig.md)\> | `undefined` | The roadmap provider instance. |
| `days` | `number` | `undefined` | Number of days to look back (must be positive integer). |
| `dateField` | `undefined` \| `"created"` \| `"updated"` | `'updated'` | The date field to filter on (defaults to 'updated'). |

## Returns

`Promise`\<readonly [`RoadmapCard`](TypeAlias.RoadmapCard.md)[]\>

Array of cards from the last N days.

## Throws

Error if days is invalid, provider is null/undefined, or provider doesn't support date filtering.

## Example

```typescript
const cards = await getCardsFromLastDays(provider, 30);
```
