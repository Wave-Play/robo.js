# Interface: VoiceSessionHandle

Handle returned by [BaseEngine.startVoiceSession](Class.BaseEngine.md#startvoicesession) to control an active session.

## Properties

### channelId

```ts
channelId: string;
```

Voice channel identifier associated with the session.

***

### commitInput()?

```ts
optional commitInput: () => Promise<void>;
```

Requests that buffered audio be committed for processing.

#### Returns

`Promise`\<`void`\>

***

### guildId

```ts
guildId: string;
```

Guild identifier for the session.

***

### id

```ts
id: string;
```

Unique identifier assigned to the session.

***

### pump()?

```ts
optional pump: (frame) => Promise<void>;
```

Pump additional audio frames into the session.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `frame` | [`VoiceInputFrame`](Interface.VoiceInputFrame.md) |

#### Returns

`Promise`\<`void`\>

***

### stop()?

```ts
optional stop: (reason?) => Promise<void>;
```

Stop the session and optionally provide a reason.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `reason`? | `string` |

#### Returns

`Promise`\<`void`\>

***

### textChannelId?

```ts
optional textChannelId: null | string;
```

Related text channel identifier, when applicable.
