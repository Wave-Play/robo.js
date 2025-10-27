# Interface: ConversationInput

Optional conversation metadata supplied when invoking [BaseEngine.chat](Class.BaseEngine.md#chat).

## Properties

### id?

```ts
optional id: null | string;
```

Stable conversation identifier used for threading.

***

### metadata?

```ts
optional metadata: Record<string, unknown>;
```

Arbitrary metadata persisted alongside conversation state.
