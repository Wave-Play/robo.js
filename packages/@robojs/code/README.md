# @robojs/code

SDK for building agentic coding experiences with WebContainer and LangGraph.

## Overview

`@robojs/code` is an SDK designed for building agentic coding experiences, optimized for:

- **In-browser execution** (StackBlitz WebContainer) with filesystem + terminal + long-running sessions
- **LangGraphJS-native orchestration** (state annotations, reducers, ToolNode, interrupt/resume)
- **Robo-aware workflows** (detect Robo projects, run `robo build`, optional `@robojs/mock` validation)
- **Verification-driven autonomy** ("done" means acceptance criteria satisfied and verification passes)

## Installation

```bash
npm install @robojs/code
# or
pnpm add @robojs/code
```

## Exports

### Main Export

```typescript
import {
	// Types
	ExecutionProvider,
	LocalServiceDiscovery,
	LLMProvider,
	AgentPolicy,
	AgentEvent,
	StreamOptions,
	RunMode,
	// ... and more

	// Values
	CodeAgentError,
	DEFAULT_POLICY,
	DEFAULT_STREAM_OPTIONS,
	codeLogger
} from '@robojs/code'
```

### Types-only Export

```typescript
import type {
	FileChange,
	FileDiff,
	ProjectProfile,
	AcceptanceCriteria,
	ProjectIndex,
	ProjectOverview,
	RunMeta
} from '@robojs/code/types'
```

## Key Types

### ExecutionProvider

The authoritative interface for filesystem and command execution:

```typescript
interface ExecutionProvider {
	// File operations
	readFile(path: string): Promise<string>
	writeFile(path: string, content: string): Promise<void>
	deletePath(path: string, opts?: { recursive?: boolean }): Promise<void>
	exists(path: string): Promise<boolean>
	readdir(path: string, opts?: { recursive?: boolean }): Promise<DirEntry[]>
	// ... more file operations

	// Command execution (no shell interpolation)
	run(command: string, args: string[], opts?: RunOptions): Promise<RunResult>
	runStream(command: string, args: string[], opts?: RunOptions): AsyncIterable<TerminalChunk>

	// Long-running sessions
	startSession(command: string, args: string[], opts?: RunOptions): Promise<TerminalSessionHandle>
	stopSession(handle: TerminalSessionHandle): Promise<void>
	streamSession(handle: TerminalSessionHandle): AsyncIterable<TerminalChunk>
}
```

### BrandedModelAlias

Client-side model selection aliases (capability order ascending):

```typescript
type BrandedModelAlias =
	| 'Sage' // Entry-level capable model
	| 'Great Sage' // Mid-tier capable model
	| 'Raphael' // High capability model
	| 'Words of the World' // Most capable model (highest tier)
```

### AgentPolicy

Security and execution policy:

```typescript
interface AgentPolicy {
	autoApprove: boolean
	maxIterations: number
	commandAllowlist: string[]
	commandArgPolicy?: CommandArgPolicy
	denyPaths?: string[]
	maxFileWriteBytes?: number
	// ... more policy options
}
```

### AgentEvent

UI streaming contract:

```typescript
type AgentEvent =
	| { type: 'start'; runId: string; instruction: string }
	| { type: 'plan'; steps: TaskStep[] }
	| { type: 'tool_call'; source: 'core'; name: string; args: unknown }
	| { type: 'question'; runId: string; text: string; choices?: QuestionChoice[] }
	| { type: 'approval_required'; runId: string; changes: FileChange[]; diffs?: FileDiff[] }
	| { type: 'complete'; summary: string; changes: FileChange[] }
// ... more event types
```

## Run Modes

- **explain**: Answer questions grounded in project facts (no edits)
- **plan**: Produce acceptance criteria + plan, ask clarifying questions (no edits)
- **execute**: Implement + verify + iterate until acceptance criteria pass or budget exceeded

## Error Handling

```typescript
import { CodeAgentError } from '@robojs/code'

try {
	// agent operations
} catch (error) {
	if (CodeAgentError.isCodeAgentError(error)) {
		console.log(error.code) // 'POLICY_VIOLATION', 'BUDGET_EXCEEDED', etc.
		console.log(error.recoverable)
	}
}
```

## Documentation

- [Phase 0 Implementation Plan](../../architecture/@robojs-code/implementation-phases-code.md)
- [v1 Hardening Spec](../../architecture/robojs_code_spec_web_container_first_robo_aware_v1_hardening.md)

## License

MIT
