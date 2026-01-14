# Client Usage Guide

This guide covers how to use the `@robojs/code` SDK to build agentic coding experiences.

## Installation

```bash
npm install @robojs/code robo.js
```

## Quick Start

```typescript
import { createCodeAgent, type CodeAgentConfig } from '@robojs/code'
import { NodeProvider, createNodeProvider } from '@robojs/code/providers/node'
import { AnthropicLLM } from '@robojs/code/llm/anthropic'

// Create execution provider (Node.js for local development)
const provider = createNodeProvider({
	workdir: process.cwd()
})

// Create LLM provider
const llm = new AnthropicLLM({
	apiKey: process.env.ANTHROPIC_API_KEY!
})

// Create the agent
const agent = createCodeAgent({
	provider,
	llm,
	policy: {
		autoApprove: false,
		maxIterations: 20,
		commandAllowlist: ['npm', 'node', 'npx'],
		denyPaths: ['.env', '.git', 'node_modules']
	}
})

// Run a task
const result = await agent.execute({
	mode: 'execute',
	input: 'Create a hello world TypeScript file',
	onEvent: (event) => console.log(event)
})
```

## Agent Modes

The agent supports three modes:

### Execute Mode

Full implementation - reads, writes files, runs commands, and verifies changes:

```typescript
const result = await agent.execute({
	mode: 'execute',
	input: 'Add a new API endpoint for user authentication'
})
```

### Plan Mode

Creates a step-by-step plan without making changes:

```typescript
const result = await agent.execute({
	mode: 'plan',
	input: 'How would you implement user authentication?'
})

// Access the plan
console.log(result.plan)
```

### Explain Mode

Answers questions about the codebase:

```typescript
const result = await agent.execute({
	mode: 'explain',
	input: 'How does the authentication system work?'
})
```

## Streaming Events

Subscribe to real-time events during execution:

```typescript
const result = await agent.execute({
	mode: 'execute',
	input: 'Refactor the authentication module',
	onEvent: (event) => {
		switch (event.type) {
			case 'phase':
				console.log(`Phase: ${event.phase}`)
				break
			case 'plan':
				console.log('Plan:', event.steps)
				break
			case 'progress':
				console.log(`Step ${event.step}/${event.of}: ${event.label}`)
				break
			case 'llm_text':
				process.stdout.write(event.delta)
				break
			case 'tool_call':
				console.log(`Tool: ${event.name}`)
				break
			case 'tool_result':
				console.log(`Result: ${event.name}`)
				break
			case 'file_proposed':
				console.log('Changes proposed:', event.changes)
				break
			case 'question':
				// Handle question (see Interrupts section)
				break
			case 'approval_required':
				// Handle approval (see Interrupts section)
				break
			case 'complete':
				console.log('Completed:', event.summary)
				break
		}
	}
})
```

## Event Types

| Event               | Description                                                    |
| ------------------- | -------------------------------------------------------------- |
| `phase`             | Agent has entered a new phase (analyze, plan, execute, verify) |
| `plan`              | Plan steps have been updated                                   |
| `progress`          | Current step has changed                                       |
| `llm_text`          | LLM text delta (streaming)                                     |
| `tool_call`         | Tool execution started                                         |
| `tool_result`       | Tool execution completed                                       |
| `mcp_call`          | MCP tool execution started                                     |
| `mcp_result`        | MCP tool execution completed                                   |
| `file_proposed`     | File changes proposed (before approval)                        |
| `approval_required` | Changes require user approval                                  |
| `question`          | Agent needs user input                                         |
| `retry`             | Agent is retrying after verification failure                   |
| `complete`          | Task completed successfully                                    |
| `abort`             | Task was aborted                                               |

## Handling Interrupts

The agent may pause for user input in two scenarios:

### Questions

The agent asks clarifying questions:

```typescript
agent.execute({
	mode: 'execute',
	input: 'Add a database',
	onEvent: async (event) => {
		if (event.type === 'question') {
			// Show question to user
			console.log(event.text)
			console.log('Choices:', event.choices)

			// Get user response
			const answer = await getUserInput()

			// Resume with answer
			await agent.resume(event.runId, {
				questionResponse: {
					choiceId: answer.choiceId,
					text: answer.text // Optional for custom responses
				}
			})
		}
	}
})
```

