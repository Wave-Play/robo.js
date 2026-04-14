/**
 * Detect profile node - detects project type and Robo configuration
 */

import type { AgentState, AgentStateUpdate } from '../state.js'
import type { ProjectProfile } from '../../types/robo.js'
import type { CodeAgentContext } from '../types.js'
import { detectRoboProject, parsePackageJson } from '../../project/robo-detection.js'
import { codeLogger } from '../../core/logger.js'

/**
 * Creates the detect_profile node
 *
 * Detects if this is a Robo.js project and extracts profile information.
 * This node runs at the start of every run to establish context.
 */
export function detectProfileNode(context: CodeAgentContext) {
	return async (_state: AgentState): Promise<AgentStateUpdate> => {
		codeLogger.debug('Node: detect_profile')

		const { provider } = context

		try {
			// Read and parse package.json
			const content = await provider.readFile('/package.json')
			const pkg = parsePackageJson(content)

			if (!pkg) {
				return {
					projectProfile: null,
					phase: 'detect_profile_done'
				}
			}

			// Detect Robo project signals
			const signals = await detectRoboProject(provider, pkg)

			if (!signals) {
				// Not a Robo project, but still valid
				const profile: ProjectProfile = {
					kind: 'unknown',
					plugins: [],
					hasMock: false,
					directories: {},
					hasConfig: false
				}

				// Emit profile event
				context.onEvent?.({ type: 'profile', profile })

				return {
					projectProfile: profile,
					phase: 'detect_profile_done'
				}
			}

			// Build full profile
			const profile: ProjectProfile = {
				kind: signals.kind,
				plugins: signals.plugins,
				hasMock: signals.hasMock,
				directories: {
					commands: signals.commandsDir,
					events: signals.eventsDir,
					api: signals.apiDir,
					flashcore: signals.flashcoreDir
				},
				roboVersion: pkg.dependencies?.['robo.js'] ?? pkg.devDependencies?.['robo.js'],
				hasConfig: await hasRoboConfigFile(provider)
			}

			// Emit profile event
			context.onEvent?.({ type: 'profile', profile })

			return {
				projectProfile: profile,
				phase: 'detect_profile_done'
			}
		} catch (error) {
			codeLogger.warn('Failed to detect project profile:', error)
			return {
				projectProfile: null,
				phase: 'detect_profile_done'
			}
		}
	}
}

/**
 * Check if a robo.config file exists
 */
async function hasRoboConfigFile(provider: CodeAgentContext['provider']): Promise<boolean> {
	for (const path of ['/robo.config.ts', '/robo.config.js', '/robo.config.mjs']) {
		try {
			if (await provider.exists(path)) return true
		} catch {
			// Ignore errors
		}
	}
	return false
}
