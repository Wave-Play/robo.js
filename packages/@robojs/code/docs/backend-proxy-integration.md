# Backend Proxy Integration Guide

This guide covers setting up a backend proxy for LLM calls and MCP access.

## Why a Backend Proxy?

Browser-based agents need a backend proxy for:

1. **API Key Security**: Keep API keys server-side
2. **Rate Limiting**: Control API usage per user
3. **Cost Management**: Track and limit token usage
4. **Remote MCP Access**: Proxy MCP servers that require auth

## Architecture

```
┌─────────────┐      ┌─────────────────┐      ┌─────────────┐
│   Browser   │      │  Backend Proxy  │      │   LLM API   │
│  WebContainer│─────►│    (Your Server)│─────►│  (Anthropic)│
│   + Agent   │◄─────│                 │◄─────│             │
└─────────────┘      └─────────────────┘      └─────────────┘
      │                      │
      │                      └──────────────►┌─────────────┐
      │                                      │  MCP Server │
      └──────────────────────────────────────│  (Remote)   │
                                             └─────────────┘
```

## LLM Proxy API Contract

Your proxy must implement this endpoint:

### POST /api/llm/chat

**Request:**

```typescript
interface ChatRequest {
	model: string
	messages: Message[]
	tools?: Tool[]
	tool_choice?: 'auto' | 'none' | { name: string }
	temperature?: number
	max_tokens?: number
	stream?: boolean
}
```

**Response (non-streaming):**

```typescript
interface ChatResponse {
	id: string
	model: string
	content: ContentBlock[]
	stop_reason: 'end_turn' | 'tool_use' | 'max_tokens'
	usage: {
		input_tokens: number
		output_tokens: number
	}
}
```

**Response (streaming):**

NDJSON (newline-delimited JSON) stream:

```
{"type":"message_start","message":{"id":"msg_123"}}
{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}
{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}
{"type":"content_block_stop","index":0}
{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}
{"type":"message_stop"}
```

## Implementing the Proxy

### Express.js Example

```typescript
import express from 'express'
import Anthropic from '@anthropic-ai/sdk'

const app = express()
const anthropic = new Anthropic()

app.post('/api/llm/chat', async (req, res) => {
	const { model, messages, tools, stream, ...options } = req.body

	// Verify user authentication
	const userId = verifyAuth(req)
	if (!userId) {
		return res.status(401).json({ error: 'Unauthorized' })
	}

	// Check rate limits
	if (!checkRateLimit(userId)) {
		return res.status(429).json({ error: 'Rate limit exceeded' })
	}

	if (stream) {
		// Streaming response
		res.setHeader('Content-Type', 'application/x-ndjson')
		res.setHeader('Transfer-Encoding', 'chunked')

		const stream = await anthropic.messages.stream({
			model,
			messages,
			tools,
			...options
		})

		for await (const event of stream) {
			res.write(JSON.stringify(event) + '\n')
		}

		res.end()
	} else {
		// Non-streaming response
		const response = await anthropic.messages.create({
			model,
			messages,
			tools,
			...options
		})

		res.json(response)
	}
})
```

### Hono Example (Edge/Cloudflare)

```typescript
import { Hono } from 'hono'
import Anthropic from '@anthropic-ai/sdk'

const app = new Hono()

app.post('/api/llm/chat', async (c) => {
	const anthropic = new Anthropic({ apiKey: c.env.ANTHROPIC_API_KEY })
	const body = await c.req.json()

	if (body.stream) {
		// Streaming
		const stream = await anthropic.messages.stream(body)

		return new Response(
			new ReadableStream({
				async start(controller) {
					for await (const event of stream) {
						controller.enqueue(JSON.stringify(event) + '\n')
					}
					controller.close()
				}
			}),
			{
				headers: { 'Content-Type': 'application/x-ndjson' }
			}
		)
	}

	const response = await anthropic.messages.create(body)
	return c.json(response)
})
```

## Client LLM Provider

Configure the agent to use your proxy:

```typescript
import { createCodeAgent, ProxyLLMProvider } from '@robojs/code'

const llm = new ProxyLLMProvider({
	endpoint: 'https://your-backend.com/api/llm/chat',
	headers: {
		Authorization: `Bearer ${userToken}`
	}
})

const agent = createCodeAgent({
	provider,
	llm
})
```

## NDJSON Streaming Parser

Parse streaming responses:

