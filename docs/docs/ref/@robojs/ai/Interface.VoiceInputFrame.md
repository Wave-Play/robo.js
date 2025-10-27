# Interface: VoiceInputFrame

Audio frame delivered to the engine when streaming microphone input.

## Properties

### channels

```ts
channels: number;
```

Number of audio channels encoded within the frame.

***

### data

```ts
data: Buffer;
```

Raw PCM data for the frame.

***

### encoding

```ts
encoding: "pcm16";
```

Encoding used for `data`.

***

### isSpeechEnd?

```ts
optional isSpeechEnd: boolean;
```

Signals when the caller believes speech content has ended.

***

### length

```ts
length: number;
```

Frame length in PCM samples.

***

### sampleRate

```ts
sampleRate: number;
```

Sample rate applied to the frame.

***

### speakerId?

```ts
optional speakerId: null | string;
```

Optional speaker identifier for diarization-aware engines.

***

### timestamp

```ts
timestamp: number;
```

Timestamp in milliseconds when the frame was captured.
