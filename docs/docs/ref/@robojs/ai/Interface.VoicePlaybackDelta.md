# Interface: VoicePlaybackDelta

Delta describing audio playback data streamed to the caller.

## Properties

### channels

```ts
channels: number;
```

Number of channels contained in the audio chunk.

***

### data

```ts
data: Buffer;
```

Audio payload encoded as specified by [VoicePlaybackDelta.encoding](Interface.VoicePlaybackDelta.md#encoding).

***

### encoding

```ts
encoding: "pcm16" | "opus";
```

Encoding of the playback data.

***

### isFinal

```ts
isFinal: boolean;
```

Indicates whether this is the final chunk for the response.

***

### sampleRate

```ts
sampleRate: number;
```

Sample rate of the playback chunk.

***

### timestamp

```ts
timestamp: number;
```

Timestamp (ms) establishing playback ordering.
