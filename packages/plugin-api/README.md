# @robojs/server

Elevate your Robo.js project with `@robojs/server`, a powerful plugin that provides an effortless way to create and manage web routes. This guide will walk you through the essentials of setting up and using the API plugin.

> **Heads up!** RoboPlay Pods are currently optimized for bots and do not support API servers. This will be supported in the coming weeks.

## Installation 💻

To add this plugin to your Robo.js project:

```bash
npx robo add @robojs/server
```

New to Robo.js? Start your project with this plugin pre-installed:

```bash
npx create-robo <project-name> -p @robojs/server
```

## Getting Started

Create a new API route by adding a file in `/src/api`. For example, creating `hello.js` with the following content:

```javascript
export default () => {
	return 'Hello World!'
}
```

Now, run your Robo and visit `http://localhost:3000/api/hello` to see the route in action.

## Routing

Routes are created based on your file structure within `/src/api`. The path to the file translates to the route URL. For example:

- `test.js` → `/api/test`
- `auth/sign-in.js` → `/api/auth/sign-in`
- `user/[id]/dashboard.js` → `/api/user/:id/dashboard`

Default routes are prefixed with `/api`. You can modify this prefix in the plugin's config file by setting the `prefix` field to `null` or `false`.

## Usage

Route files can export handlers in two ways:

### Named HTTP Method Exports (Recommended)

Export functions named after HTTP methods for cleaner, more explicit route handling:

```typescript
// src/api/users/[id].ts
import type { RoboRequest } from '@robojs/server'

export function GET(request: RoboRequest) {
	const userId = request.params.id
	return { message: `User ID is ${userId}` }
}

export async function POST(request: RoboRequest) {
	const userData = await request.json()
	return { success: true, userData }
}

export function DELETE(request: RoboRequest) {
	const userId = request.params.id
	return { deleted: userId }
}
```

Supported methods: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS`, `HEAD`

**Automatic behaviors:**
- `OPTIONS` requests auto-respond with allowed methods if not explicitly handled
- `HEAD` requests automatically use your `GET` handler if no `HEAD` export exists
- Unsupported methods return `405 Method Not Allowed` with an `Allow` header

### Default Export (Legacy)

You can also export a default function that handles all HTTP methods:

```javascript
export default (request, reply) => {
	if (request.method !== 'GET') {
		throw new Error('Method not allowed')
	}

	const userId = request.params.id
	return { message: `User ID is ${userId}` }
}
```

### Mixed Usage

Combine both patterns—named exports take priority, with the default as a fallback:

```typescript
export function GET(request) {
	return { data: 'Handled by GET export' }
}

// Handles POST, PUT, DELETE, etc.
export default (request) => {
	return { data: 'Handled by default export' }
}
```

Returning a value from the route function will automatically send a response with the value as the body. The same is true for throwing an error.

If you need to manually send a response, use the `reply` object. This object provides methods to set the status code, headers, and body.

Don't want to use Robo's wrappers? Access the raw request and response objects using `request.req` and `reply.res`.

## Testing

The `@robojs/server/testing` module provides utilities for unit testing your API endpoints without launching a server. This makes tests faster and more isolated.

### Setup

Import testing utilities from the dedicated subpath:

```typescript
import { createTestRequest, testRoute, testHandler, createTestClient } from '@robojs/server/testing'
```

### Testing Individual Handlers

Use `createTestRequest` to create a `RoboRequest` and call your handler directly:

```typescript
import { createTestRequest } from '@robojs/server/testing'
import { GET, POST } from '../src/api/users/[id]'

// Test a GET handler
const request = createTestRequest({
	params: { id: '123' },
	query: { include: 'profile' }
})
const response = await GET(request)
expect(response).toEqual({ id: '123', include: 'profile' })

// Test a POST handler with body
const postRequest = createTestRequest({
	method: 'POST',
	params: { id: '123' },
	body: { name: 'John' }
})
const postResponse = await POST(postRequest)
```

### Testing Route Modules

Use `testRoute` to test a route module with automatic method dispatch:

```typescript
import { testRoute } from '@robojs/server/testing'
import * as usersRoute from '../src/api/users/[id]'

// Dispatches to the correct handler based on method
const result = await testRoute(usersRoute, {
	method: 'POST',
	params: { id: '123' },
	body: { name: 'Jane' }
})

expect(result.status).toBe(200)
expect(await result.json()).toEqual({ id: '123', name: 'Jane' })

// Convenience methods available on the result
expect(result.ok).toBe(true)
expect(result.header('Content-Type')).toBe('application/json')
```

### Testing Handler Return Values

Use `testHandler` when you want the raw return value from a handler (before it's wrapped in a Response):

```typescript
import { testHandler } from '@robojs/server/testing'
import { GET } from '../src/api/users/[id]'

