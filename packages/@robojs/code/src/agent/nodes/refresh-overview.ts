/**
 * Refresh overview node - builds or refreshes the project overview
 */

import type { AgentState, AgentStateUpdate } from '../state.js'
import type { CodeAgentContext } from '../types.js'
import { codeLogger } from '../../core/logger.js'

/**
 * Creates the refresh_overview node
 *
 * Builds or refreshes the structured project overview ("mental model").
 * This includes package info, Robo details, key files, and agent memory.
 */
export function refreshOverviewNode(context: CodeAgentContext) {
	return async (_state: AgentState): Promise<AgentStateUpdate> => {
		codeLogger.debug('Node: refresh_overview')

		const { projectOverviewBuilder } = context

		try {
			// Refresh the overview (light mode by default)
			const overview = await projectOverviewBuilder.refresh({ deep: false })

			return {
				projectOverview: overview,
				phase: 'refresh_overview_done'
			}
		} catch (error) {
			codeLogger.warn('Failed to refresh project overview:', error)
			return {
				projectOverview: null,
				phase: 'refresh_overview_done'
			}
		}
	}
}
