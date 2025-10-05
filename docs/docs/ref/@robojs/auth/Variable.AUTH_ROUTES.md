# Variable: AUTH\_ROUTES

```ts
const AUTH_ROUTES: RouteConfig[];
```

Robo-authenticated routes mounted under the configured `basePath`.

## Example

```ts
for (const route of AUTH_ROUTES) {
  router.register(route.method, `${basePath}${route.path}`, handler)
}
```
