/**
 * apply_changes tool - Atomically apply file changes
 */

import { z } from 'zod'
import type { ToolDefinition, ToolContext, ToolResult } from '../types.js'
import { successResult, errorResult, approvalRequired } from '../types.js'
import { checkFilePolicy, checkDiffPolicy } from '../runtime/policy.js'
import type { FileChange, FileDiff } from '../../types/changes.js'
import { CodeAgentError } from '../../errors/index.js'
import { codeLogger } from '../../core/logger.js'
import { checkStaleness } from '../tracking/file-tracker.js'

/**
 * Input schema for apply_changes
 */
export const applyChangesSchema = z.object({
	changes: z
		.array(
			z.union([
				z.object({
					path: z.string(),
					type: z.literal('create'),
					content: z.string()
				}),
				z.object({
					path: z.string(),
					type: z.literal('modify'),
					content: z.string()
				}),
				z.object({
					path: z.string(),
					type: z.literal('delete')
				})
			])
		)
		.describe('Array of file changes to apply'),
	reason: z.string().optional().describe('Reason for the changes')
})

export type ApplyChangesInput = z.infer<typeof applyChangesSchema>

/**
 * Output type for apply_changes
 */
export interface ApplyChangesOutput {
	applied: boolean
	changes: FileChange[]
	appliedPaths: string[]
	appliedDiffs?: FileDiff[]
	errors?: Array<{ path: string; error: string }>
}

/**
 * Generate a simple unified diff
 */
function generateUnifiedDiff(
	path: string,
	oldContent: string | null,
	newContent: string | null,
	type: 'create' | 'modify' | 'delete'
): string {
	const oldLines = oldContent?.split('\n') ?? []
	const newLines = newContent?.split('\n') ?? []

	let diff = `--- a/${path}\n+++ b/${path}\n`

	if (type === 'create') {
		diff += `@@ -0,0 +1,${newLines.length} @@\n`
		diff += newLines.map((line) => `+${line}`).join('\n')
	} else if (type === 'delete') {
		diff += `@@ -1,${oldLines.length} +0,0 @@\n`
		diff += oldLines.map((line) => `-${line}`).join('\n')
	} else {
		// Simple diff for modify - in production, use a proper diff algorithm
		diff += `@@ -1,${oldLines.length} +1,${newLines.length} @@\n`
		diff += oldLines.map((line) => `-${line}`).join('\n') + '\n'
		diff += newLines.map((line) => `+${line}`).join('\n')
	}

	return diff
}

/**
 * apply_changes tool definition
 */
