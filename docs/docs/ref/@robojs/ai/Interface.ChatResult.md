# Interface: ChatResult

Normalized chat response structure returned by engines.

## Properties

### conversation?

```ts
optional conversation: ConversationState;
```

Updated conversation state to persist for future calls.

***

### finish\_reason

```ts
finish_reason: string;
```

Reason provided by the API for ending the completion.

***

### message?

```ts
optional message: ChatMessage;
```

Assistant message when no tool call was issued.

***

### rawResponse?

```ts
optional rawResponse: unknown;
```

Provider-specific payload for debugging or auditing.

***

### toolCalls?

```ts
optional toolCalls: ChatFunctionCall[];
```

Any tool calls emitted during the completion.

***

### voice?

```ts
optional voice: VoiceChatResult;
```

Voice response metadata, when applicable.
