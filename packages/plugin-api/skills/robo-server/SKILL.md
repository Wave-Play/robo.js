---
name: robo-server
description: "Reference guide for developing with @robojs/server — file routing, define(), RoboResponse, OpenAPI, testing."
user-invocable: true
argument-hint: "<question, or 'create <path>'>"
---

# @robojs/server Development Guide

Complete reference for AI agents building APIs with `@robojs/server`. This is NOT Express or Fastify — it uses file-based routing, named exports, and `RoboResponse` for control flow.

## Usage

```
/robo-server                       # Inject this guide as context
/robo-server create users/[id]     # Generate a route file at src/api/users/[id].ts
/robo-server <question>            # Answer a question about the framework
```

### Create Mode

When `$ARGUMENTS` starts with `create`, generate a route file. Parse the path after `create` and create `src/api/<path>.ts` with a working template using `define()`, proper imports, and RoboResponse error handling. Include GET by default; add POST/PUT/DELETE if the path implies a resource (`[id]` param = include GET/PUT/DELETE, collection path = include GET/POST). Follow the patterns in this guide exactly.

### Context / Question Mode

For all other invocations, use this guide as authoritative reference. If the user asks a question, answer it from these patterns.

---

## 1. Mental Model

```
src/api/hello.ts          → GET /api/hello
src/api/users/index.ts    → GET /api/users
src/api/users/[id].ts     → GET /api/users/:id
src/api/users/[...slug].ts → GET /api/users/* (catch-all)
```

- **Routes are files**, not registrations. No `app.get()`, no `router.use()`.
- **HTTP methods are named exports**: `export const GET`, `export const POST`, etc.
- **`define()` wraps handlers** with Zod schemas for type inference and OpenAPI generation.
- **Return data for success**, throw `RoboResponse` for errors.
- **Body is never auto-parsed** — always call `await request.json()`.

---

## 2. File-Based Routing

Files under `src/api/` map directly to URL paths:

| File Path | URL Route |
|-----------|-----------|
| `src/api/hello.ts` | `/api/hello` |
| `src/api/users/index.ts` | `/api/users` |
| `src/api/users/[id].ts` | `/api/users/:id` |
| `src/api/posts/[...slug].ts` | `/api/posts/*` (catch-all) |
| `src/api/posts/[[...slug]].ts` | `/api/posts/*` (optional catch-all) |

- Default prefix is `/api` (configurable, see §9).
- `[param]` captures a single path segment.
- `[...param]` captures all remaining segments joined with `/`.
- No `index` in the URL — `src/api/users/index.ts` serves `/api/users`.

---

## 3. Named Exports (HTTP Methods)

Export named constants for each HTTP method the route handles:

```typescript
import { RoboResponse } from '@robojs/server'

// Simple handler (no schema)
export function GET(request) {
  return { message: 'hello' }
}

export async function POST(request) {
  const body = await request.json()
  return { created: true }
}

export async function PUT(request) { /* ... */ }
export async function DELETE(request) { /* ... */ }
export async function PATCH(request) { /* ... */ }
```

**Auto-behaviors:**
- `OPTIONS` auto-responds with `Allow` header listing defined methods.
- `HEAD` falls back to `GET` handler if no `HEAD` export exists.
- Unsupported methods return `405 Method Not Allowed` with `Allow` header.

**Do NOT use default exports for route handlers.** Always use named exports.

---

## 4. The `define()` Function

`define()` attaches Zod schemas to a handler for TypeScript inference and OpenAPI generation. It does NOT perform runtime validation — schemas are metadata only.

```typescript
import { define, RoboResponse } from '@robojs/server'
import { z } from 'zod'

export const POST = define({
  // OpenAPI metadata
  summary: 'Create a user',
  description: 'Creates a new user in the system',
  tags: ['Users'],
  deprecated: false,

  // Request schemas (all optional)
  body: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
  query: z.object({
    notify: z.boolean().optional(),
  }),
  params: z.object({
    teamId: z.string(),
  }),
  headers: z.object({
    authorization: z.string(),
  }),

  // Response schemas by status code
  response: {
    201: z.object({ id: z.string(), name: z.string() }),
    400: z.object({ error: z.string(), message: z.string() }),
    409: z.object({ error: z.string(), message: z.string() }),
  },
}, async (request, reply) => {
  const body = await request.json()   // Typed: { name: string, email: string }
  const { teamId } = request.params   // Typed: { teamId: string }
  const { notify } = request.query    // Typed: { notify?: boolean }

  // ... business logic ...

  return { id: '123', name: body.name }  // 200 OK, auto-JSON
})
```

