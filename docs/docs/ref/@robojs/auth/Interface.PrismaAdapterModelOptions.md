# Interface: PrismaAdapterModelOptions

Allows mapping the adapter to custom Prisma model names when your schema deviates from defaults.

## Example

```ts
const adapter = createPrismaAdapter({
	client: prisma,
	secret: process.env.AUTH_SECRET!,
	models: { password: 'userPassword' }
})
```

## Properties

### password?

```ts
optional password: string;
```
