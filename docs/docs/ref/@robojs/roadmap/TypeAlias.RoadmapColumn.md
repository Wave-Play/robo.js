# Type Alias: RoadmapColumn

```ts
type RoadmapColumn: object;
```

Describes a column or lane used to organize roadmap cards.

## Type declaration

### archived

```ts
readonly archived: boolean;
```

Signals whether items in this column should be considered archived.

### id

```ts
readonly id: string;
```

Provider assigned identifier for the column.

### name

```ts
readonly name: string;
```

Human readable column label.

### order

```ts
readonly order: number;
```

Relative order used for sorting columns from left to right.

## Remarks

Providers should return all actionable columns so the sync engine can mirror the structure in
Discord. Archived columns inform downstream logic to hide or store cards without deleting data.