```typescript
async function* parseNDJSON(response: Response) {
	const reader = response.body!.getReader()
	const decoder = new TextDecoder()
	let buffer = ''

	while (true) {
		const { done, value } = await reader.read()
		if (done) break

		buffer += decoder.decode(value, { stream: true })
		const lines = buffer.split('\n')
		buffer = lines.pop()! // Keep incomplete line

		for (const line of lines) {
			if (line.trim()) {
				yield JSON.parse(line)
			}
		}
	}
}

// Usage
const response = await fetch('/api/llm/chat', {
	method: 'POST',
	body: JSON.stringify({ ...request, stream: true })
})

for await (const event of parseNDJSON(response)) {
	if (event.type === 'content_block_delta') {
		console.log(event.delta.text)
	}
}
```

## Remote MCP Gateway

For MCP servers that require authentication:

### Proxy Setup

```typescript
// Backend MCP gateway
app.all('/api/mcp/:serverId/*', async (req, res) => {
	const { serverId } = req.params
	const userId = verifyAuth(req)

	// Get MCP server config for user
	const serverConfig = getMcpServerConfig(userId, serverId)
	if (!serverConfig) {
		return res.status(404).json({ error: 'MCP server not found' })
	}

	// Proxy to actual MCP server
	const targetUrl = serverConfig.url + req.path.replace(`/api/mcp/${serverId}`, '')

	const response = await fetch(targetUrl, {
		method: req.method,
		headers: {
			...serverConfig.headers, // Server's auth headers
			'Content-Type': req.headers['content-type']
		},
		body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
	})

	// Forward response
	res.status(response.status)
	response.body?.pipeTo(
		new WritableStream({
			write(chunk) {
				res.write(chunk)
			},
			close() {
				res.end()
			}
		})
	)
})
```

### Client MCP Configuration

```typescript
const agent = createCodeAgent({
	provider,
	llm,
	mcp: {
		enabled: true,
		servers: {
			remoteTool: {
				transport: 'streamable_http',
				url: 'https://your-backend.com/api/mcp/remoteTool',
				headers: {
					Authorization: `Bearer ${userToken}`
				},
				isRemote: true // Uses patch-plan rule
			}
		}
	}
})
```

## Patch-Plan Rule for Remote MCP

Remote MCP tools cannot directly modify files in WebContainer. They return `ProposedChanges`:

```typescript
// Remote MCP tool response
interface McpRemoteToolResult {
	proposedChanges?: {
		changes: Array<{
			path: string
			type: 'create' | 'modify' | 'delete'
			content?: string // Required for create/modify
		}>
	}
	data?: unknown
	notes?: string
}
```

The agent:

1. Receives `ProposedChanges` from remote tool
2. Shows changes to user for approval
3. Applies approved changes via core tools
4. Reports results back to LLM

## Error Handling

### Proxy Errors

```typescript
app.post('/api/llm/chat', async (req, res) => {
	try {
		// ... make LLM call
	} catch (error) {
		if (error.status === 429) {
			// Anthropic rate limit
			res.status(429).json({
				error: 'LLM rate limit exceeded',
				retryAfter: error.headers?.['retry-after']
			})
		} else if (error.status === 401) {
			// Invalid API key
			res.status(500).json({ error: 'LLM configuration error' })
		} else {
			res.status(500).json({ error: 'LLM request failed' })
		}
	}
})
```

### Client Retry Logic

```typescript
const llm = new ProxyLLMProvider({
	endpoint: 'https://your-backend.com/api/llm/chat',
	retryConfig: {
		maxRetries: 3,
		initialDelay: 1000,
		backoffMultiplier: 2,
		retryableStatuses: [429, 500, 502, 503]
	}
})
```

## Usage Tracking

Track token usage per user:

```typescript
app.post('/api/llm/chat', async (req, res) => {
	const userId = verifyAuth(req)

	// Check budget
	const budget = await getUserBudget(userId)
	if (budget.remaining <= 0) {
		return res.status(402).json({ error: 'Budget exceeded' })
	}

	const response = await anthropic.messages.create(req.body)

	// Track usage
	await recordUsage(userId, {
		inputTokens: response.usage.input_tokens,
		outputTokens: response.usage.output_tokens,
		model: req.body.model
	})

	res.json(response)
})
```

## Security Considerations

1. **Validate Input**: Sanitize and validate all request data
2. **Rate Limiting**: Implement per-user and per-IP limits
3. **Token Rotation**: Rotate API keys regularly
4. **Audit Logging**: Log all LLM and MCP requests
5. **Cost Alerts**: Set up alerts for unusual usage patterns

## Next Steps

- [Client Usage](./client-usage.md) - Full API reference
- [WebContainer Integration](./webcontainer-integration.md) - Browser execution
- [Robo Verification](./robo-verification.md) - Discord bot validation
