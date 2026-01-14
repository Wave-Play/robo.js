/**
 * Tool exports for @robojs/code SDK
 *
 * This module exports all tool definitions and the runtime infrastructure
 * for executing tools with serialization and policy enforcement.
 */

// ============================================================================
// Type Exports
// ============================================================================

export type {
	ToolContext,
	ToolResult,
	ToolDefinition,
	PendingToolCall,
	ToolCallResult,
	ToolExecutorConfig,
	ToolRegistry,
	ToolSchema,
	PolicyCheckResult,
	CommandPolicyCheck,
	FilePolicyCheck,
	QueuedExecution,
	ExecutionQueueStats
} from './types.js'

export { successResult, errorResult, approvalRequired } from './types.js'

// ============================================================================
// Runtime Exports
// ============================================================================

export {
	SerialExecutionQueue,
	createSerialQueue,
	checkCommandPolicy,
	checkCommandArgPolicy,
	checkFilePolicy,
	checkSnapshotPolicy,
	checkDiffPolicy,
	PolicyValidator,
	DefaultToolRegistry,
	createToolRegistry,
	schemaToJsonSchema,
	ToolExecutor,
	createToolExecutor,
	createToolCall
} from './runtime/index.js'

// ============================================================================
// FS Tool Exports
// ============================================================================

export {
	// Core tools
	fsReadTool,
	fsReadSchema,
	fsReadManyTool,
	fsReadManySchema,
	fsWriteTool,
	fsWriteSchema,
	fsDeleteTool,
	fsDeleteSchema,
	fsListTool,
	fsListSchema,
	fsSearchTool,
	fsSearchSchema,
	fsSnapshotTool,
	fsSnapshotSchema,

	// Scale/retrieval tools
	fsStatTool,
	fsStatSchema,
	fsReadRangeTool,
	fsReadRangeSchema,
	fsReadHeadTool,
	fsReadHeadSchema,
	fsReadTailTool,
	fsReadTailSchema,
	fsGrepTool,
	fsGrepSchema,
	fsOutlineTool,
	fsOutlineSchema,

	// All FS tools
	fsTools,

	// Types
	type FsReadInput,
	type FsReadOutput,
	type FsReadManyInput,
	type FsReadManyOutput,
	type FsWriteInput,
	type FsWriteOutput,
	type FsDeleteInput,
	type FsDeleteOutput,
	type FsListInput,
	type FsListOutput,
	type ListEntry,
	type FsSearchInput,
	type FsSearchOutput,
	type SearchEntry,
	type SearchMatch,
	type FsSnapshotInput,
	type FsSnapshotOutput,
	type FsStatInput,
	type FsStatOutput,
	type FsReadRangeInput,
	type FsReadRangeOutput,
	type FsReadHeadInput,
	type FsReadHeadOutput,
	type FsReadTailInput,
	type FsReadTailOutput,
	type FsGrepInput,
	type FsGrepOutput,
	type GrepMatch,
	type FsOutlineInput,
	type FsOutlineOutput,
	type OutlineSymbol,
	type SymbolType
} from './fs/index.js'

// ============================================================================
// Terminal Tool Exports
// ============================================================================

export {
	// One-shot tools
	terminalRunTool,
	terminalRunSchema,
	terminalRunStreamTool,
	terminalRunStreamSchema,

	// Session tools
	terminalSessionStartTool,
	terminalSessionStartSchema,
	terminalSessionStreamTool,
	terminalSessionStreamSchema,
	terminalSessionStopTool,
	terminalSessionStopSchema,

	// All terminal tools
	terminalTools,

	// Types
	type TerminalRunInput,
	type TerminalRunOutput,
	type TerminalRunStreamInput,
	type TerminalRunStreamOutput,
	type TerminalSessionStartInput,
	type TerminalSessionStartOutput,
	type TerminalSessionStreamInput,
	type TerminalSessionStreamOutput,
	type TerminalSessionStopInput,
	type TerminalSessionStopOutput
} from './terminal/index.js'

// ============================================================================
// Change Tool Exports
// ============================================================================

export {
	applyChangesTool,
	applyChangesSchema,
	changeTools,
	type ApplyChangesInput,
	type ApplyChangesOutput
} from './changes/index.js'

// ============================================================================
// Tracking Exports (Stale Detection)
// ============================================================================

export {
	FileReadTracker,
	checkStaleness,
	type FileReadSnapshot,
	type StaleCheckResult,
	type StaleReason,
	type CurrentFileState
} from './tracking/index.js'

// ============================================================================
// All Tools Combined
// ============================================================================

import { fsTools } from './fs/index.js'
import { terminalTools } from './terminal/index.js'
import { changeTools } from './changes/index.js'

/**
 * All available tools
 */
export const allTools = [...fsTools, ...terminalTools, ...changeTools]

/**
 * Register all tools in a registry
 */
import { createToolRegistry } from './runtime/index.js'
import type { ToolRegistry, ToolDefinition } from './types.js'

export function createDefaultToolRegistry(): ToolRegistry {
	const registry = createToolRegistry()

	for (const tool of allTools) {
		// Cast to ToolDefinition to satisfy type constraints for heterogeneous tool array
		registry.register(tool as ToolDefinition)
	}

	return registry
}
