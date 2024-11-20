# Interface: Command

## Properties

### autocomplete()?

```ts
optional autocomplete: (interaction) => Promise<ApplicationCommandOptionChoiceData<string | number>[]>;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `interaction` | `AutocompleteInteraction`\<`CacheType`\> |

#### Returns

`Promise`\<`ApplicationCommandOptionChoiceData`\<`string` \| `number`\>[]\>

***

### config?

```ts
optional config: CommandConfig;
```

***

### default()

```ts
default: (interaction, options) => unknown;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `interaction` | `CommandInteraction`\<`CacheType`\> |
| `options` | `unknown` |

#### Returns

`unknown`
