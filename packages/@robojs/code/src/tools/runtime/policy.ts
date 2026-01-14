/**
 * Policy enforcement for @robojs/code SDK tools
 *
 * Implements security policies for file access and command execution.
 * Policy enforcement happens at the tool layer before delegating to providers.
 */

import type { AgentPolicy, CommandArgPolicy } from '../../types/policy.js'
import type { CommandPolicyCheck, FilePolicyCheck, PolicyCheckResult } from '../types.js'
import { matchesDenyPath, validatePath } from '../../providers/utils/path.js'
import { codeLogger } from '../../core/logger.js'

// ============================================================================
// Command Policy
// ============================================================================

/**
 * Check if a command is allowed by the policy
 */
export function checkCommandPolicy(check: CommandPolicyCheck, policy: AgentPolicy): PolicyCheckResult {
	const { command, args } = check

	// Check if command is in allowlist
	if (!policy.commandAllowlist.includes(command)) {
		return {
			allowed: false,
			reason: `Command '${command}' is not in the allowlist. Allowed commands: ${policy.commandAllowlist.join(', ')}`
		}
	}

	// Check argument policy if defined
	if (policy.commandArgPolicy) {
		const argResult = checkCommandArgPolicy(command, args, policy.commandArgPolicy)
		if (!argResult.allowed) {
			return argResult
		}
	}

	return { allowed: true }
}

/**
 * Check command arguments against the argument policy
 */
export function checkCommandArgPolicy(command: string, args: string[], argPolicy: CommandArgPolicy): PolicyCheckResult {
	// Check disallowed patterns
	if (argPolicy.disallow) {
		for (const rule of argPolicy.disallow) {
			if (rule.command !== command) continue

			// If no argsPrefix specified, the entire command is blocked
			if (!rule.argsPrefix || rule.argsPrefix.length === 0) {
				return {
					allowed: false,
					reason: `Command '${command}' is blocked by policy`
				}
			}

			// Check if args start with any blocked prefix
			for (const prefix of rule.argsPrefix) {
				if (argsMatchPrefix(args, prefix)) {
					return {
						allowed: false,
						reason: `Command '${command}' with arguments starting with '${prefix}' is blocked by policy`
					}
				}
			}
		}
	}

	// Check patterns requiring approval
	if (argPolicy.requireApproval) {
		for (const rule of argPolicy.requireApproval) {
			if (rule.command !== command) continue

			// If no argsPrefix specified, the entire command requires approval
			if (!rule.argsPrefix || rule.argsPrefix.length === 0) {
				return {
					allowed: false,
					reason: `Command '${command}' requires approval`,
					canApprove: true
				}
			}

			// Check if args start with any prefix requiring approval
			for (const prefix of rule.argsPrefix) {
				if (argsMatchPrefix(args, prefix)) {
					return {
						allowed: false,
						reason: `Command '${command}' with arguments starting with '${prefix}' requires approval`,
						canApprove: true
					}
				}
			}
		}
	}

	return { allowed: true }
}

/**
 * Check if args start with a prefix pattern
 * The prefix can be a single arg or space-separated args
 */
function argsMatchPrefix(args: string[], prefix: string): boolean {
	const prefixParts = prefix.split(' ').filter(Boolean)

	if (prefixParts.length > args.length) {
		return false
	}

	for (let i = 0; i < prefixParts.length; i++) {
		if (args[i] !== prefixParts[i]) {
			return false
		}
	}

	return true
}

// ============================================================================
// File Policy
// ============================================================================

/**
 * Check if a file operation is allowed by the policy
 */