### Schema Fields Reference

| Field | Type | Purpose |
|-------|------|---------|
| `summary` | `string` | Short description (OpenAPI) |
| `description` | `string` | Detailed description (OpenAPI) |
| `tags` | `string[]` | OpenAPI grouping tags |
| `deprecated` | `boolean` | Mark endpoint as deprecated |
| `body` | `ZodType` | Request body schema |
| `query` | `ZodObject` | Query parameter schema |
| `params` | `ZodObject` | URL path parameter schema |
| `headers` | `ZodObject` | Request header schema |
| `response` | `Record<status, ZodType>` | Response schemas by HTTP status |

Supported status codes: `200`, `201`, `204`, `400`, `401`, `403`, `404`, `409`, `422`, `500`.

---

## 5. Request Object (`RoboRequest`)

`RoboRequest` extends the Web Request API:

```typescript
request.method                    // 'GET' | 'POST' | 'PUT' | etc.
request.url                       // Absolute URL string
request.headers                   // Web API Headers object
request.headers.get('auth...')    // Get a specific header
request.query                     // Record<string, string | string[]>
request.params                    // Record<string, string> from [brackets]
request.raw                       // Node.js IncomingMessage (NOT .req)
await request.json()              // Parse body as JSON (MUST await)
```

### Critical Rules

- **Body**: Always `await request.json()`. Never `request.body`.
- **Raw request**: `request.raw`. Never `request.req`.
- **Query**: `request.query` is pre-parsed. Comma-delimited values become arrays: `?ids=1,2,3` → `{ ids: ['1', '2', '3'] }`. Duplicate keys: last value wins.
- **Typed headers** (with `define()`): `request.header('authorization')` returns typed value.

---

## 6. Response Patterns

### Success — Return Data

Return a plain object for 200 OK. The framework auto-serializes to JSON:

```typescript
export const GET = define({ /* schema */ }, async (request) => {
  const user = await db.user.findUnique({ where: { id: request.params.id } })
  return { user }  // 200 OK, Content-Type: application/json
})
```

### Errors — Throw RoboResponse

Throw `RoboResponse` for all non-200 responses. This is the idiomatic pattern:

```typescript
import { RoboResponse } from '@robojs/server'

// JSON error response
throw RoboResponse.json(
  { error: 'NotFound', message: 'User not found' },
  { status: 404 }
)

// Empty response (e.g., 304 Not Modified)
throw new RoboResponse(null, { status: 304 })

// Response with custom headers
throw new RoboResponse(JSON.stringify({ error: 'Forbidden' }), {
  status: 403,
  headers: { 'X-Reason': 'insufficient-permissions' },
})
```

### Custom Success — Return RoboResponse

