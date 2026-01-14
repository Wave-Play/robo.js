# Robo Verification Guide

This guide covers verification workflows for Robo.js Discord bots.

## Overview

When working on Robo.js projects, the agent can verify changes using:

1. **Build Verification**: `robo build` for type checking
2. **Test Verification**: Standard test runners
3. **Mock Verification**: `@robojs/mock` for Discord API simulation

## Enabling Robo Mode

```typescript
const agent = createCodeAgent({
	provider,
	llm,
	robo: {
		enabled: true,
		preferMockWhenAvailable: true
	}
})
```

## Project Detection

The agent automatically detects Robo.js projects by checking:

1. `package.json` dependencies for `robo.js`
2. `robo.mjs` or `robo.ts` config file
3. `.robo/` directory structure
4. `src/commands/` and `src/events/` directories

```typescript
// Detection result
interface ProjectProfile {
	type: 'robo' | 'node' | 'frontend'
	hasRobo: boolean
	hasMock: boolean
	hasTests: boolean
	testRunner: 'jest' | 'vitest' | 'mocha' | null
	packageManager: 'npm' | 'pnpm' | 'yarn'
}
```

## Build Verification

The agent runs `robo build` to verify TypeScript types:

```typescript
// Verification result
interface VerificationResult {
  build: {
    success: boolean
    errors: Array<{
      file: string
      line: number
      column: number
      message: string
      code: string
    }>
    warnings: Array<{...}>
    duration: number
  }
}
```

Build errors trigger a retry loop:

1. Agent sees build errors
2. Reads error messages
3. Proposes fixes
4. Verifies again

## Test Runner Selection

The agent detects and uses the appropriate test runner:

| Detection        | Runner | Command          |
| ---------------- | ------ | ---------------- |
| `vitest` in deps | Vitest | `npx vitest run` |
| `jest` in deps   | Jest   | `npx jest`       |
| `mocha` in deps  | Mocha  | `npx mocha`      |
| `test` script    | npm    | `npm test`       |

## Mock Verification

For Discord bots, `@robojs/mock` provides API simulation.

### How It Works

```
┌─────────────┐      ┌─────────────────┐      ┌─────────────┐
│   Agent     │      │   Robo Dev      │      │  @robojs/   │
│  (makes     │─────►│   Server        │◄─────│    mock     │
│   changes)  │      │  (Discord.js)   │      │ (Test Stage)│
└─────────────┘      └─────────────────┘      └─────────────┘
      │                                              │
      │              ┌──────────────────────────────┘
      │              │
      │              ▼
      │       ┌─────────────────┐
      └──────►│  Control API    │
              │  (Start tests,  │
              │   get results)  │
              └─────────────────┘
```

### Mock Flow

1. **Start Dev Server**

   ```bash
   npx robo dev
   ```

2. **Start Mock Stage**

   ```bash
   npx robo mock start
   ```

3. **Run Test Scenarios**

   ```typescript
   // Agent calls mock control API
   POST /control/sessions/:id/test
   {
     scenarios: [
       {
         description: 'User runs /hello command',
         steps: [
           { type: 'interaction', command: '/hello' }
         ],
         expected: {
           reply: { contains: 'Hello!' }
         }
       }
     ]
   }
   ```

4. **Get Results**
   ```typescript
   interface MockVerificationResult {
   	success: boolean
   	scenarios: Array<{
   		description: string
   		passed: boolean
   		error?: string
   		actualOutput?: string
   	}>
   }
   ```

### Scenario Mapping

The agent maps code changes to test scenarios:

```typescript
// When agent adds/modifies a command
// It creates relevant test scenarios:

// Change: Created src/commands/greet.ts
// Scenario:
{
  description: 'Test /greet command',
  steps: [
    { type: 'interaction', command: '/greet', args: { name: 'World' } }
  ],
  expected: {
    reply: { exists: true }
  }
}

// Change: Modified src/events/messageCreate.ts
// Scenario:
{
  description: 'Test message event',
  steps: [
    { type: 'message', content: 'hello bot' }
  ],
  expected: {
    reply: { exists: true }
  }
}
```

