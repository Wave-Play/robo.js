# WebContainer Integration Guide

This guide covers running `@robojs/code` in the browser using WebContainer.

## Overview

WebContainer provides a full Node.js environment in the browser, enabling:

- In-browser code editing and execution
- File system operations
- npm package installation
- Terminal commands

The SDK's `WebContainerProvider` adapts these capabilities for agent use.

## Installation

```bash
npm install @robojs/code @webcontainer/api
```

## Basic Setup

```typescript
import { WebContainer } from '@webcontainer/api'
import { createCodeAgent } from '@robojs/code'
import {
	WebContainerProvider,
	createWebContainerProvider,
	WebContainerServiceDiscovery
} from '@robojs/code/providers/webcontainer'

// Boot WebContainer
const webContainer = await WebContainer.boot()

// Create the provider
const provider = createWebContainerProvider({
	container: webContainer,
	workdir: '/app'
})

// Create service discovery (for dev servers, mock validation, MCP)
const serviceDiscovery = new WebContainerServiceDiscovery({
	container: webContainer,
	onServerReady: ({ port, url }) => {
		console.log(`Server ready on port ${port}: ${url}`)
	}
})

// Create the agent
const agent = createCodeAgent({
	provider,
	llm, // Your LLM provider
	serviceDiscovery
})
```

## Service Discovery

WebContainer servers start on ephemeral ports. Service discovery resolves URLs:

```typescript
const serviceDiscovery = new WebContainerServiceDiscovery({
	container: webContainer,

	// Called when any server becomes ready
	onServerReady: ({ port, url }) => {
		// url format: https://[webcontainer-id]-[port].[host]
		console.log(`Port ${port} ready at ${url}`)
	}
})

// Start watching for a specific service
const { serviceId } = await serviceDiscovery.start('dev', { port: 3000 })

// Wait for URL resolution
const { url } = await serviceDiscovery.waitForUrl(serviceId)
console.log('Dev server URL:', url) // https://abc123-3000.webcontainer.io

// Stop watching
await serviceDiscovery.stop(serviceId)
```

## File Operations

The provider handles WebContainer file system:

```typescript
// Read file
const content = await provider.readFile('/app/src/index.ts')

// Write file
await provider.writeFile('/app/src/new-file.ts', 'export const x = 1')

// Check existence
const exists = await provider.exists('/app/package.json')

// List directory
const entries = await provider.readdir('/app/src')

// Create directory
await provider.mkdir('/app/src/utils')

// Delete
await provider.deletePath('/app/temp.txt')

// Search for patterns
const results = await provider.search('/app', {
	pattern: 'function\\s+\\w+',
	fileExtensions: ['.ts', '.js']
})

// Snapshot (for diffs)
const snapshot = await provider.snapshot('/app/src')
```

## Terminal Sessions

Run commands in WebContainer:

```typescript
// One-off command
const result = await provider.run('npm', ['install'], {
	cwd: '/app',
	timeout: 60000
})
console.log('Exit code:', result.exitCode)
console.log('Output:', result.output)

// Streaming output
for await (const chunk of provider.runStream('npm', ['run', 'build'], {
	cwd: '/app'
})) {
	process.stdout.write(chunk.data)
}

// Long-running session (dev server, etc)
const session = await provider.startSession('npm', ['run', 'dev'], {
	cwd: '/app'
})

// Stream session output
for await (const chunk of provider.streamSession(session)) {
	console.log(chunk.data)
	if (chunk.done) break
}

// Stop session
await provider.stopSession(session)
```

## Robo Mock Validation

For Robo.js Discord bots, integrate with `@robojs/mock`:

```typescript
import { createCodeAgent } from '@robojs/code'

const agent = createCodeAgent({
	provider,
	llm,
	serviceDiscovery,
	robo: {
		enabled: true,
		preferMockWhenAvailable: true
	}
})

// Agent will automatically:
// 1. Start dev server
// 2. Start mock validation
// 3. Wait for URLs via service discovery
// 4. Run test scenarios
// 5. Report pass/fail
```

## MCP in WebContainer

MCP servers must use Streamable HTTP transport (no stdio in WebContainer):

```typescript
const agent = createCodeAgent({
	provider,
	llm,
	serviceDiscovery,
	mcp: {
		enabled: true,
		servers: {
			// Local MCP server started in WebContainer
			localMcp: {
				transport: 'streamable_http',
				url: '__DISCOVERED__', // Resolved via service discovery
				startCommand: {
					command: 'node',
					args: ['mcp-server.mjs'],
					env: { PORT: '3001' }
				},
				expectedPort: 3001
			}
		}
	}
})

// On connect, agent will:
// 1. Start session: node mcp-server.mjs
// 2. Wait for port 3001 via service discovery
// 3. Connect to discovered URL
// 4. Load available tools
```

## Event Streaming

Handle WebContainer-specific events:

```typescript
const result = await agent.execute({
	mode: 'execute',
	input: 'Start the dev server',
	onEvent: (event) => {
		switch (event.type) {
			case 'tool_call':
				if (event.name === 'terminal_session_start') {
					console.log('Starting session...')
				}
				break
			case 'tool_result':
				if (event.name === 'terminal_session_start') {
					console.log('Session started:', event.result)
				}
				break
			// Handle other events...
		}
	}
})
```

## Error Handling

WebContainer-specific errors:

```typescript
try {
	await provider.run('npm', ['install'])
} catch (error) {
	if (error.code === 'ENOENT') {
		// File/directory not found
	} else if (error.code === 'TIMEOUT') {
		// Command timed out
	} else if (error.code === 'DENIED') {
		// Path denied by policy
	}
}
```

## Memory Management

WebContainer has memory limits. The SDK helps manage them:

```typescript
const agent = createCodeAgent({
	provider,
	llm,
	policy: {
		// Limit file write size
		maxFileWriteBytes: 500_000,

		// Limit snapshot size (for diffs)
		maxSnapshotBytes: 5_000_000,

		// Limit terminal output buffering
		maxTerminalBytes: 100_000
	}
})
```

## Best Practices

1. **Boot Once**: Reuse the WebContainer instance across agent runs
2. **Service Discovery**: Always use discovery for servers started in WebContainer
3. **Cleanup Sessions**: Stop sessions when done to free resources
4. **Buffer Limits**: Set reasonable limits to prevent memory issues
5. **Watch for Crashes**: WebContainer can crash; handle reconnection

## Example: Full Setup

```typescript
import { WebContainer } from '@webcontainer/api'
import { createCodeAgent } from '@robojs/code'
import { createWebContainerProvider, WebContainerServiceDiscovery } from '@robojs/code/providers/webcontainer'

// Initialize
const webContainer = await WebContainer.boot()
const provider = createWebContainerProvider({ container: webContainer })
const serviceDiscovery = new WebContainerServiceDiscovery({
	container: webContainer,
	onServerReady: ({ port, url }) => {
		updateUI(`Server on ${port}: ${url}`)
	}
})

// Create agent
const agent = createCodeAgent({
	provider,
	llm: yourLLMProvider,
	serviceDiscovery,
	policy: {
		autoApprove: false,
		maxIterations: 20
	},
	robo: {
		enabled: true,
		preferMockWhenAvailable: true
	}
})

// Run task
const result = await agent.execute({
	mode: 'execute',
	input: 'Build a Discord slash command',
	onEvent: handleEvent
})

// Cleanup
await agent.dispose()
```

## Next Steps

- [Client Usage](./client-usage.md) - Full API reference
- [Backend Proxy Integration](./backend-proxy-integration.md) - Server-side LLM calls
- [Robo Verification](./robo-verification.md) - Discord bot validation
