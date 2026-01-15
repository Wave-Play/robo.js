/**
 * @robojs/code SDK Type Definitions
 *
 * This module exports all public types for the SDK.
 */

// Terminal and execution primitives
export type {
	RunOptions,
	RunResult,
	TerminalChunk,
	TerminalSessionHandle,
	FileStat,
	DirEntry,
	SearchOptions,
	SearchResult,
	SnapshotOptions,
	ServiceStartOptions
} from './terminal.js'

// Execution provider interfaces
export type { ExecutionProvider, LocalServiceDiscovery, ServiceType } from './execution.js'

// LLM provider types
export type {
	BrandedModelAlias,
	LLMProviderConfig,
	MessageRole,
	ChatMessage,
	ChatMessageContent,
	ToolCall,
	ToolSchema,
	ChatRequest,
	ChatResponse,
	StreamChunk,
	LLMProvider
} from './llm.js'

// Policy types
export type { CommandArgPolicy, NetworkPolicy, ContextPolicy, AgentPolicy } from './policy.js'
export { DEFAULT_POLICY } from './policy.js'

// Robo-aware types
export type {
	RoboProjectKind,
	ProjectProfile,
	BuildVerificationResult,
	BuildError,
	BuildWarning,
	TestVerificationResult,
	TestFailure,
	MockVerificationResult,
	MockScenarioResult,
	MockAssertion,
	VerificationResult,
	MockEvent
} from './robo.js'

// Change and diff types
export type { FileChange, FileDiff, ChangeSet, DiffOptions, ProposedChanges } from './changes.js'

// Acceptance criteria types
export type {
	Requirements,
	ScenarioKind,
	ScenarioStep,
	ScenarioToolHints,
	ScenarioSpec,
	AcceptanceCriteria,
	ScenarioStatus,
	AcceptanceStatus
} from './acceptance.js'

// Scale primitives
export type {
	RoboIndexSignals,
	ProjectIndex,
	PackageInfo,
	RoboOverview,
	KeyFile,
	Decision,
	ChangeLogEntry,
	ProjectOverview,
	RefreshOptions
} from './scale.js'

// Run and metadata types
export type {
	RunMode,
	RunStatus,
	RunMeta,
	RunFilter,
	TaskStep,
	QuestionChoice,
	QuestionAnswer,
	ApprovalResponse,
	StartRunRequest,
	StartRunResult,
	ResumeRunRequest,
	AbortRunRequest
} from './run.js'

// Event types
export type { StreamOptions, AgentEvent, AgentEventType, AgentEventPayload } from './events.js'
export { DEFAULT_STREAM_OPTIONS } from './events.js'
