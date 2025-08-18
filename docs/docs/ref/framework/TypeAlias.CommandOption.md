# Type Alias: CommandOption

```ts
type CommandOption: CommandOptionCommon & object | CommandOptionCommon & object;
```

Discriminated union:
- If type is 'channel', allow optional channelTypes: ChannelType[]
- Otherwise (or if type omitted), forbid channelTypes.
