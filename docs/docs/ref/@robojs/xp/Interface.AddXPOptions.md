# Interface: AddXPOptions

Options for adding XP to a user

## Examples

```ts
{ reason: 'admin_bonus' }
```

```ts
// Custom store with reason
{ reason: 'quest', storeId: 'reputation' }
```

## Extends

- [`StoreOptions`](Interface.StoreOptions.md)

## Properties

### reason?

```ts
optional reason: string;
```

Optional audit trail reason for XP change

***

### storeId?

```ts
optional storeId: string;
```

Store identifier (defaults to 'default')

#### Inherited from

[`StoreOptions`](Interface.StoreOptions.md).[`storeId`](Interface.StoreOptions.md#storeid)