### Approvals

File changes require approval when `autoApprove: false`:

```typescript
agent.execute({
	mode: 'execute',
	input: 'Refactor the auth module',
	onEvent: async (event) => {
		if (event.type === 'approval_required') {
			// Show diffs to user
			console.log('Changes:', event.changes)
			console.log('Diffs:', event.diffs)

			// Get user approval
			const approved = await getUserApproval()

			// Resume with decision
			await agent.resume(event.runId, {
				approvalDecision: approved ? 'approve' : 'reject'
			})
		}
	}
})
```

## Getting Diffs

View proposed file changes before approval:

```typescript
// Get diffs for pending changes
const diffs = await agent.getDiffs()

for (const diff of diffs) {
	console.log(`File: ${diff.path}`)
	console.log(`Type: ${diff.type}`) // create, modify, delete
	console.log('Diff:')
	console.log(diff.unifiedDiff)
}
```

## Multi-Run Support

Run multiple tasks in parallel with separate run IDs:

```typescript
// Start first task
const run1 = await agent.start({
	mode: 'execute',
	input: 'Add authentication',
	runId: 'auth-task'
})

// Start second task
const run2 = await agent.start({
	mode: 'execute',
	input: 'Add logging',
	runId: 'logging-task'
})

// Each run has its own state
const diffs1 = await agent.getDiffs('auth-task')
const diffs2 = await agent.getDiffs('logging-task')
```

## Aborting Tasks

Cancel a running task:

```typescript
// Start a task
const task = agent.execute({
	mode: 'execute',
	input: 'Long running task'
})

// Abort it
await agent.abort()

// Or abort specific run
await agent.abort('specific-run-id')
```

## Agent Policy

Configure safety and behavior:

```typescript
const agent = createCodeAgent({
	// ... provider, llm
	policy: {
		// Auto-approve file changes (false = require approval)
		autoApprove: false,

		// Maximum tool call iterations before aborting
		maxIterations: 20,

		// Commands allowed in terminal (whitelist)
		commandAllowlist: ['npm', 'node', 'npx', 'pnpm', 'yarn'],

		// Paths that cannot be read or written
		denyPaths: ['.env', '.git', 'node_modules'],

		// Maximum file write size (bytes)
		maxFileWriteBytes: 1_000_000,

		// Maximum snapshot size (bytes)
		maxSnapshotBytes: 10_000_000
	}
})
```

## MCP Integration (Optional)

Connect to external MCP servers for additional tools:

```typescript
const agent = createCodeAgent({
	provider,
	llm,
	mcp: {
		enabled: true,
		servers: {
			// Local MCP server (discovered at runtime)
			localTools: {
				transport: 'streamable_http',
				url: '__DISCOVERED__',
				startCommand: {
					command: 'node',
					args: ['mcp-server.js']
				},
				expectedPort: 3001
			},
			// Remote MCP server (backend gateway)
			remoteTools: {
				transport: 'streamable_http',
				url: 'https://api.example.com/mcp',
				headers: { Authorization: 'Bearer token' },
				isRemote: true
			}
		}
	}
})
```

## Robo.js Integration

For Robo.js projects, enable Robo-aware behaviors:

```typescript
const agent = createCodeAgent({
	provider,
	llm,
	robo: {
		enabled: true,
		// Use @robojs/mock for validation when available
		preferMockWhenAvailable: true
	}
})
```

This enables:

- Automatic Robo project detection
- `robo build` for type checking
- `robo mock test` for Discord bot validation
- Mock scenario mapping for test coverage

## Cleanup

Dispose the agent when done:

```typescript
await agent.dispose()
```

This cleans up:

- MCP connections
- Background sessions
- Temporary files
- Service discovery

## Next Steps

- [WebContainer Integration](./webcontainer-integration.md) - Browser-based execution
- [Backend Proxy Integration](./backend-proxy-integration.md) - Server-side LLM proxy
- [Robo Verification](./robo-verification.md) - Robo.js specific validation
