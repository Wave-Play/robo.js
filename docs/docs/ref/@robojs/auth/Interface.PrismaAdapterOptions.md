# Interface: PrismaAdapterOptions

Complete configuration object for [createPrismaAdapter](Function.createPrismaAdapter.md).

Fields:
- `client`: Required [PrismaClientLike](Interface.PrismaClientLike.md) instance with user + password models.
- `secret`: Required token hashing secret. Minimum 32 characters recommended.
- `hashParameters?`: Optional PasswordHashParams overrides for Argon2id
  (defaults to `DEFAULT_ARGON2_PARAMS` from `src/utils/password-hash.ts`).
- `models?`: Optional [PrismaAdapterModelOptions](Interface.PrismaAdapterModelOptions.md) for custom model names.

⚠️ Security:
- Never commit secrets; load them from environment variables or secret stores.
- Increasing `hashParameters` strengthens security but may slow down hashing on low-memory hosts.
- Changing `hashParameters` requires rehashing existing passwords. The adapter handles this lazily on verify.

Performance notes:
- Each adapter method runs 1–3 database queries. Enable Prisma connection pooling for high throughput.
- Auto-rehashing adds latency to the first login after parameters change.

Edge cases:
- Call `await prisma.$connect()` before passing the client if your environment requires manual connections.
- Keep `hashParameters` consistent across all adapter instances (workers). Use shared env vars.

## Examples

```ts
createPrismaAdapter({ client: prisma, secret: process.env.AUTH_SECRET! })
```

```ts
createPrismaAdapter({
	client: prisma,
	secret: process.env.AUTH_SECRET!,
	hashParameters: { memorySize: 8192, passes: 4 }
})
```

```ts
createPrismaAdapter({
	client: prisma,
	secret: process.env.AUTH_SECRET!,
	models: { password: 'userCredentials' }
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
