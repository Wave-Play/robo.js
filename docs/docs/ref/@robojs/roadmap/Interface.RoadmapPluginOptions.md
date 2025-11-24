# Interface: RoadmapPluginOptions

Plugin options interface

These options can be configured in config/plugins/robojs/roadmap.* files
to customize the roadmap plugin behavior.

## Examples

Basic configuration with Jira provider:
```ts
// config/plugins/robojs/roadmap.ts
export default {
  provider: {
    type: 'jira',
    options: {
      url: process.env.JIRA_URL,
      email: process.env.JIRA_EMAIL,
      apiToken: process.env.JIRA_API_TOKEN,
      jql: '(issuetype = Epic AND (labels NOT IN ("Private") OR labels IS EMPTY)) OR labels IN ("Public")'
    }
  }
}
```

Advanced configuration with pre-instantiated provider:
```ts
import { JiraProvider } from '@robojs/roadmap'

const customProvider = new JiraProvider({
  type: 'jira',
  options: {
    url: 'https://company.atlassian.net',
    email: 'bot@company.com',
    apiToken: 'secret-token',
    jql: 'project = MYPROJECT'
  }
})

export default {
  provider: customProvider,
  autoSync: true,
  autocompleteCacheTtl: 600000 // 10 minutes
}
```

## Properties

### autocompleteCacheTtl?

```ts
optional autocompleteCacheTtl: number;
```

Time-to-live in milliseconds for autocomplete cache entries (issue types, columns, labels).

Controls how long autocomplete suggestions are cached before being refreshed from the provider.
Lower values provide fresher data but increase API calls; higher values reduce API load but may show stale data.

#### Default Value

```ts
300000 (5 minutes)
```

#### Remarks

This setting affects all autocomplete handlers in roadmap commands. The cache is per-guild and shared across all autocomplete options.

#### Example

```ts
export default {
  autocompleteCacheTtl: 600000 // 10 minutes
}
```

***

### autoSync?

```ts
optional autoSync: boolean;
```

Whether to automatically sync on startup.

#### Default Value

```ts
false
```

#### Remarks

Currently not implemented - reserved for future enhancement

***

### ephemeralCommands?

```ts
optional ephemeralCommands: boolean;
```

Whether roadmap command responses (e.g., /roadmap add, /roadmap edit) should be ephemeral.

When true, command replies are only visible to the invoking user. When false, results are
posted visibly in the channel so project teams can see card creation and edit activity.

#### Default Value

```ts
true
```

#### Example

```ts
export default {
  ephemeralCommands: false // share add/edit results with the whole channel
}
```

***

### provider?

```ts
optional provider: ProviderConfig | RoadmapProvider<ProviderConfig>;
```

Provider configuration or pre-instantiated provider instance.

Can be either:
- A ProviderConfig object with type and options
- A pre-instantiated RoadmapProvider instance (for advanced customization)

If not provided, falls back to environment variables (JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN).

***

### syncInterval?

```ts
optional syncInterval: number;
```

Interval in milliseconds for automatic syncing.

#### Remarks

Reserved for future implementation