export const applyChangesTool: ToolDefinition<ApplyChangesInput, ApplyChangesOutput> = {
	name: 'apply_changes',
	description:
		'Atomically apply multiple file changes. All changes succeed or none do. Use for coordinated file modifications.',
	schema: applyChangesSchema,
	mutates: true,
	requiresApproval: true,

	async execute(input: ApplyChangesInput, context: ToolContext): Promise<ToolResult<ApplyChangesOutput>> {
		const { changes, reason } = input

		if (changes.length === 0) {
			return errorResult('No changes provided', {
				errorCode: 'INVALID_ARGS',
				recoverable: false
			})
		}

		// Phase 1: Validate all changes against policy BEFORE reading/modifying anything
		const validationErrors: Array<{ path: string; error: string }> = []
		let totalSize = 0

		for (const change of changes) {
			const operation = change.type === 'delete' ? 'delete' : 'write'
			const size = 'content' in change ? new TextEncoder().encode(change.content).length : 0
			totalSize += size

			const policyCheck = checkFilePolicy({ path: change.path, operation, size }, context.policy)
			if (!policyCheck.allowed) {
				validationErrors.push({ path: change.path, error: policyCheck.reason! })
			}
		}

		// Check total diff size
		const diffCheck = checkDiffPolicy(totalSize, context.policy)
		if (!diffCheck.allowed) {
			return errorResult(diffCheck.reason!, {
				errorCode: 'POLICY_VIOLATION',
				recoverable: false
			})
		}

		if (validationErrors.length > 0) {
			return errorResult(`Policy violations: ${validationErrors.map((e) => `${e.path}: ${e.error}`).join('; ')}`, {
				errorCode: 'POLICY_VIOLATION',
				recoverable: false
			})
		}

		// Phase 1.5: Check staleness for modify/delete operations
		if (context.fileTracker) {
			for (const change of changes) {
				if (change.type === 'modify' || change.type === 'delete') {
					const snapshot = context.fileTracker.get(change.path)
					if (snapshot) {
						// Get current file state
						let currentState: { mtimeMs?: number; size: number; exists: boolean }
						try {
							const stat = await context.provider.stat(change.path)
							currentState = { mtimeMs: stat.mtimeMs, size: stat.size, exists: true }
						} catch {
							currentState = { size: 0, exists: false }
						}

						const staleCheck = checkStaleness(snapshot, currentState)

						if (staleCheck.isStale) {
							codeLogger.warn('[apply_changes] Stale file detected', {
								path: change.path,
								reason: staleCheck.reason,
								lastReadAt: snapshot.readAt,
								lastMtime: snapshot.mtimeMs,
								currentMtime: staleCheck.currentState?.mtimeMs
							})

							return errorResult(
								`File "${change.path}" has changed since last read (${staleCheck.reason}). Please re-read affected files before applying changes.`,
								{
									errorCode: 'STALE_FILE',
									recoverable: true
								}
							)
						}
					}
				}
			}
		}

		// Phase 2: Collect current state and generate diffs
		const diffs: FileDiff[] = []
		const currentContents = new Map<string, string | null>()

		try {
			for (const change of changes) {
				let oldContent: string | null = null

				if (change.type !== 'create') {
					try {
						oldContent = await context.provider.readFile(change.path)
					} catch {
						// File doesn't exist for modify/delete
						if (change.type === 'delete') {
							// Deleting non-existent file is OK
							continue
						}
						// Modifying non-existent file - treat as create
					}
				}

				currentContents.set(change.path, oldContent)

				const newContent = 'content' in change ? change.content : null
				const oldSize = oldContent ? new TextEncoder().encode(oldContent).length : 0
				const newSize = newContent ? new TextEncoder().encode(newContent).length : 0

				const diff: FileDiff = {
					path: change.path,
					type: change.type,
					oldSize: oldSize || undefined,
					newSize: newSize || undefined,
					unifiedDiff: generateUnifiedDiff(change.path, oldContent, newContent, change.type),
					additions: newContent ? newContent.split('\n').length : 0,
					deletions: oldContent ? oldContent.split('\n').length : 0
				}

				diffs.push(diff)
			}
		} catch (error) {
			return errorResult(`Failed to read current state: ${error instanceof Error ? error.message : String(error)}`, {
				errorCode: 'EXECUTION_FAILED',
				recoverable: true
			})
		}

		// Phase 3: Request approval if not auto-approve
		if (!context.policy.autoApprove) {
			// Emit file_proposed event
			context.onEvent?.({
				type: 'file_proposed',
				changes: changes as FileChange[]
			})

			return approvalRequired(changes as FileChange[], diffs, reason ?? `Apply ${changes.length} file change(s)`)
		}

		// Phase 4: Apply changes atomically
		// Note: True atomic application isn't possible in most filesystems
		// We do our best by validating everything first, then applying quickly
		const appliedPaths: string[] = []
		const rollbackActions: Array<() => Promise<void>> = []

		codeLogger.debug('[apply_changes] Starting to apply changes', {
			changeCount: changes.length,
			paths: changes.map((c) => c.path)
		})

		try {
			for (const change of changes) {
				const oldContent = currentContents.get(change.path)

				codeLogger.debug('[apply_changes] Applying change', {
					path: change.path,
					type: change.type,
					contentLength: 'content' in change ? change.content.length : 0,
					contentPreview: 'content' in change ? change.content.slice(0, 150) + '...' : undefined
				})

				if (change.type === 'create' || change.type === 'modify') {
					await context.provider.writeFile(change.path, change.content)
					appliedPaths.push(change.path)
					codeLogger.debug('[apply_changes] Change applied successfully', { path: change.path })

					// Record rollback action
					if (oldContent !== null && oldContent !== undefined) {
						const path = change.path
						const content: string = oldContent
						rollbackActions.push(async () => {
							await context.provider.writeFile(path, content)
						})
					} else {
						const path = change.path
						rollbackActions.push(async () => {
							await context.provider.deletePath(path)
						})
					}

					// Emit file_applied event
					context.onEvent?.({
						type: 'file_applied',
						path: change.path
					})
				} else if (change.type === 'delete') {
					if (oldContent !== null && oldContent !== undefined) {
						await context.provider.deletePath(change.path)
						appliedPaths.push(change.path)

						// Record rollback action
						const path = change.path
						const content: string = oldContent
						rollbackActions.push(async () => {
							await context.provider.writeFile(path, content)
						})

						context.onEvent?.({
							type: 'file_applied',
							path: change.path
						})
					}
				}
			}

			codeLogger.debug(`Applied ${appliedPaths.length} file changes`)

			// Clear the read tracker for all applied paths
			if (context.fileTracker) {
				for (const path of appliedPaths) {
					context.fileTracker.clear(path)
				}
			}

			return successResult({
				applied: true,
				changes: changes as FileChange[],
				appliedPaths,
				appliedDiffs: diffs
			})
		} catch (error) {
			// Attempt rollback
			codeLogger.warn(`Apply failed, attempting rollback of ${rollbackActions.length} changes`)

			for (const rollback of rollbackActions.reverse()) {
				try {
					await rollback()
				} catch (rollbackError) {
					codeLogger.error(`Rollback failed: ${rollbackError}`)
				}
			}

			return errorResult(
				`Failed to apply changes (rolled back): ${error instanceof Error ? error.message : String(error)}`,
				{
					errorCode: 'EXECUTION_FAILED',
					recoverable: true
				}
			)
		}
	}
}
