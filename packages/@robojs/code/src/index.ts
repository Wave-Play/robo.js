/**
 * @robojs/code SDK
 *
 * An SDK for building agentic coding experiences, optimized for:
 * - In-browser execution (StackBlitz WebContainer)
 * - LangGraphJS-native orchestration
 * - Robo-aware workflows
 * - Verification-driven autonomy
 *
 * @packageDocumentation
 */

// ============================================================================
// Type Exports
// ============================================================================

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
} from './types/terminal.js'

// Execution provider interfaces
export type { ExecutionProvider, LocalServiceDiscovery, ServiceType } from './types/execution.js'

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
} from './types/llm.js'

// Policy types
export type { CommandArgPolicy, NetworkPolicy, ContextPolicy, AgentPolicy } from './types/policy.js'
export { DEFAULT_POLICY } from './types/policy.js'

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
} from './types/robo.js'

// Change and diff types
export type { FileChange, FileDiff, ChangeSet, DiffOptions, ProposedChanges } from './types/changes.js'

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
} from './types/acceptance.js'

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
} from './types/scale.js'

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
} from './types/run.js'

// Event types
export type { StreamOptions, AgentEvent, AgentEventType, AgentEventPayload } from './types/events.js'
export { DEFAULT_STREAM_OPTIONS } from './types/events.js'

// ============================================================================
// Error Exports
// ============================================================================

export type { ErrorCode, CodeAgentErrorOptions } from './errors/index.js'
export {
	CodeAgentError,
	pathTraversalError,
	policyViolationError,
	commandDeniedError,
	budgetExceededError,
	abortError
} from './errors/index.js'

// ============================================================================
// Checkpointer Types
// ============================================================================

export type {
	CheckpointData,
	Checkpointer,
	MemoryCheckpointerConfig,
	DurableCheckpointerConfig
} from './checkpointer/types.js'

// ============================================================================
// Store Types and Implementations
// ============================================================================

export type { RunStore, MemoryRunStoreConfig, DurableRunStoreConfig, RunStoreKey } from './store/types.js'

export { MemoryRunStore, createMemoryRunStore } from './store/index.js'

// ============================================================================
// Logger
// ============================================================================

export { codeLogger, setLogLevel } from './core/logger.js'

// ============================================================================
// Providers
// ============================================================================

// Note: NodeProvider is NOT exported from the main entry point because it uses
// Node.js-only modules (child_process, fs). Import it directly:
//   import { NodeProvider } from '@robojs/code/providers/node'

// WebContainer provider (for browser environments)
// Note: Requires @webcontainer/api as optional peer dependency
export {
	WebContainerProvider,
	type WebContainerProviderConfig,
	WebContainerServiceDiscovery,
	type WebContainerServiceDiscoveryConfig,
	type ServiceConfig
} from './providers/webcontainer/index.js'

// Provider utilities
export {
	normalizePath,
	hasTraversalAttempt,
	validatePath,
	matchesDenyPath,
	validatePathWithPolicy
} from './providers/utils/path.js'
export {
	TerminalBuffer,
	TerminalBufferManager,
	type TruncationEvent,
	type TerminalBufferStats,
	type AggregateBufferStats
} from './providers/utils/buffer.js'

// ============================================================================
// Tools
// ============================================================================

// Tool types
export type {
	ToolContext,
	ToolResult,
	ToolDefinition,
	PendingToolCall,
	ToolCallResult,
	ToolExecutorConfig,
	ToolRegistry,
	ToolSchema as ToolSchemaDefinition,
	PolicyCheckResult,
	CommandPolicyCheck,
	FilePolicyCheck,
	ExecutionQueueStats
} from './tools/types.js'

export { successResult, errorResult, approvalRequired } from './tools/types.js'

// Tool runtime
export {
	SerialExecutionQueue,
	createSerialQueue,
	PolicyValidator,
	DefaultToolRegistry,
	createToolRegistry,
	ToolExecutor,
	createToolExecutor,
	createToolCall,
	checkCommandPolicy,
	checkFilePolicy,
	checkSnapshotPolicy,
	checkDiffPolicy
} from './tools/runtime/index.js'

// All tools
export { allTools, createDefaultToolRegistry, fsTools, terminalTools, changeTools } from './tools/index.js'

// FS tools
export {
	fsReadTool,
	fsReadManyTool,
	fsWriteTool,
	fsDeleteTool,
	fsListTool,
	fsSearchTool,
	fsSnapshotTool,
	fsStatTool,
	fsReadRangeTool,
	fsReadHeadTool,
	fsReadTailTool,
	fsGrepTool,
	fsOutlineTool
} from './tools/fs/index.js'

