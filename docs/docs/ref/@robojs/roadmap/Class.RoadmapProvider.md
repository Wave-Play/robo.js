# Class: `abstract` RoadmapProvider\<TConfig\>

Base class for roadmap data providers (Jira, GitHub Projects, Linear).

## Remarks

Extend this class to integrate external project management systems with the roadmap plugin.
Implement the abstract methods to fetch cards, columns, and provider metadata.

## Example

```ts
export class JiraRoadmapProvider extends RoadmapProvider<JiraProviderConfig> {
  public async fetchCards(): Promise<RoadmapCard[]> {
    // Fetch and map Jira issues to RoadmapCard
    return [];
  }

  public async getColumns() {
    return [{ id: 'todo', name: 'To Do', order: 0 }];
  }
}
```

## Extended by

- [`JiraProvider`](Class.JiraProvider.md)

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `TConfig` *extends* [`ProviderConfig`](TypeAlias.ProviderConfig.md) | [`ProviderConfig`](TypeAlias.ProviderConfig.md) |

## Constructors

### new RoadmapProvider()

```ts
protected new RoadmapProvider<TConfig>(config): RoadmapProvider<TConfig>
```

Creates a new roadmap provider instance with the supplied configuration.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `config` | `TConfig` | Provider specific configuration object. |

#### Returns

[`RoadmapProvider`](Class.RoadmapProvider.md)\<`TConfig`\>

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| `config` | `readonly` | `TConfig` | Provider specific configuration object. |

## Methods

### createCard()

```ts
abstract createCard(input): Promise<CreateCardResult>
```

Creates a new card in the external provider system.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input` | [`CreateCardInput`](TypeAlias.CreateCardInput.md) | Card data (title, description, column, labels, etc.). |

#### Returns

`Promise`\<[`CreateCardResult`](TypeAlias.CreateCardResult.md)\>

Result containing the created card and success status.

#### Throws

Authentication, validation, or network errors.

#### Example

```ts
public async createCard(input: CreateCardInput): Promise<CreateCardResult> {
  const issue = await this.client.createIssue({
    summary: input.title,
    description: input.description,
  });
  return { card: this.mapIssueToCard(issue), success: true };
}
```

***

### fetchCards()

```ts
abstract fetchCards(): Promise<readonly RoadmapCard[]>
```

Fetches all roadmap cards from the provider.

#### Returns

`Promise`\<readonly [`RoadmapCard`](TypeAlias.RoadmapCard.md)[]\>

Array of roadmap cards.

***

### fetchCardsByDateRange()?

```ts
optional fetchCardsByDateRange(filter): Promise<readonly RoadmapCard[]>
```

Optional method to fetch cards filtered by date range (useful for reporting and activity analysis).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `filter` | [`DateRangeFilter`](TypeAlias.DateRangeFilter.md) | Date range filter with optional startDate, endDate, and dateField. |

#### Returns

`Promise`\<readonly [`RoadmapCard`](TypeAlias.RoadmapCard.md)[]\>

Cards matching the date criteria, ordered by date descending (most recent first).

#### Example

```ts
public async fetchCardsByDateRange(filter: DateRangeFilter): Promise<readonly RoadmapCard[]> {
  const jql = this.buildDateRangeJql(filter);
  const issues = await this.searchIssues(jql);
  return issues.map(this.mapIssueToCard);
}
```

***

### getCard()

```ts
abstract getCard(cardId): Promise<null | RoadmapCard>
```

Retrieves a single card by its provider-specific ID (e.g., Jira issue key 'PROJ-123').

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cardId` | `string` | Provider-specific identifier. |

#### Returns

`Promise`\<`null` \| [`RoadmapCard`](TypeAlias.RoadmapCard.md)\>

Card if found, null if not found.

#### Throws

Authentication or network errors (not for missing cards).

#### Example

```ts
public async getCard(cardId: string): Promise<RoadmapCard | null> {
  try {
    const issue = await this.client.getIssue(cardId);
    return this.mapIssueToCard(issue);
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}
```

***

### getColumns()

```ts
abstract getColumns(): Promise<readonly RoadmapColumn[]>
```

Retrieves the available roadmap columns.

#### Returns

`Promise`\<readonly [`RoadmapColumn`](TypeAlias.RoadmapColumn.md)[]\>

Array of column definitions.

#### Example

```ts
public async getColumns() {
  return [
    { id: 'backlog', name: 'Backlog', order: 0, archived: false },
    { id: 'done', name: 'Done', order: 3, archived: true },
  ];
}
```

***

### getIssueTypes()

```ts
abstract getIssueTypes(): Promise<readonly string[]>
```

Retrieves available issue types for card creation (e.g., 'Task', 'Story', 'Bug').

#### Returns

`Promise`\<readonly `string`[]\>

Array of issue type names.

#### Example

```ts
public async getIssueTypes(): Promise<readonly string[]> {
  return ['Task', 'Story', 'Bug', 'Epic'];
}
```

***

### getLabels()

```ts
abstract getLabels(): Promise<readonly string[]>
```

Retrieves available labels for card categorization (e.g., 'bug', 'enhancement').

#### Returns

`Promise`\<readonly `string`[]\>

Array of label names.

#### Example

```ts
public async getLabels(): Promise<readonly string[]> {
  return ['bug', 'enhancement', 'feature'];
}
```

***

### getProviderInfo()

```ts
abstract getProviderInfo(): Promise<ProviderInfo>
```

Returns provider metadata (name, version, capabilities) for diagnostics and logging.

#### Returns

`Promise`\<[`ProviderInfo`](TypeAlias.ProviderInfo.md)\>

Provider information.

#### Example

```ts
public async getProviderInfo() {
  return {
    name: 'GitHub Projects',
    version: '0.1.0',
    capabilities: ['cards', 'columns'],
  };
}
```

***

### init()

```ts
init(): Promise<void>
```

Optional initialization hook called before the first sync. Default implementation is a no-op.

#### Returns

`Promise`\<`void`\>

#### Example

```ts
public override async init() {
  await this.client.authenticate();
}
```

***

### updateCard()

```ts
abstract updateCard(cardId, input): Promise<UpdateCardResult>
```

Updates an existing card (partial update - only provided fields are changed).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cardId` | `string` | Provider-specific identifier. |
| `input` | [`UpdateCardInput`](TypeAlias.UpdateCardInput.md) | Partial card data to update. |

#### Returns

`Promise`\<[`UpdateCardResult`](TypeAlias.UpdateCardResult.md)\>

Result containing the updated card and success status.

#### Throws

Authentication, validation, not found, or network errors.

#### Example

```ts
public async updateCard(cardId: string, input: UpdateCardInput): Promise<UpdateCardResult> {
  const fields: Record<string, unknown> = {};
  if (input.title) fields.summary = input.title;
  if (input.description) fields.description = input.description;

  await this.client.updateIssue(cardId, { fields });
  const card = await this.getCard(cardId);

  return { card: card!, success: true };
}
```

***

### validateConfig()

```ts
validateConfig(_config): boolean
```

Validates provider-specific configuration. Default implementation returns true.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `_config` | `TConfig` | Configuration to validate (defaults to instance config). |

#### Returns

`boolean`

Whether the configuration is valid.

#### Example

```ts
public override validateConfig(config = this.config) {
  return Boolean(config.options?.apiToken);
}
```
