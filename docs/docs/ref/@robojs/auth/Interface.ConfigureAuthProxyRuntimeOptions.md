# Interface: ConfigureAuthProxyRuntimeOptions

Runtime options for [configureAuthProxyRuntime](Function.configureAuthProxyRuntime.md) (upstream proxy mode).

Fields:
- `localBasePath`: Path where Robo exposes auth endpoints locally.
- `targetBasePath?`: Path on the upstream server (defaults to `localBasePath`).
- `baseUrl`: Upstream Robo/Auth.js URL (must include protocol + domain).
- `cookieName?`: Session cookie name (defaults to `authjs.session-token`).
- `secret?`: Optional JWT secret for local decoding (reduces upstream calls; without it every [getToken](Function.getToken.md) call hits upstream).
- `sessionStrategy`: `'jwt' | 'database'` matching the upstream server.
- `headers?`: Extra headers forwarded to upstream (e.g., `X-API-Key`).
- `fetch?`: Custom fetch implementation (testing, retries, special agents).

⚠️ Security:
- `baseUrl` should use HTTPS to protect session cookies in transit.
- Additional headers may carry secrets; ensure the upstream server validates them.
- Provide `secret` when possible so JWT decoding happens locally instead of forwarding tokens.

Performance:
- Supplying `secret` enables local JWT decoding, cutting proxy traffic roughly in half.
- Custom `fetch` can implement retries, keep-alive, or caching.

Edge cases:
- `targetBasePath` defaults to `localBasePath`. Set explicitly if they differ.
- `cookieName` must match upstream; mismatches prevent session lookups.
- `sessionStrategy` mismatch leads to `getToken`/`getServerSession` failures.

## See

configureAuthProxyRuntime

## Properties

### baseUrl

```ts
baseUrl: string;
```

***

### cookieName?

```ts
optional cookieName: string;
```

***

### fetch?

```ts
optional fetch: FetchLike;
```

***

### headers?

```ts
optional headers: Record<string, string>;
```

***

### localBasePath

```ts
localBasePath: string;
```

***

### secret?

```ts
optional secret: string;
```

***

### sessionStrategy

```ts
sessionStrategy: "jwt" | "database";
```

***

### targetBasePath?

```ts
optional targetBasePath: string;
```
