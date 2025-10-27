# Interface: VoiceTranscriptSegment

Transcription segment produced during a voice session.

## Properties

### isFinal

```ts
isFinal: boolean;
```

Indicates whether the transcript text is final.

***

### position

```ts
position: object;
```

Millisecond offsets covering the speech segment.

| Name | Type | Description |
| ------ | ------ | ------ |
| `end` | `number` | Exclusive end timestamp in milliseconds. |
| `start` | `number` | Inclusive start timestamp in milliseconds. |

***

### speakerId?

```ts
optional speakerId: null | string;
```

Optional speaker identifier, if diarization is enabled.

***

### text

```ts
text: string;
```

Recognized transcript text.
