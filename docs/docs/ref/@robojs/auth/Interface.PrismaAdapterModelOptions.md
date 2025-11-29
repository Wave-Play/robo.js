# Interface: PrismaAdapterModelOptions

Customizes Prisma model names when your schema deviates from the defaults.
Currently only the password model is configurable.

Field guidance:
- `password`: Name of the password model (defaults to `password`). Must refer
  to a model with fields `id`, `userId`, `email`, `hash`, `createdAt`, `updatedAt`.

Edge cases:
- Names are case-sensitive. Passing the wrong case throws during adapter init.
- Custom models must match the expected schema; missing fields cause runtime errors.

## Examples

```ts
createPrismaAdapter({
	client: prisma,
	secret: process.env.AUTH_SECRET!,
	models: { password: 'userPassword' }
})
```

```ts
createPrismaAdapter({ client: prisma, secret: process.env.AUTH_SECRET! })
```

## See

DEFAULT_PASSWORD_MODEL for the fallback name.

## Properties

### password?

```ts
optional password: string;
```
