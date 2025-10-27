# Interface: JiraProviderConfig

Configuration shape for the [JiraProvider](Class.JiraProvider.md).

## Remarks

Values can be provided directly on the config object, through the `options` bag, or via
environment variables. Explicit config values take precedence, followed by option values, with
environment variables acting as the final fallback. Missing required credentials will be surfaced
during [JiraProvider.validateConfig](Class.JiraProvider.md#validateconfig).

## Extends

- [`ProviderConfig`](TypeAlias.ProviderConfig.md)

## Properties

### apiToken?

```ts
readonly optional apiToken: string;
```

Jira API token associated with the Atlassian account.

***

### defaultIssueType?

```ts
readonly optional defaultIssueType: string;
```

Default issue type name for created issues (e.g., 'Epic', 'Task').
Defaults to 'Task' if not specified.

***

### email?

```ts
readonly optional email: string;
```

Atlassian account email used for API authentication.

***

### jql?

```ts
readonly optional jql: string;
```

Optional JQL query to scope the issues returned by the provider.

***

### maxResults?

```ts
readonly optional maxResults: number;
```

Maximum number of issues to fetch per page when paging Jira search results.

***

### options

```ts
readonly options: Record<string, unknown> & object;
```

Provider options bag allowing runtime overrides via plugin configuration.

#### Type declaration

| Name | Type |
| ------ | ------ |
| `apiToken`? | `string` |
| `defaultIssueType`? | `string` |
| `email`? | `string` |
| `jql`? | `string` |
| `maxResults`? | `number` |
| `projectKey`? | `string` |
| `url`? | `string` |

#### Overrides

`ProviderConfig.options`

***

### projectKey?

```ts
readonly optional projectKey: string;
```

Jira project key for creating issues (e.g., 'PROJ').

***

### type

```ts
readonly type: string;
```

Provider type identifier (e.g., `jira`, `github`).

#### Inherited from

`ProviderConfig.type`

***

### url?

```ts
readonly optional url: string;
```

Fully qualified Jira Cloud base URL, e.g., `https://example.atlassian.net`.
