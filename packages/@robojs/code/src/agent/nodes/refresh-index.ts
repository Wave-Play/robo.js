/**
 * Refresh index node - computes or refreshes the project index
 */

import type { AgentState, AgentStateUpdate } from '../state.js'
import type { CodeAgentContext } from '../types.js'
import { codeLogger } from '../../core/logger.js'

/**
 * Creates the refresh_index node
 *
 * Computes or refreshes the lightweight project index.
 * Used for file listing, drift detection, and Robo-aware signals.
 */
export function refreshIndexNode(context: CodeAgentContext) {
	return async (_state: AgentState): Promise<AgentStateUpdate> => {
		codeLogger.debug('Node: refresh_index')

		const { projectIndexer } = context

		try {
			// Refresh the index (light mode by default)
			const index = await projectIndexer.refresh({ deep: false })

			return {
				projectIndex: index,
				phase: 'refresh_index_done'
			}
		} catch (error) {
			codeLogger.warn('Failed to refresh project index:', error)
			return {
				projectIndex: null,
				phase: 'refresh_index_done'
			}
		}
	}
}
