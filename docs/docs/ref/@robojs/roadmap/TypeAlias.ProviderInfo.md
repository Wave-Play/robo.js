# Type Alias: ProviderInfo

```ts
type ProviderInfo: object;
```

Metadata describing a roadmap provider implementation.

## Type declaration

### capabilities

```ts
readonly capabilities: readonly string[];
```

List of capabilities supported by this provider (e.g., `cards`, `columns`, `attachments`).

### metadata?

```ts
readonly optional metadata: Record<string, unknown>;
```

Optional provider specific metadata for diagnostics or configuration details.

### name

```ts
readonly name: string;
```

Human readable provider name (e.g., `Jira`, `GitHub Projects`).

### version

```ts
readonly version: string;
```

Semantic version of the provider implementation.

## Remarks

Used for diagnostics, logging, and telemetry. Providers should surface meaningful
information that helps operators debug issues, such as API versions or enabled features.
