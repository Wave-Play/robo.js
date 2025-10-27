# Interface: EngineSupportedFeatures

Enumerates feature flags describing the optional capabilities an engine exposes.

## Properties

### vision

```ts
vision: boolean;
```

Signals that the model can consume multimodal inputs such as images.

***

### voice

```ts
voice: boolean;
```

Indicates whether the engine can join and respond within voice sessions.

***

### voiceTranscription

```ts
voiceTranscription: boolean;
```

True when the engine can perform speech-to-text transcription.
