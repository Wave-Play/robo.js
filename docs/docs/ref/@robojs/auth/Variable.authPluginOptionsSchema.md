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

### allowDangerousEmailAccountLinking

```ts
allowDangerousEmailAccountLinking: ZodOptional<ZodBoolean>;
```

### appName

```ts
appName: ZodOptional<ZodString>;
```

### basePath

```ts
basePath: ZodOptional<ZodString>;
```

### callbacks

```ts
callbacks: ZodOptional<ZodObject<object, "strip", ZodTypeAny, object, object>> = callbacksSchema;
```

### cookies

```ts
cookies: ZodOptional<ZodObject<object, "strip", ZodTypeAny, object, object>> = cookiesSchema;
```

### debug

```ts
debug: ZodOptional<ZodBoolean>;
```

### email

```ts
email: ZodOptional<ZodObject<object, "strip", ZodTypeAny, object, object>> = emailSchema;
```

### emails

```ts
emails: ZodOptional<ZodObject<object, "strip", ZodTypeAny, object, object>> = emailsSchema;
```

### events

```ts
events: ZodOptional<ZodObject<object, "strip", ZodTypeAny, object, object>> = eventsSchema;
```

### pages

```ts
pages: ZodOptional<ZodObject<object, "strip", ZodTypeAny, object, object>> = pagesSchema;
```

### providers

```ts
providers: ZodOptional<ZodArray<ZodAny, "many">>;
```

### redirectProxyUrl

```ts
redirectProxyUrl: ZodOptional<ZodString>;
```

### secret

```ts
secret: ZodOptional<ZodString>;
```

### session

```ts
session: ZodOptional<ZodObject<object, "strip", ZodTypeAny, object, object>> = sessionSchema;
```

### upstream

```ts
upstream: ZodOptional<ZodObject<object, "strict", ZodTypeAny, object, object>>;
```

### url

```ts
url: ZodOptional<ZodString>;
```

## Example

```ts
const config = authPluginOptionsSchema.parse({ basePath: '/api/auth' })
```
