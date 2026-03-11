/**
 * Lazy command descriptors for interactive CLI commands.
 * Each command's handler is dynamically imported on first invocation.
 */

import type { LazyCliCommand } from '../../utils/cli-commands.js'

export function getInteractiveCommands(): LazyCliCommand[] {
	return [
		{
			name: 'state',
			description: 'Inspect and modify runtime state',
			load: () => import('./state.js')
		},
		{
			name: 'flashcore',
			description: 'Inspect and modify Flashcore storage',
			load: () => import('./flashcore.js')
		},
		{
			name: 'status',
			description: 'Show system status and info',
			load: () => import('./status.js')
		},
		{
			name: 'env',
			description: 'Show loaded environment variables',
			load: () => import('./env.js')
		},
		{
			name: 'plugins',
			description: 'List installed plugins',
			load: () => import('./plugins.js')
		}
	]
}
