# Interface: TokenLimitConfig

Token limit configuration keyed by model identifier.

## Properties

### perModel?

```ts
optional perModel: Record<string, TokenLimitRule>;
```

Mapping of model names to limit rules.