For non-200 success codes or custom headers, return (don't throw) a `RoboResponse`:

```typescript
return new RoboResponse(JSON.stringify({ id: created.id }), {
  status: 201,
  headers: { 'Content-Type': 'application/json', Location: `/api/users/${created.id}` },
})
```

### Reply Object (Headers Only)

The `reply` parameter exists for setting response headers. Do NOT use it to send responses:

```typescript
export const GET = define({ /* schema */ }, async (request, reply) => {
  // OK: Setting headers
  reply.header('X-Request-Id', crypto.randomUUID())
  reply.header('Cache-Control', 'public, max-age=300')

  // Then return data normally
  return { items: [] }
})
```

### Response Quick Reference

| Want | Pattern |
|------|---------|
| 200 + JSON | `return { data }` |
| 201 Created | `return new RoboResponse(body, { status: 201, headers: {...} })` |
| 204 No Content | `return new RoboResponse(null, { status: 204 })` |
| 304 Not Modified | `throw new RoboResponse(null, { status: 304 })` |
| 400 Bad Request | `throw RoboResponse.json({ error: '...' }, { status: 400 })` |
| 401 Unauthorized | `throw RoboResponse.json({ error: '...' }, { status: 401 })` |
| 403 Forbidden | `throw RoboResponse.json({ error: '...' }, { status: 403 })` |
| 404 Not Found | `throw RoboResponse.json({ error: '...' }, { status: 404 })` |
| 409 Conflict | `throw RoboResponse.json({ error: '...' }, { status: 409 })` |
| 429 Rate Limited | `throw RoboResponse.json({ error: '...' }, { status: 429 })` |
| 500 Server Error | `throw new Error('message')` (framework catches and returns 500) |

---

## 7. Error Handling

```typescript
export const DELETE = define({ /* schema */ }, async (request) => {
  const { id } = request.params

  const item = await db.item.findUnique({ where: { id } })
  if (!item) {
    throw RoboResponse.json(
      { error: 'NotFound', message: `Item ${id} not found` },
      { status: 404 }
    )
  }

  // Unhandled errors automatically become 500
  await db.item.delete({ where: { id } })

  return new RoboResponse(null, { status: 204 })
})
```

**How errors propagate:**
- **Thrown `RoboResponse` / `Response`** → sent directly as HTTP response.
- **Thrown `Error`** → caught by framework, logged, returned as 500 JSON.
- **Unhandled rejection** → same as thrown Error.

---

## 8. OpenAPI Generation

OpenAPI 3.1 specs are generated **automatically at build time** from `define()` schemas.

- Build command: `robo build` (or `npx robo build`)
- Output: `.robo/openapi.json`
- Route paths are converted: `users/[id]` → `/users/{id}`
- Each `define()` schema field maps to the corresponding OpenAPI construct

Configure in `config/plugins/robojs/server.ts`:

```typescript
export default {
  openapi: {
    title: 'My API',
    version: '1.0.0',
    description: 'API description',
    servers: [{ url: 'https://api.example.com' }],
    tags: [{ name: 'Users', description: 'User management' }],
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer' },
    },
    security: [{ bearerAuth: [] }],
  },
}
```

Disable with `openapi: false`.

---

## 9. Configuration

Plugin config file: `config/plugins/robojs/server.ts` (or `.mjs`)

```typescript
export default {
  port: 3000,                  // Default: 3000. Env: PORT
  hostname: '0.0.0.0',         // Default: 'localhost'. Env: ROBO_HOSTNAME
  prefix: '/api',              // Default: '/api'. Set false/null to disable.
  cors: true,                  // true = permissive (*). Or: { origins: [...], credentials: true }
  openapi: { title: 'API' },   // OpenAPI config or false
}
```

**CORS options:**
- `cors: true` — permissive: `Access-Control-Allow-Origin: *`, all methods, OPTIONS short-circuit.
- `cors: { origins: ['https://app.example.com'], credentials: true }` — restricted with cookies.

**Static file serving:**
- Dev: serves from `public/` directory.
- Production: serves from `.robo/public/`.
- SPA fallback: GET + HTML accept + no file extension + outside API prefix → serves `index.html`.

---

## 10. Testing

Import from `@robojs/server/testing`. Three tiers:

### Tier 1: Direct Handler Call

```typescript
import { createTestRequest } from '@robojs/server/testing'
import { GET } from '../src/api/users/[id]'

const request = createTestRequest({
  method: 'GET',
  params: { id: '123' },
  query: { include: 'profile' },
  headers: { authorization: 'Bearer token' },
})
const result = await GET(request)
```

### Tier 2: Route Module Dispatch

```typescript
import { testRoute } from '@robojs/server/testing'
import * as usersRoute from '../src/api/users/[id]'

const result = await testRoute(usersRoute, {
  method: 'POST',
  body: { name: 'Jane' },
  params: { id: '123' },
})

expect(result.status).toBe(201)
expect(await result.json()).toEqual({ id: '123', name: 'Jane' })
expect(result.header('Location')).toBe('/api/users/123')
```

### Tier 3: Multi-Route Client

```typescript
import { createTestClient } from '@robojs/server/testing'
import * as usersRoute from '../src/api/users/[id]'
import * as postsRoute from '../src/api/posts'

const client = createTestClient()
  .route('users/[id]', usersRoute)
  .route('posts', postsRoute)

const user = await client.get('/users/123')
expect(user.ok).toBe(true)

const post = await client.post('/posts', { body: { title: 'Hello' } })
expect(post.status).toBe(201)
```

`TestRouteResult` provides: `.status`, `.ok`, `.json()`, `.text()`, `.header(name)`.

### createTestRequest Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `method` | `string` | `'GET'` | HTTP method |
| `path` | `string` | `'/test'` | URL path |
| `params` | `Record<string, string>` | `{}` | URL params from `[brackets]` |
| `query` | `Record<string, string \| string[]>` | `{}` | Query string params |
| `headers` | `Record<string, string>` | `{}` | Request headers |
| `body` | `unknown` | — | Request body (auto-stringified) |
| `baseUrl` | `string` | `'http://localhost:3000'` | Base URL |

---

## 11. WebSocket Support

Only available with the Node engine (not Fastify):

```typescript
import { Server } from '@robojs/server'

const engine = Server.get()
engine?.registerWebsocket('/ws', (request, socket, head) => {
  // request: IncomingMessage, socket: Duplex, head: Buffer
})

// Default fallback for unmatched paths
engine?.registerWebsocket('default', (request, socket, head) => { /* ... */ })
```

---

## 12. Server Facade

```typescript
import { Server } from '@robojs/server'

await Server.ready()         // Wait for server to be listening
const engine = Server.get()  // Get the live engine instance
const config = Server.config() // Get resolved plugin options
```

---

## 13. Common Mistakes

| Mistake | Fix |
|---------|-----|
| `request.body` | `await request.json()` |
| `request.req` | `request.raw` |
| `res.status(404).json({...})` | `throw RoboResponse.json({...}, { status: 404 })` |
| `reply.code(200).json({...})` | `return { ... }` |
| `export default function handler` | `export const GET = define(...)` |
| `app.get('/users', ...)` | Create file `src/api/users.ts`, export `GET` |
| `import { z } from 'zod'` (v3) | Use Zod v4 (`zod@^4.0.0`) |
| `router.use(middleware)` | No middleware system — call helpers at top of handler |
| Manual OpenAPI YAML | Automatic from `define()` schemas at build time |
| `new Response(...)` | `new RoboResponse(...)` or `RoboResponse.json(...)` |

---

## 14. Complete Example

File: `src/api/users/[id].ts`

```typescript
import { define, RoboResponse } from '@robojs/server'
import { z } from 'zod'

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
})

const ErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
})

export const GET = define({
  summary: 'Get user by ID',
  tags: ['Users'],
  params: z.object({ id: z.string() }),
  response: {
    200: UserSchema,
    404: ErrorSchema,
  },
}, async (request) => {
  const { id } = request.params
  const user = await db.user.findUnique({ where: { id } })

  if (!user) {
    throw RoboResponse.json(
      { error: 'NotFound', message: `User ${id} not found` },
      { status: 404 }
    )
  }

  return { id: user.id, name: user.name, email: user.email }
})

export const PUT = define({
  summary: 'Update user',
  tags: ['Users'],
  params: z.object({ id: z.string() }),
  body: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
  }),
  response: {
    200: UserSchema,
    404: ErrorSchema,
  },
}, async (request) => {
  const { id } = request.params
  const body = await request.json()

  const user = await db.user.update({
    where: { id },
    data: body,
  })

  if (!user) {
    throw RoboResponse.json(
      { error: 'NotFound', message: `User ${id} not found` },
      { status: 404 }
    )
  }

  return { id: user.id, name: user.name, email: user.email }
})

export const DELETE = define({
  summary: 'Delete user',
  tags: ['Users'],
  params: z.object({ id: z.string() }),
  response: {
    204: z.void(),
    404: ErrorSchema,
  },
}, async (request) => {
  const { id } = request.params

  const user = await db.user.findUnique({ where: { id } })
  if (!user) {
    throw RoboResponse.json(
      { error: 'NotFound', message: `User ${id} not found` },
      { status: 404 }
    )
  }

  await db.user.delete({ where: { id } })
  return new RoboResponse(null, { status: 204 })
})
```
