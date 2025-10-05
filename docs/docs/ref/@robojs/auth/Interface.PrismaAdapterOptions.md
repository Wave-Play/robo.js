# Interface: PrismaAdapterOptions

Configuration object accepted by [createPrismaAdapter](Function.createPrismaAdapter.md).

## Example

```ts
createPrismaAdapter({
	client: prisma,
	secret: process.env.AUTH_SECRET!,
	hashParameters: { memoryCost: 19456 }
})
```

## Properties

### client

```ts
client: PrismaClientLike;
```

***

### hashParameters?

```ts
optional hashParameters: Partial<Argon2Params>;
```

***

### models?

```ts
optional models: PrismaAdapterModelOptions;
```

***

### secret

```ts
secret: string;
```