export function checkFilePolicy(check: FilePolicyCheck, policy: AgentPolicy): PolicyCheckResult {
	const { path, operation, size } = check

	// Validate path (throws on traversal)
	try {
		validatePath(path)
	} catch (error) {
		return {
			allowed: false,
			reason: `Invalid path: ${error instanceof Error ? error.message : String(error)}`
		}
	}

	// Check deny paths
	if (policy.denyPaths && matchesDenyPath(path, policy.denyPaths)) {
		return {
			allowed: false,
			reason: `Path '${path}' is denied by policy`
		}
	}

	// Check size limits for write operations
	if (operation === 'write' && size !== undefined) {
		const maxBytes = policy.maxFileWriteBytes ?? 512_000 // 512KB default
		if (size > maxBytes) {
			return {
				allowed: false,
				reason: `File size ${size} bytes exceeds maximum allowed ${maxBytes} bytes`
			}
		}
	}

	return { allowed: true }
}

/**
 * Check if a snapshot operation is allowed
 */
export function checkSnapshotPolicy(totalBytes: number, policy: AgentPolicy): PolicyCheckResult {
	const maxBytes = policy.maxSnapshotBytes ?? 2_000_000 // 2MB default

	if (totalBytes > maxBytes) {
		return {
			allowed: false,
			reason: `Snapshot size ${totalBytes} bytes exceeds maximum allowed ${maxBytes} bytes`
		}
	}

	return { allowed: true }
}

/**
 * Check if a total diff size is allowed
 */
export function checkDiffPolicy(totalBytes: number, policy: AgentPolicy): PolicyCheckResult {
	const maxBytes = policy.maxTotalDiffBytes ?? 2_000_000 // 2MB default

	if (totalBytes > maxBytes) {
		return {
			allowed: false,
			reason: `Total diff size ${totalBytes} bytes exceeds maximum allowed ${maxBytes} bytes`
		}
	}

	return { allowed: true }
}

// ============================================================================
// Policy Validator
// ============================================================================

/**
 * PolicyValidator wraps policy checks with logging and context
 */
export class PolicyValidator {
	private readonly policy: AgentPolicy
	private readonly runId: string

	constructor(policy: AgentPolicy, runId: string) {
		this.policy = policy
		this.runId = runId
	}

	/**
	 * Check if a command is allowed
	 */
	checkCommand(command: string, args: string[]): PolicyCheckResult {
		const result = checkCommandPolicy({ command, args }, this.policy)

		if (!result.allowed) {
			codeLogger.debug(`[${this.runId}] Command denied: ${command} ${args.join(' ')} - ${result.reason}`)
		}

		return result
	}

	/**
	 * Check if a file operation is allowed
	 */
	checkFile(path: string, operation: 'read' | 'write' | 'delete' | 'list', size?: number): PolicyCheckResult {
		const result = checkFilePolicy({ path, operation, size }, this.policy)

		if (!result.allowed) {
			codeLogger.debug(`[${this.runId}] File operation denied: ${operation} ${path} - ${result.reason}`)
		}

		return result
	}

	/**
	 * Check if a snapshot size is allowed
	 */
	checkSnapshot(totalBytes: number): PolicyCheckResult {
		const result = checkSnapshotPolicy(totalBytes, this.policy)

		if (!result.allowed) {
			codeLogger.debug(`[${this.runId}] Snapshot denied: ${totalBytes} bytes - ${result.reason}`)
		}

		return result
	}

	/**
	 * Check if a diff size is allowed
	 */
	checkDiff(totalBytes: number): PolicyCheckResult {
		const result = checkDiffPolicy(totalBytes, this.policy)

		if (!result.allowed) {
			codeLogger.debug(`[${this.runId}] Diff denied: ${totalBytes} bytes - ${result.reason}`)
		}

		return result
	}

	/**
	 * Get the underlying policy
	 */
	getPolicy(): AgentPolicy {
		return this.policy
	}

	/**
	 * Get paths that should be excluded from results
	 */
	getDenyPaths(): string[] {
		return this.policy.denyPaths ?? []
	}

	/**
	 * Check if auto-approve is enabled
	 */
	isAutoApprove(): boolean {
		return this.policy.autoApprove
	}
}
