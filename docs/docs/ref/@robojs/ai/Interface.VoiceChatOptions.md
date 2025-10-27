# Interface: VoiceChatOptions

Additional configuration applied when orchestrating a voice-enabled chat.

## Properties

### channels?

```ts
optional channels: number;
```

Number of audio channels supplied by the caller.

***

### conversationId?

```ts
optional conversationId: null | string;
```

Conversation identifier for persisted voice transcripts.

***

### sampleRate?

```ts
optional sampleRate: number;
```

Sample rate of inbound audio frames.

***

### sessionId?

```ts
optional sessionId: null | string;
```

Identifier of the active voice session.

***

### strategy?

```ts
optional strategy: VoiceEndpointingStrategy;
```

Endpointing strategy controlling speech detection.

***

### transcript?

```ts
optional transcript: VoiceTranscriptSegment[];
```

Existing transcript segments to seed the session.
