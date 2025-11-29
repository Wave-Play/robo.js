# Interface: FlashcoreOptions

Options for Flashcore storage layer operations

Used by low-level storage functions to specify which store to operate on.

## Examples

```ts
// Default store
await store.getUser(guildId, userId) // Uses 'default'
```

```ts
// Custom store
await store.getUser(guildId, userId, { storeId: 'reputation' })
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
