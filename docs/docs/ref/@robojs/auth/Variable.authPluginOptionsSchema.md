# Variable: authPluginOptionsSchema

```ts
const authPluginOptionsSchema: ZodObject<object, "strict", ZodTypeAny, object, object>;
```

Zod schema enforcing the structure of `@robojs/auth` plugin configuration.

## Type declaration

### adapter

```ts
adapter: ZodOptional<ZodUnknown>;
```

Storage adapter for users, sessions, and accounts.

### allowDangerousEmailAccountLinking

```ts
allowDangerousEmailAccountLinking: ZodOptional<ZodBoolean>;
```

⚠️ Security: auto‑link accounts by email across OAuth providers.
Leave disabled unless you fully trust every provider.

### appName

```ts
appName: ZodOptional<ZodString>;
```

Display name for your app (used in emails and UI).

#### Default

```ts
"Robo.js"
```

### basePath

```ts
basePath: ZodOptional<ZodString>;
```

Base path for all auth routes.

#### Default

```ts
"/api/auth"
```

#### Examples

```ts
"/api/auth"
```

```ts
"/auth"
```

### callbacks

```ts
callbacks: ZodOptional<ZodObject<object, "strip", ZodTypeAny, object, object>> = callbacksSchema;
```

Auth.js callback hooks.

### cookies

```ts
cookies: ZodOptional<ZodObject<object, "strip", ZodTypeAny, object, object>> = cookiesSchema;
```

Cookie overrides for Auth.js cookies.

### debug

```ts
debug: ZodOptional<ZodBoolean>;
```

Enable verbose Auth.js debug logging.

### email

```ts
email: ZodOptional<ZodObject<object, "strip", ZodTypeAny, object, object>> = emailSchema;
```

Legacy email config (prefer `emails`).

### emails

```ts
emails: ZodOptional<ZodObject<object, "strip", ZodTypeAny, object, object>> = emailsSchema;
```

Rich email system configuration.

### events

```ts
events: ZodOptional<ZodObject<object, "strip", ZodTypeAny, object, object>> = eventsSchema;
```

Auth.js event handlers.

### pages

```ts
pages: ZodOptional<ZodObject<object, "strip", ZodTypeAny, object, object>> = pagesSchema;
```

Custom UI pages for Auth.js.

### providers

```ts
providers: ZodOptional<ZodArray<ZodAny, "many">>;
```

Array of authentication providers.

### redirectProxyUrl

```ts
redirectProxyUrl: ZodOptional<ZodString>;
```

Proxy URL used for preview deployments to build correct redirects.

### secret

```ts
secret: ZodOptional<ZodString>;
```

Secret for JWT signing and token hashing.

⚠️ Security: Required in production. Reads from `AUTH_SECRET` or
`NEXTAUTH_SECRET` when not explicitly provided.

#### Example

```ts
process.env.AUTH_SECRET
```

### session

```ts
session: ZodOptional<ZodObject<object, "strip", ZodTypeAny, object, object>> = sessionSchema;
```

Session strategy and timing controls.

### upstream

```ts
upstream: ZodOptional<ZodObject<object, "strict", ZodTypeAny, object, object>>;
```

Forward all auth routes to another Robo instance.

### url

```ts
url: ZodOptional<ZodString>;
```

Canonical application URL used by Auth.js in redirects.

## Example

```ts
const config = authPluginOptionsSchema.parse({ basePath: '/api/auth' })
```

## See

AuthPluginOptions
