# Class: JiraProvider

Jira provider that connects to Jira Cloud instances via REST API v3.

Authenticates using email and API token, executes JQL queries to fetch issues,
and maps them to roadmap cards.

## Example

```ts
const provider = new JiraProvider({
  type: 'jira',
  options: {
    url: process.env.JIRA_URL,
    email: process.env.JIRA_EMAIL,
    apiToken: process.env.JIRA_API_TOKEN,
  },
});
```

## Extends

- [`RoadmapProvider`](Class.RoadmapProvider.md)\<[`JiraProviderConfig`](Interface.JiraProviderConfig.md)\>

## Constructors

### new JiraProvider()

```ts
new JiraProvider(config): JiraProvider
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `config` | [`JiraProviderConfig`](Interface.JiraProviderConfig.md) |

#### Returns

[`JiraProvider`](Class.JiraProvider.md)

#### Overrides

[`RoadmapProvider`](Class.RoadmapProvider.md).[`constructor`](Class.RoadmapProvider.md#constructors)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| `config` | `readonly` | [`JiraProviderConfig`](Interface.JiraProviderConfig.md) | Provider specific configuration object. | [`RoadmapProvider`](Class.RoadmapProvider.md).`config` |

## Methods

### createCard()

```ts
createCard(input): Promise<CreateCardResult>
```

Creates a new Jira issue.

Converts plain text description to ADF. If column is not 'Backlog', transitions the issue
to the appropriate status. Only the first assignee is used (Jira limitation).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input` | [`CreateCardInput`](TypeAlias.CreateCardInput.md) | Card data (title, description, column, labels, assignees, issueType). |

#### Returns

`Promise`\<[`CreateCardResult`](TypeAlias.CreateCardResult.md)\>

CreateCardResult with success status and created card.

#### Example

```ts
const result = await provider.createCard({
  title: 'New Feature',
  description: 'Add user authentication',
  column: 'In Progress',
  labels: ['feature']
});
```

#### Overrides

