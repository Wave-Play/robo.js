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

Each route file should export a default function. This function handles HTTP requests and can return a response directly.

The function receives two parameters: `request` and `reply`. These objects provide methods to interact with the request and response.

Example 1: Simple GET request

```javascript
export default (request, reply) => {
	if (request.method !== 'GET') {
		throw new Error('Method not allowed')
	}

	const userId = request.params.id

	// ... perform some action with userId

	return { message: `User ID is ${userId}` }
}
```

Example 2: POST request with body parsing

```javascript
export default async (request, reply) => {
	if (request.method !== 'POST') {
		reply.code(405).send('Method not allowed')
		return
	}

	const userData = await request.json()

	// ... interact with database, e.g., Prisma

	reply.code(200).send(JSON.stringify({ success: true, userData }))
}
```

Returning a value from the route function will automatically send a response with the value as the body. The same is true for throwing an error.

If you need to manually send a response, use the `reply` object. This object provides methods to set the status code, headers, and body.

Don't want to use Robo's wrappers? Access the raw request and response objects using `request.req` and `reply.res`.

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

| **Config Field** | **Type**       | **Description**                             |
| ---------------- | -------------- | ------------------------------------------- |
| `hostname`       | `string`       | The hostname on which the server will run.  |
| `port`           | `number`       | The port on which the server will listen.   |
| `prefix`         | `string/false` | Custom URL prefix for routes or disable it. |
| `engine`         | `BaseServer`   | Custom server engine implementation.        |

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

## Server Engine

The API plugin uses Node's `http` module by default. If you have Fastify installed, it will automatically switch to Fastify for enhanced performance.

You can create your own server engine by extending the `BaseServer` class and implementing its abstract methods. Then, specify your custom server engine in the plugin's config file.
