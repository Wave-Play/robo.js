# Type Alias: UpdateCardInput

```ts
type UpdateCardInput: object;
```

Input required to update an existing roadmap card in the external provider.

## Type declaration

### assignees?

```ts
readonly optional assignees: object[];
```

Updated array of assignees to assign to the card.
If omitted, existing assignees are unchanged.
Each assignee must have a provider-specific ID that matches a valid user in the provider's system.

### column?

```ts
readonly optional column: string;
```

Target column name where the card should be moved (e.g., 'In Progress', 'Done').
If omitted, the card remains in its current column.

### description?

```ts
readonly optional description: string;
```

Updated detailed description or body content. If omitted, the existing description is unchanged.

### labels?

```ts
readonly optional labels: string[];
```

Updated array of label names to associate with the card.
Completely replaces existing labels - provide the full desired set.
If omitted, existing labels are unchanged.

### title?

```ts
readonly optional title: string;
```

Updated card title or summary. If omitted, the existing title is unchanged.

## Remarks

This interface supports partial updates - only provided fields are changed in the provider.
Omitted fields remain unchanged, allowing targeted edits without fetching and resending all
card data.

Provider-specific considerations:
- All fields are optional; at least one field should be provided for a meaningful update
- Column names must match one of the columns returned by the provider's `getColumns()` method
- Assignee IDs must be valid user identifiers in the provider's system
- Labels completely replace existing labels; provide the full desired set
- Some providers may have limitations (e.g., Jira supports only one assignee)

## Example

```ts
import type { UpdateCardInput } from '@robojs/roadmap';

// Update only the title
const input1: UpdateCardInput = {
  title: 'Updated title'
};

// Update multiple fields
const input2: UpdateCardInput = {
  title: 'Add dark mode support',
  description: 'Implement dark mode theme across the application',
  column: 'In Progress',
  labels: ['enhancement', 'ui', 'wip']
};
```
