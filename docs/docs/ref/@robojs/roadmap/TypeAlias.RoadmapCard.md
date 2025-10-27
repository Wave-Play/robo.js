# Type Alias: RoadmapCard

```ts
type RoadmapCard: object;
```

Represents a unit of work surfaced by the roadmap.

## Type declaration

### assignees

```ts
readonly assignees: object[];
```

Contributors actively working on the card.

### column

```ts
readonly column: string;
```

Identifier of the column or status the card currently resides in.

### description

```ts
readonly description: string;
```

Rich description used when posting updates or expanding a card.

### id

```ts
readonly id: string;
```

Unique identifier assigned by the provider (e.g., Jira issue key).

### labels

```ts
readonly labels: string[];
```

Labels associated with the card; maps to Discord forum tags where applicable.

### metadata?

```ts
readonly optional metadata: Record<string, unknown>;
```

Provider specific metadata that does not have a dedicated field.
May be omitted when not needed by the provider.

### title

```ts
readonly title: string;
```

Concise title or summary displayed to Discord users.

### updatedAt

```ts
readonly updatedAt: Date;
```

Timestamp representing the last modification time in the provider.

### url

```ts
readonly url: string;
```

Deep link to the provider for additional context.

## Remarks

Each card mirrors an entity fetched from the external provider (issue, ticket, card, etc.). The
metadata is designed to support Discord specific rendering while preserving provider identifiers
for bidirectional navigation.
