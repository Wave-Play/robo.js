# Interface: VoiceChatResult

Voice-specific response envelope accompanying chat results.

## Properties

### audio?

```ts
optional audio: AsyncIterable<VoicePlaybackDelta>;
```

Async iterator streaming audio playback deltas.

***

### metadata?

```ts
optional metadata: VoiceChatMetadata;
```

Additional metadata describing the voice session.

***

### sessionId

```ts
sessionId: string;
```

Identifier of the active voice session.
