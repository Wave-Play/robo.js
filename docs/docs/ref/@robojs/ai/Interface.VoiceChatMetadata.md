# Interface: VoiceChatMetadata

Supplemental metadata describing a voice interaction.

## Properties

### segments?

```ts
optional segments: VoiceTranscriptSegment[];
```

Transcript segments accumulated thus far.

***

### strategy?

```ts
optional strategy: VoiceEndpointingStrategy;
```

Voice endpointing strategy used in the session.

***

### wasCommitted?

```ts
optional wasCommitted: boolean;
```

Indicates whether the input stream was committed.
