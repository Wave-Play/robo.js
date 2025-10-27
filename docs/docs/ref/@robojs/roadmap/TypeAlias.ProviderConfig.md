# Type Alias: ProviderConfig

```ts
type ProviderConfig: object;
```

Identifies the provider implementation and its raw configuration.

## Type declaration

### options

```ts
readonly options: Record<string, unknown>;
```

Implementation specific configuration options.

### type

```ts
readonly type: string;
```

Provider type identifier (e.g., `jira`, `github`).

## Remarks

The `options` bag is intentionally untyped to allow provider packages to define their own
schema. Providers should validate and coerce values during
import('./providers/base.js').RoadmapProvider.validateConfig.
