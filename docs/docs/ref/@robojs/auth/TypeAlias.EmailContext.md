# Type Alias: EmailContext

```ts
type EmailContext: object;
```

Data passed to email templates and builders.

## Type declaration

### appName

```ts
appName: string;
```

### links?

```ts
optional links: object;
```

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

### request.origin?

```ts
optional origin: string | null;
```

### session?

```ts
optional session: object;
```

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
