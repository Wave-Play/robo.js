# Interface: GetXPOptions

Options for retrieving XP data

## Examples

```ts
// Default store
await XP.getXP(guildId, userId) // Uses 'default'
```

```ts
// Custom store
await XP.getXP(guildId, userId, { storeId: 'reputation' })
```

## Extends

- [`StoreOptions`](Interface.StoreOptions.md)

## Properties

### storeId?

```ts
optional storeId: string;
```

Store identifier for isolating XP data

#### Default

```ts
'default'
```

#### Inherited from

[`StoreOptions`](Interface.StoreOptions.md).[`storeId`](Interface.StoreOptions.md#storeid)
