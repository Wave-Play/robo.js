# Interface: ChatOptions

Options controlling a chat invocation.

## Examples

```ts
const options: ChatOptions = {
  model: 'gpt-4o-mini',
  showTyping: true
}
```

```ts
const options: ChatOptions = {
  userId: '123',
  voice: {
    sessionId: 'abc',
    strategy: 'server-vad'
  }
}
```

## Properties

### conversation?

```ts
optional conversation: ConversationInput;
```

Existing conversation context to continue.

***

### functions?

```ts
optional functions: ChatFunction[];
```

List of available functions the engine may call.

***

### model?

```ts
optional model: string;
```

Preferred model identifier.

***

### showTyping?

```ts
optional showTyping: boolean;
```

Toggle for Discord typing indicator.

***

### temperature?

```ts
optional temperature: number;
```

Temperature applied to sampling, when supported.

***

### threadId?

```ts
optional threadId: null | string;
```

Discord thread identifier for context.

***

### userId?

```ts
optional userId: null | string;
```

Discord user identifier for analytics attribution.

***

### voice?

```ts
optional voice: VoiceChatOptions;
```

Voice chat configuration enabling hybrid sessions.