// Returns the handler's raw return value
const result = await testHandler(GET, {
	params: { id: '123' }
})

// Result is directly what the handler returned
expect(result).toEqual({ id: '123', name: 'John' })
```

This is useful when your handler returns plain objects and you want to test the logic without Response wrapping.

### Testing Multiple Routes

Use `createTestClient` for integration-style tests with multiple routes:

```typescript
import { createTestClient } from '@robojs/server/testing'
import * as usersRoute from '../src/api/users/[id]'
import * as postsRoute from '../src/api/posts'

const client = createTestClient()
	.route('users/[id]', usersRoute)
	.route('posts', postsRoute)

// Make requests - params are automatically extracted from the URL
const user = await client.get('/users/123')
expect(user.status).toBe(200)

const post = await client.post('/posts', { body: { title: 'Hello' } })
expect(post.status).toBe(201)

// Supports all HTTP methods
await client.put('/users/123', { body: { name: 'Updated' } })
await client.delete('/users/123')
await client.patch('/users/123', { body: { active: true } })
```

### Request Options

All testing functions accept these options:

| Option    | Type                               | Description                                   |
| --------- | ---------------------------------- | --------------------------------------------- |
| `method`  | `string`                           | HTTP method (defaults to `'GET'`)             |
| `path`    | `string`                           | URL path (defaults to `'/test'`)              |
| `params`  | `Record<string, string>`           | URL parameters (e.g., `{ id: '123' }`)        |
| `query`   | `Record<string, string \| string[]>` | Query string parameters                       |
| `headers` | `Record<string, string>`           | Request headers                               |
| `body`    | `unknown`                          | Request body (auto-serialized to JSON)        |
| `baseUrl` | `string`                           | Base URL (defaults to `'http://localhost:3000'`) |

### Throwable Responses

Did you know that throwing an error in your route function will automatically send a response with the error message? This is a handy way to handle errors in your API routes.

```javascript
export default (request, reply) => {
	if (!request.query.key) {
		throw new Error('API key is required')
	}

	// ... perform some action with the key

	return { message: 'Success!' }
}
```

What's more, you can customize the response by throwing a `RoboResponse` object. This object allows you to set the status code, headers, and body of the response. It has the same effect as returning it.

```javascript
export default (request, reply) => {
	if (!request.query.key) {
		throw new RoboResponse({
			statusCode: 401,
			headers: { 'WWW-Authenticate': 'Bearer' },
			body: 'Unauthorized'
		})
	}

	// ... perform some action with the key

	return RoboResponse.json({ message: 'Success!' })
}
```

## API Reference

Here's a detailed breakdown of the methods and properties available in the `request` and `reply` objects, along with their TypeScript types.

### Server

The `Server` object can be used to get the underlying server configuration, engine instance, and wait for it to be ready.

```typescript
import { Server } from '@robojs/server'

