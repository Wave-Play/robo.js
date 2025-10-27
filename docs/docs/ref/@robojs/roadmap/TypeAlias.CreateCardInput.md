# Type Alias: CreateCardInput

```ts
type CreateCardInput: object;
```

Input required to create a new roadmap card in the external provider.

## Type declaration

### assignees?

```ts
readonly optional assignees: object[];
```

Optional array of assignees to assign to the card.
Each assignee must have a provider-specific ID that matches a valid user in the provider's system.

### column

```ts
readonly column: string;
```

Target column name where the card should be created (e.g., 'Backlog', 'In Progress').

### description

```ts
readonly description: string;
```

Detailed description or body content for the card.

### issueType?

```ts
readonly optional issueType: string;
```

Optional issue type name for the card (e.g., 'Task', 'Story', 'Bug', 'Epic').
If omitted, the provider's default issue type is used.
The available issue types are provider-specific and can be retrieved via the provider's getIssueTypes() method.

### labels?

```ts
readonly optional labels: string[];
```

Optional array of label names to associate with the card.

### title

```ts
readonly title: string;
```

Card title or summary displayed to users.

## Remarks

This interface captures the minimum data needed to create a card across any provider
implementation. Providers should map these fields to their native data models (e.g., Jira
issue fields, GitHub issue properties).

Provider-specific considerations:
- Column names must match one of the columns returned by the provider's `getColumns()` method
- Assignee IDs must be valid user identifiers in the provider's system
- Labels should follow the provider's naming conventions and constraints
- Issue type names must match one of the types returned by the provider's `getIssueTypes()` method
- If issue type is omitted, the provider's configured default issue type is used

## Example

```ts
import type { CreateCardInput } from '@robojs/roadmap';

const input: CreateCardInput = {
  title: 'Add dark mode support',
  description: 'Implement dark mode theme across the application',
  column: 'Backlog',
  labels: ['enhancement', 'ui'],
  issueType: 'Task'
};
```