// Terminal tools
export {
	terminalRunTool,
	terminalRunStreamTool,
	terminalSessionStartTool,
	terminalSessionStreamTool,
	terminalSessionStopTool
} from './tools/terminal/index.js'

// Change tools
export { applyChangesTool } from './tools/changes/index.js'

// ============================================================================
// Project Understanding Primitives
// ============================================================================

// Caps and thresholds
export { INDEX_CAPS, OVERVIEW_CAPS, type IndexCaps, type OverviewCaps } from './project/caps.js'

// Fingerprint computation
export {
	computeFingerprint,
	computeFileFingerprint,
	computeQuickFingerprint,
	hasFingerprintChanged,
	hashContent,
	type FileFingerprint
} from './project/fingerprint.js'

// Robo project detection
export {
	detectRoboProject,
	buildRoboOverview,
	parsePackageJson,
	getRoboPackages,
	determineProjectKind,
	getRoboVersion,
	hasRoboConfig,
	type ParsedPackageJson
} from './project/robo-detection.js'

// Project indexer
export { ProjectIndexer, createProjectIndexer, type ProjectIndexerConfig } from './project/indexer.js'

// Project overview builder
export {
	ProjectOverviewBuilder,
	createProjectOverviewBuilder,
	type ProjectOverviewBuilderConfig
} from './project/overview.js'

// ============================================================================
// Agent (LangGraph Orchestration)
// ============================================================================

// Main public API
export { CodeAgent, createCodeAgent, type CodeAgentConfig } from './agent/index.js'

// State management
export {
	AgentStateAnnotation,
	createInitialState,
	isComplete,
	isWaitingForUser,
	type AgentState,
	type AgentStateUpdate,
	type AgentInput,
	type PendingQuestion
} from './agent/index.js'

// Graph building
export { buildAgentGraph, type GraphConfig, type CompiledAgentGraph } from './agent/index.js'

// Types
export { type CodeAgentContext, type RoboConfig } from './agent/index.js'

// Edge routing
export {
	NODE,
	type NodeName,
	routeAfterPlanner,
	routeAfterAgent,
	routeAfterTools,
	routeAfterReviewer,
	routeAfterVerification
} from './agent/index.js'

// Stream adapter
export {
	StreamAdapter,
	createStreamAdapter,
	extractToolEventsFromMessages,
	type StreamAdapterConfig
} from './agent/index.js'

// Context compaction
export { ContextCompactor, createContextCompactor, type CompactionResult } from './agent/compaction/index.js'

// ============================================================================
// LLM Providers
// ============================================================================

export { MockLLMProvider, createMockLLMProvider, MockResponses, type MockResponse } from './llm/index.js'

export { ProxyLLMProvider, createProxyLLMProvider } from './llm/index.js'

// ============================================================================
// Verification Module
// ============================================================================

// Runner selection
export {
	type TestRunnerConfig,
	type PackageJsonInfo,
	detectTestRunnerFromPackage,
	detectTestRunnerFromConfig,
	buildRunnerConfig,
	detectTestRunner
} from './verification/index.js'

// Scenario mapping
export {
	type VerificationActionType,
	type BaseVerificationAction,
	type BuildVerificationAction,
	type TestVerificationAction,
	type MockVerificationAction,
	type ManualVerificationAction,
	type VerificationAction,
	type ScenarioMappingContext,
	mapScenarioToAction,
	mapScenariosToActions,
	groupActionsByType,
	requiresMockServer,
	requiresDevServer,
	hasManualScenarios
} from './verification/index.js'

// Mock runner
export {
	type MockSession,
	type MockSessionConfig,
	type MockRunnerOptions,
	type DispatchCommand,
	type DispatchResult,
	MockRunner
} from './verification/index.js'

// ============================================================================
// MCP Integration (Optional - Node.js only)
// ============================================================================
//
// MCP (Model Context Protocol) requires Node.js and is NOT available in browser.
// Import from '@robojs/code/mcp' for MCP functionality:
//
//   import { createMcpClientManager, registerMcpTools } from '@robojs/code/mcp'
//
// Type exports are available here for convenience (browser-safe):

export type {
	McpTransport,
	McpServerConfig,
	McpConfig,
	McpToolMetadata,
	McpRemoteToolResult,
	McpServerStatus,
	McpServerInfo
} from './mcp/types.js'
