# Type Alias: DateRangeFilter

```ts
type DateRangeFilter: object;
```

Specifies filtering criteria for fetching roadmap cards by date range.

## Type declaration

### dateField?

```ts
readonly optional dateField: "created" | "updated";
```

Which date field to filter on.
Defaults to 'updated' if not specified.

### endDate?

```ts
readonly optional endDate: Date | string;
```

The end of the date range (inclusive).
Accepts both Date objects and ISO 8601 strings (e.g., '2025-01-31').

### startDate?

```ts
readonly optional startDate: Date | string;
```

The beginning of the date range (inclusive).
Accepts both Date objects and ISO 8601 strings (e.g., '2025-01-01').

## Remarks

This interface enables programmatic retrieval of cards within specific time windows, useful
for fetching recent changes, generating reports, or analyzing activity over time. The filter
supports both Date objects and ISO 8601 strings for maximum flexibility across different
JavaScript environments and serialization scenarios.

Date field semantics:
- `created`: Filters by the card creation timestamp
- `updated`: Filters by the last modification timestamp (default)

Default behavior when date fields are omitted:
- If only `startDate` is provided: Fetches cards from that date forward
- If only `endDate` is provided: Fetches cards up to that date
- If neither is provided: Behavior is provider-specific (may return all cards or apply a default range)

Provider-specific considerations:
- Date field availability varies by provider (Jira supports both 'created' and 'updated', GitHub may have different field names)
- Date precision and timezone handling is provider-specific; implementations should document their timezone behavior
- Some providers may have limitations on date range queries (e.g., maximum range, pagination requirements)
- Large date ranges may require pagination; providers should handle this transparently
- Results should be cached with appropriate TTL to minimize API calls

## Examples

Fetching cards from last month using Date objects:
```ts
import type { DateRangeFilter } from '@robojs/roadmap';

const lastMonth = new Date();
lastMonth.setMonth(lastMonth.getMonth() - 1);

const filter: DateRangeFilter = {
  startDate: lastMonth,
  endDate: new Date()
};

const cards = await provider.fetchCardsByDateRange?.(filter);
```

Fetching cards in a specific range using ISO strings:
```ts
const filter: DateRangeFilter = {
  startDate: '2025-09-01',
  endDate: '2025-09-30'
};

const septemberCards = await provider.fetchCardsByDateRange?.(filter);
```

Filtering by created date instead of updated date:
```ts
const filter: DateRangeFilter = {
  startDate: '2025-01-01',
  dateField: 'created'
};

const cardsCreatedThisYear = await provider.fetchCardsByDateRange?.(filter);
```

## See

import('./providers/base.js').RoadmapProvider.fetchCardsByDateRange