export default async () => {
	// Get the server configuration
	console.log('Config:', Server.config())

	// Get the server engine instance
	console.log('Engine:', Server.get())

	// Wait for the server to be ready
	await Server.ready()
}
```

### RoboRequest

**RoboRequest** extends the **[Web Request API](https://developer.mozilla.org/en-US/docs/Web/API/Request)** and provides additional properties and methods for handling requests.

| **Method/Property** | **Type**                             | **Description**                 |
| ------------------- | ------------------------------------ | ------------------------------- |
| `req`               | `IncomingMessage`                    | Raw request object.             |
| `json`              | `unknown`                            | Parse the request body as JSON. |
| `method`            | `HttpMethod`                         | Get the HTTP method.            |
| `query`             | `Record<string, string \| string[]>` | Access query parameters.        |
| `params`            | `Record<string, unknown>`            | Get URL parameters.             |

### Reply

| **Method/Property** | **Type**                                     | **Description**                          |
| ------------------- | -------------------------------------------- | ---------------------------------------- |
| `res`               | `ServerResponse`                             | Raw response object.                     |
| `code`              | `(statusCode: number) => RoboReply`          | Set the HTTP status code.                |
| `send`              | `(data: string) => RoboReply`                | Send the response content.               |
| `header`            | `(name: string, value: string) => RoboReply` | Set a response header.                   |
| `hasSent`           | `boolean`                                    | Indicates if the response has been sent. |

These types can be imported from the plugin's package for enhanced TypeScript support.

```ts
import type { RoboRequest, RoboReply } from '@robojs/server'
```

## Plugin Configuration

Customize your API plugin using these config fields:

| **Config Field**    | **Type**       | **Description**                                            |
| ------------------- | -------------- | ---------------------------------------------------------- |
| `hostname`          | `string`       | The hostname on which the server will run.                 |
| `port`              | `number`       | The port on which the server will listen.                  |
| `maxPortAttempts`   | `number`       | Max ports to try when configured port is in use. Default: 10. |
| `prefix`            | `string/false` | Custom URL prefix for routes or disable it.                |
| `engine`            | `BaseServer`   | Custom server engine implementation.                       |

Example:

```typescript title="config/plugins/robojs/server.mjs"
// File: /config/plugins/robojs/server.mjs
export default {
	hostname: '0.0.0.0', // Defaults to 'localhost'
	port: 5000, // Custom port
	prefix: false, // Disable the '/api' prefix
	engine: CustomServer // Custom server engine
}
```

In this configuration, `port` is set to `5000`, `prefix` is disabled (routes will not have the `/api` prefix), and a custom server engine is specified.

Alternatively, use the `PORT` environment variable.

### Automatic Port Increment

By default, if the configured port is already in use, the server will automatically try the next port (up to 10 attempts). A warning will be logged when this happens:

```
[server] Port 3000 is in use. Using port 3001 instead.
```

To disable this behavior, set `maxPortAttempts` to `1`:

```typescript title="config/plugins/robojs/server.mjs"
export default {
	port: 3000,
	maxPortAttempts: 1 // Disable auto-increment, fail if port is in use
}
```

To allow more or fewer attempts:

```typescript title="config/plugins/robojs/server.mjs"
export default {
	port: 3000,
	maxPortAttempts: 5 // Try up to 5 ports (3000-3004)
}
```

## Typed Endpoints

Define typed API endpoints with Zod schemas for TypeScript inference and OpenAPI generation:

```typescript
import { define } from '@robojs/server'
import { z } from 'zod'

export const POST = define({
  summary: 'Create a user',
  body: z.object({
    name: z.string(),
    email: z.string().email()
  }),
  response: {
    201: z.object({ id: z.string() }),
    400: z.object({ error: z.string() })
  }
}, async (request) => {
  const body = await request.json()  // Typed as { name: string, email: string }
  return { id: crypto.randomUUID() }
})
```

The `define()` function provides:
- **TypeScript inference** for `request.json()`, `request.query`, `request.params`, and `request.header()`
- **OpenAPI 3.1 generation** during `robo build`
- **No auto-parsing** - raw body access is always available via `await request.json()`

### Schema Options

| Option | Type | Description |
|--------|------|-------------|
| `summary` | `string` | Short description for OpenAPI |
| `description` | `string` | Detailed description for OpenAPI |
| `tags` | `string[]` | OpenAPI tags for grouping |
| `deprecated` | `boolean` | Mark endpoint as deprecated |
| `body` | `ZodType` | Request body schema |
| `query` | `ZodObject` | Query parameters schema |
| `params` | `ZodObject` | URL parameters schema |
| `headers` | `ZodObject` | Request headers schema |
| `response` | `Record<number, ZodType>` | Response schemas by status code |

### OpenAPI Generation

Run `robo build` to generate `.robo/openapi.json` from your typed endpoints.

To configure OpenAPI generation, add options to your plugin config:

```typescript
// config/plugins/robojs/server.ts
export default {
  openapi: {
    title: 'My API',
    version: '1.0.0',
    servers: [{ url: 'https://api.example.com' }],
    contact: { name: 'Support', email: 'support@example.com' },
    license: { name: 'MIT', identifier: 'MIT' },
    securitySchemes: {
      apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' }
    }
  }
}
```

To disable OpenAPI generation:

```typescript
export default {
  openapi: false
}
```

### Plain Exports Still Work

You don't need to use `define()` for simple endpoints:

```typescript
export function GET(request: RoboRequest) {
  return { status: 'ok' }
}
```

## Server Engine

The API plugin uses Node's `http` module by default. If you have Fastify installed, it will automatically switch to Fastify for enhanced performance.

You can create your own server engine by extending the `BaseServer` class and implementing its abstract methods. Then, specify your custom server engine in the plugin's config file.

Custom engines (or consumers that access the active engine via `Server.get()`) can also register a fallback handler. Call `engine.registerNotFound` with a `(request, reply)` function whenever you want to intercept unmatched requests—for example, to hand off to a framework router before Robo emits a 404.

```ts
import { Server } from '@robojs/server'

const engine = Server.get()

engine?.registerNotFound(async (request, reply) => {
	// Delegate to another handler when Robo didn't match anything.
	await nextAppHandler(request.raw, reply.raw)

	// If that handler didn't write a response, fall through and Robo will still send a 404.
})
```