[`RoadmapProvider`](Class.RoadmapProvider.md).[`createCard`](Class.RoadmapProvider.md#createcard)

***

### fetchCards()

```ts
fetchCards(): Promise<readonly RoadmapCard[]>
```

Fetches all Jira issues matching the configured JQL query.

#### Returns

`Promise`\<readonly [`RoadmapCard`](TypeAlias.RoadmapCard.md)[]\>

Array of roadmap cards mapped from Jira issues.

#### Throws

Error if authentication fails or query is invalid.

#### Overrides

[`RoadmapProvider`](Class.RoadmapProvider.md).[`fetchCards`](Class.RoadmapProvider.md#fetchcards)

***

### fetchCardsByDateRange()

```ts
fetchCardsByDateRange(filter): Promise<readonly RoadmapCard[]>
```

Fetches Jira issues filtered by date range.

Supports filtering by 'created' or 'updated' fields (defaults to 'updated').
Accepts Date objects or ISO 8601 strings. Results are cached for 5 minutes.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `filter` | [`DateRangeFilter`](TypeAlias.DateRangeFilter.md) | Date range criteria (startDate, endDate, dateField). |

#### Returns

`Promise`\<readonly [`RoadmapCard`](TypeAlias.RoadmapCard.md)[]\>

Array of matching cards, or empty array on error.

#### Example

```ts
const cards = await provider.fetchCardsByDateRange({
  startDate: '2025-01-01',
  endDate: '2025-01-31',
  dateField: 'updated'
});
```

#### Overrides

[`RoadmapProvider`](Class.RoadmapProvider.md).[`fetchCardsByDateRange`](Class.RoadmapProvider.md#fetchcardsbydaterange)

***

### getCard()

```ts
getCard(cardId): Promise<null | RoadmapCard>
```

Retrieves a single Jira issue by its key.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cardId` | `string` | Jira issue key (e.g., 'PROJ-123'). |

#### Returns

`Promise`\<`null` \| [`RoadmapCard`](TypeAlias.RoadmapCard.md)\>

RoadmapCard if found, null if not found.

#### Throws

Error if authentication fails or network errors occur.

#### Example

```ts
const card = await provider.getCard('PROJ-123');
if (card) console.log(card.title);
```

#### Overrides

[`RoadmapProvider`](Class.RoadmapProvider.md).[`getCard`](Class.RoadmapProvider.md#getcard)

***

### getColumns()

```ts
getColumns(): Promise<readonly RoadmapColumn[]>
```

Returns standard Jira workflow columns (Backlog, In Progress, Done).

#### Returns

`Promise`\<readonly [`RoadmapColumn`](TypeAlias.RoadmapColumn.md)[]\>

Array of column definitions.

#### Overrides

[`RoadmapProvider`](Class.RoadmapProvider.md).[`getColumns`](Class.RoadmapProvider.md#getcolumns)

***

### getIssueTypes()

```ts
getIssueTypes(): Promise<readonly string[]>
```

Retrieves available issue types from Jira (excludes subtasks).

Results are cached for 5 minutes. Returns standard types on failure.

#### Returns

`Promise`\<readonly `string`[]\>

Array of issue type names (e.g., ['Task', 'Story', 'Bug', 'Epic']).

#### Overrides

[`RoadmapProvider`](Class.RoadmapProvider.md).[`getIssueTypes`](Class.RoadmapProvider.md#getissuetypes)

***

### getLabels()

```ts
getLabels(): Promise<readonly string[]>
```

Retrieves available labels from Jira.

Results are cached for 5 minutes. Returns empty array on failure.

#### Returns

`Promise`\<readonly `string`[]\>

Array of label names.

#### Overrides

[`RoadmapProvider`](Class.RoadmapProvider.md).[`getLabels`](Class.RoadmapProvider.md#getlabels)

***

### getProviderInfo()

```ts
getProviderInfo(): Promise<ProviderInfo>
```

Returns provider metadata and capabilities.

#### Returns

`Promise`\<[`ProviderInfo`](TypeAlias.ProviderInfo.md)\>

Provider information including name, version, and capabilities.

#### Example

```ts
const info = await provider.getProviderInfo();
console.log(info.name); // 'Jira'
```

#### Overrides

[`RoadmapProvider`](Class.RoadmapProvider.md).[`getProviderInfo`](Class.RoadmapProvider.md#getproviderinfo)

***

### init()

```ts
init(): Promise<void>
```

Initializes the provider and verifies Jira connectivity.

#### Returns

`Promise`\<`void`\>

#### Throws

Error if configuration is invalid or authentication fails.

#### Overrides

[`RoadmapProvider`](Class.RoadmapProvider.md).[`init`](Class.RoadmapProvider.md#init)

***

### updateCard()

```ts
updateCard(cardId, input): Promise<UpdateCardResult>
```

Updates an existing Jira issue (partial update).

Only provided fields are updated. If column changes, transitions the issue to the new status.
Only the first assignee is used (Jira limitation).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cardId` | `string` | Jira issue key (e.g., 'PROJ-123'). |
| `input` | [`UpdateCardInput`](TypeAlias.UpdateCardInput.md) | Partial card data to update. |

#### Returns

`Promise`\<[`UpdateCardResult`](TypeAlias.UpdateCardResult.md)\>

UpdateCardResult with success status and updated card.

#### Example

```ts
const result = await provider.updateCard('PROJ-123', { column: 'Done' });
console.log(result.success);
```

#### Overrides

[`RoadmapProvider`](Class.RoadmapProvider.md).[`updateCard`](Class.RoadmapProvider.md#updatecard)

***

### validateConfig()

```ts
validateConfig(config): boolean
```

Validates the resolved Jira configuration, emitting structured log output for any failures.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `config` | [`JiraProviderConfig`](Interface.JiraProviderConfig.md) | Optional override used mainly for testing. |

#### Returns

`boolean`

`true` when the configuration satisfies the minimum requirements.

#### Overrides

[`RoadmapProvider`](Class.RoadmapProvider.md).[`validateConfig`](Class.RoadmapProvider.md#validateconfig)
