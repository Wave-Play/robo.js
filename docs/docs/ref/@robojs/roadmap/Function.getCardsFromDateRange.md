# Function: getCardsFromDateRange()

```ts
function getCardsFromDateRange(
   provider, 
   startDate, 
   endDate, 
dateField): Promise<readonly RoadmapCard[]>
```

Fetches cards within a custom date range.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `provider` | [`RoadmapProvider`](Class.RoadmapProvider.md)\<[`ProviderConfig`](TypeAlias.ProviderConfig.md)\> | `undefined` | The roadmap provider instance. |
| `startDate` | `string` \| `Date` | `undefined` | Start date (Date object or ISO 8601 string). |
| `endDate` | `string` \| `Date` | `undefined` | End date (Date object or ISO 8601 string). |
| `dateField` | `undefined` \| `"created"` \| `"updated"` | `'updated'` | The date field to filter on (defaults to 'updated'). |

## Returns

`Promise`\<readonly [`RoadmapCard`](TypeAlias.RoadmapCard.md)[]\>

Array of cards within the date range.

## Throws

Error if dates are invalid, start > end, provider is null/undefined, or provider doesn't support date filtering.

## Example

```typescript
const cards = await getCardsFromDateRange(provider, '2025-01-01', '2025-01-31');
```
