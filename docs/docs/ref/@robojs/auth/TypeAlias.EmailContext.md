# Type Alias: EmailContext

```ts
type EmailContext: object;
```

Contextual data passed to every email template or builder, enabling
personalized content and conditional workflows.

## Type declaration

### appName

```ts
appName: string;
```

Application display name from config (defaults to "Robo.js").

### links?

```ts
optional links: object;
```

Pre-built absolute URLs for verification or password reset actions.

### links.resetPassword?

```ts
optional resetPassword: string;
```

### links.verifyEmail?

```ts
optional verifyEmail: string;
```

### request?

```ts
optional request: object;
```

Request metadata such as origin/base URL used to build links. May be
undefined when the request context is not available (e.g. background jobs).

### request.origin?

```ts
optional origin: string | null;
```

### session?

```ts
optional session: object;
```

Session metadata present for the `session:created` event.

### session.id?

```ts
optional id: string | null;
```

### session.ip?

```ts
optional ip: string | null;
```

### session.userAgent?

```ts
optional userAgent: string | null;
```

### tokens?

```ts
optional tokens: object;
```

Raw tokens for verification/reset flows (use links for user-facing URLs).

### tokens.resetPassword?

```ts
optional resetPassword: string;
```

### tokens.verifyEmail?

```ts
optional verifyEmail: string;
```

### user

```ts
user: object;
```

Adapter user record (email/name may be null for certain providers).

### user.email?

```ts
optional email: string | null;
```

### user.id

```ts
id: string;
```

### user.name?

```ts
optional name: string | null;
```

## Example

```ts
const greeting = `Hi ${ctx.user.name ?? 'there'}`
const auditNote = ctx.session?.ip ? `IP ${ctx.session.ip}` : 'No session data'
```
