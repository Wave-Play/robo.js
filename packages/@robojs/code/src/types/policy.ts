/**
 * Policy types for @robojs/code SDK
 *
 * AgentPolicy defines security, execution, and behavior constraints.
 */

/**
 * Command argument policy for fine-grained command control.
 *
 * Command allowlists alone are insufficient for security.
 * This policy allows blocking or requiring approval for specific
 * command + argument combinations.
 *
 * Examples:
 * - Block `node -e` (arbitrary code execution)
 * - Block `npm exec` / `npx` unless approved
 * - Require approval for `npm run <arbitrary>`
 */
export interface CommandArgPolicy {
	/**
	 * Commands + argument prefixes that are always blocked
	 */
	disallow?: Array<{
		command: string
		argsPrefix?: string[]
	}>

	/**
	 * Commands + argument prefixes that require user approval
	 */
	requireApproval?: Array<{
		command: string
		argsPrefix?: string[]
	}>
}

/**
 * Network access policy (best-effort in WebContainer)
 *
 * Note: WebContainer cannot fully enforce network isolation at OS level.
 * This is a best-effort policy for defense in depth.
 */
export interface NetworkPolicy {
	/**
	 * Default network access policy
	 */
	default: 'deny' | 'allow'

	/**
	 * Per-command network access overrides
	 */
	allowForCommands?: Record<string, boolean>
}

/**
 * Context compaction policy for long-running sessions.
 *
 * When enabled, the agent will compact chat history to stay within
 * context limits while preserving critical information.
 */
export interface ContextPolicy {
	/**
	 * Whether to enable automatic context compaction.
	 * Default: true (enabled for safety)
	 */
	enableCompaction: boolean

	/**
	 * Maximum messages before triggering compaction.
	 * Used as fallback when token-based compaction isn't available.
	 * @deprecated Prefer token-based compaction via modelContextLimit
	 */
	maxMessagesBeforeCompaction: number

	/**
	 * Number of recent messages/turns to always keep.
	 * Used as minimum preservation during compaction.
	 */
	keepLastMessages: number

	/**
	 * Maximum characters for the compaction summary.
	 */
	maxSummaryChars: number

	// === Token-based compaction settings ===

	/**
	 * Context limit in tokens for the model being used.
	 * Common values: 200000 (Claude), 128000 (GPT-4).
	 * If not set, falls back to message-based compaction.
	 */
	modelContextLimit?: number

	/**
	 * Percentage of modelContextLimit at which to trigger compaction.
	 * Default: 0.70 (70%)
	 * Range: 0.5 - 0.95
	 */
	tokenThresholdPercent?: number

	/**
	 * Tokens reserved for completion output.
	 * Subtracted from available context.
	 * Default: 8192
	 */
	reservedOutputTokens?: number

	/**
	 * Minimum tokens to keep after compaction.
	 * Ensures we don't over-compact.
	 * Default: 10000
	 */
	minTokensAfterCompaction?: number
}

/**
 * File read policy for content size management.
 *
 * Controls how file reads are handled to prevent context overflow.
 */
export interface FileReadPolicy {
	/**
	 * Maximum bytes to return from a single fs_read call.
	 * Files larger than this will be truncated with guidance to use fs_read_range.
	 * Default: 65536 (64KB)
	 */
	maxReadBytes?: number

	/**
	 * Number of turns after which file content becomes eligible for summarization.
	 * Default: 5
	 */
	contentRecencyTurns?: number

	/**
	 * Maximum characters for a file summary.
	 * Default: 500
	 */
	maxSummaryChars?: number

	/**
	 * Whether to auto-summarize large files on read.
	 * If true, files > maxReadBytes return outline + head instead of truncated content.
	 * Default: false
	 */
	autoSummarizeLargeFiles?: boolean
}

