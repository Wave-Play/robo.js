# Interface: User

The shape of the returned object in the OAuth providers' `profile` callback,
available in the `jwt` and `session` callbacks,
or the second parameter of the `session` callback, when using a database.

## Extends

- `DefaultUser`

## Extended by

- [`AdapterUser`](Interface.AdapterUser.md)

## Properties

### email?

```ts
optional email: null | string;
```

#### Inherited from

`DefaultUser.email`

***

### id?

```ts
optional id: string;
```

#### Inherited from

`DefaultUser.id`

***

### image?

```ts
optional image: null | string;
```

#### Inherited from

`DefaultUser.image`

***

### name?

```ts
optional name: null | string;
```

#### Inherited from

`DefaultUser.name`
