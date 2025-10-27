# Interface: ConversationState

Snapshot describing an active or previous conversation.

## Properties

### id

```ts
id: string;
```

Identifier assigned by the engine for subsequent interactions.

***

### metadata?

```ts
optional metadata: Record<string, unknown>;
```

Metadata persisted across turns for custom engines.

***

### previousResponseId?

```ts
optional previousResponseId: null | string;
```

Identifier of the last response returned to the caller.

***

### provider?

```ts
optional provider: string;
```

Provider key describing the backing engine implementation.