/**
 * Agent execution and security policy.
 *
 * Required safety rules:
 * - Normalize and validate all paths (prevent `..` traversal)
 * - Never include denyPaths in snapshots or tool-visible context
 * - Disallow shell-string commands; always execute `command + args`
 * - Validate arguments for allowed commands (not just allowlisting)
 * - Never inject backend credentials into container environment
 */
export interface AgentPolicy {
	/**
	 * Whether to auto-approve file changes without user confirmation
	 */
	autoApprove: boolean

	/**
	 * Maximum verification/fix iterations before budget exhaustion
	 */
	maxIterations: number

	/**
	 * Commands allowed to execute (base command names)
	 */
	commandAllowlist: string[]

	/**
	 * Fine-grained command + argument policy
	 */
	commandArgPolicy?: CommandArgPolicy

	/**
	 * Network access policy (best-effort)
	 */
	networkPolicy?: NetworkPolicy

	/**
	 * Paths that should never be read, written, or included in snapshots.
	 * Supports exact segment match, path prefix (with /), and glob-like patterns.
	 *
	 * Default includes: .env*, .git, node_modules, dist, build, .next, .nuxt,
	 * .output, .robo/build, .cache, .turbo, .pnpm-store, .yarn, coverage
	 */
	denyPaths?: string[]

	/**
	 * Maximum bytes for a single file write
	 */
	maxFileWriteBytes?: number

	/**
	 * Maximum total bytes for all diffs in a single change set
	 */
	maxTotalDiffBytes?: number

	/**
	 * Maximum bytes for a snapshot operation
	 */
	maxSnapshotBytes?: number

	/**
	 * Maximum bytes to buffer from terminal output per session
	 * When exceeded, oldest output is dropped and terminal_truncated is emitted
	 */
	maxBufferedTerminalBytes?: number

	/**
	 * Whether to require mock validation when @robojs/mock is available
	 */
	requireMockValidationWhenAvailable?: boolean

	/**
	 * Context compaction policy
	 */
	context?: ContextPolicy

	/**
	 * File read policy for content size management
	 */
	fileEviction?: FileReadPolicy
}

/**
 * Default policy values for reference
 */
export const DEFAULT_POLICY: Partial<AgentPolicy> = {
	autoApprove: false,
	maxIterations: 10,
	commandAllowlist: ['npm', 'pnpm', 'yarn', 'robo', 'node', 'vitest', 'jest'],
	denyPaths: [
		// Secrets
		'.env',
		'.env.local',
		'.env.production',
		'.env.development',
		// Version control
		'.git',
		// Dependencies
		'node_modules',
		// Build outputs
		'dist',
		'build',
		'.next',
		'.nuxt',
		'.output',
		'.robo/build',
		// Caches
		'.cache',
		'.turbo',
		'.pnpm-store',
		'.yarn',
		// Test artifacts
		'coverage'
	],
	maxFileWriteBytes: 512_000, // 512KB
	maxTotalDiffBytes: 2_000_000, // 2MB
	maxSnapshotBytes: 2_000_000, // 2MB
	maxBufferedTerminalBytes: 5_000_000, // 5MB
	commandArgPolicy: {
		disallow: [
			{ command: 'node', argsPrefix: ['-e', '--eval'] },
			{ command: 'npm', argsPrefix: ['exec'] }
		],
		requireApproval: [{ command: 'npx' }, { command: 'npm', argsPrefix: ['run'] }]
	},
	// Token-based context compaction (enabled by default for safety)
	context: {
		enableCompaction: true,
		maxMessagesBeforeCompaction: 50, // Fallback only
		keepLastMessages: 10,
		maxSummaryChars: 2000,
		modelContextLimit: 200000, // Claude default
		tokenThresholdPercent: 0.7, // Trigger at 70%
		reservedOutputTokens: 8192,
		minTokensAfterCompaction: 10000
	},
	// File content size management
	fileEviction: {
		maxReadBytes: 65536, // 64KB - truncate larger files
		contentRecencyTurns: 5,
		maxSummaryChars: 500,
		autoSummarizeLargeFiles: false // Truncate with guidance
	}
}
