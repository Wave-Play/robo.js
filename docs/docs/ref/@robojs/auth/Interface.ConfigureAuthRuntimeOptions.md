# Interface: ConfigureAuthRuntimeOptions

Runtime configuration for [configureAuthRuntime](Function.configureAuthRuntime.md) (local mode).

Fields:
- `basePath`: Auth route prefix (e.g., `/api/auth`). Must match Auth.js config.
- `baseUrl`: Canonical URL (with protocol + domain) used for callbacks.
- `cookieName`: Session cookie name. Use `__Secure-`/`__Host-` prefixes in production.
- `secret`: Auth.js secret used for JWT signing and token hashing.
- `sessionStrategy`: `'jwt' | 'database'` to mirror Auth.js config.

⚠️ Security:
- Secrets must stay on the server; never expose to clients or version control.
- `baseUrl` should be HTTPS in production. HTTP is acceptable only for localhost.
- `cookieName` with `__Secure-` prefix requires HTTPS; `__Host-` requires HTTPS + no domain/path.

Edge cases:
- `basePath` mismatches cause Robo's router to 404 Auth routes.
- `sessionStrategy` must align with adapter configuration (JWT vs database sessions).

## See

 - configureAuthRuntime
 - AuthConfig from `@auth/core`

## Properties

### basePath

```ts
basePath: string;
```

***

### baseUrl

```ts
baseUrl: string;
```

***

### cookieName

```ts
cookieName: string;
```

***

### secret

```ts
secret: string;
```

***

### sessionStrategy

```ts
sessionStrategy: "jwt" | "database";
```
