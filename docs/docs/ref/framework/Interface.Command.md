# Interface: Command

## Properties

| Property | Type |
| ------ | ------ |
| `autocomplete?` | (`interaction`: `AutocompleteInteraction`\<`CacheType`\>) => `Promise`\<`ApplicationCommandOptionChoiceData`\<`string` \| `number`\>[]\> |
| `config?` | [`CommandConfig`](Interface.CommandConfig.md) |
| `default` | (`interaction`: `CommandInteraction`\<`CacheType`\>, `options`: `unknown`) => `unknown` |