### Mock Result Handling

```typescript
const result = await agent.execute({
	mode: 'execute',
	input: 'Add a /ping command that responds with Pong!',
	onEvent: (event) => {
		if (event.type === 'complete') {
			// Access verification results
			const verification = event.verification

			if (verification?.mock) {
				console.log('Mock results:', verification.mock.scenarios)
				for (const scenario of verification.mock.scenarios) {
					console.log(`${scenario.description}: ${scenario.passed ? '✓' : '✗'}`)
				}
			}
		}
	}
})
```

## Verification Loop

When verification fails, the agent retries:

```typescript
// Agent state during retry
{
  phase: 'verify',
  iterations: 2,
  lastVerification: {
    build: { success: false, errors: [...] },
    tests: null,
    mock: null
  }
}

// Event emitted
{
  type: 'retry',
  iteration: 2,
  reason: 'Type error: Property "name" does not exist on type...'
}
```

The retry loop:

1. Runs verification (build → tests → mock)
2. If any fail, analyze errors
3. Read relevant files
4. Propose fixes
5. Apply fixes
6. Verify again
7. Repeat until success or `maxIterations`

## Configuration

### Custom Build Command

```typescript
const agent = createCodeAgent({
	provider,
	llm,
	robo: {
		enabled: true,
		buildCommand: {
			cmd: 'pnpm',
			args: ['run', 'build']
		}
	}
})
```

### Custom Test Command

```typescript
const agent = createCodeAgent({
	provider,
	llm,
	robo: {
		enabled: true,
		testCommand: {
			cmd: 'pnpm',
			args: ['test', '--', '--passWithNoTests']
		}
	}
})
```

### Mock Preference

```typescript
const agent = createCodeAgent({
	provider,
	llm,
	robo: {
		enabled: true,
		// Use mock validation when @robojs/mock is available
		preferMockWhenAvailable: true
	}
})
```

## Verification Events

Monitor verification progress:

```typescript
agent.execute({
	mode: 'execute',
	input: 'Add a new command',
	onEvent: (event) => {
		switch (event.type) {
			case 'phase':
				if (event.phase === 'verify') {
					console.log('Starting verification...')
				}
				break
			case 'tool_call':
				if (event.name === 'robo_build') {
					console.log('Running robo build...')
				} else if (event.name === 'robo_mock') {
					console.log('Running mock validation...')
				}
				break
			case 'retry':
				console.log(`Retry ${event.iteration}: ${event.reason}`)
				break
			case 'complete':
				if (event.verification?.build?.success) {
					console.log('Build passed!')
				}
				if (event.verification?.mock?.success) {
					console.log('Mock tests passed!')
				}
				break
		}
	}
})
```

## Troubleshooting

### Build Fails Repeatedly

Check for:

- Missing dependencies
- Incorrect TypeScript config
- Conflicting type definitions

```typescript
// Agent will read tsconfig.json and package.json
// to diagnose build issues
```

### Mock Tests Fail

Check for:

- Dev server not running
- Mock stage not started
- Incorrect command syntax
- Missing response handlers

### Verification Loop Stuck

The agent respects `maxIterations`:

```typescript
const agent = createCodeAgent({
	policy: {
		maxIterations: 10 // Stop after 10 verification attempts
	}
})
```

## Best Practices

1. **Start with Build**: Always verify build first
2. **Clear Errors**: Fix type errors before testing
3. **Simple Scenarios**: Start with basic test cases
4. **Watch Iterations**: Monitor retry count
5. **Check Logs**: Review mock stage output

## Next Steps

- [Client Usage](./client-usage.md) - Full API reference
- [WebContainer Integration](./webcontainer-integration.md) - Browser execution
- [Backend Proxy Integration](./backend-proxy-integration.md) - Server-side proxy
