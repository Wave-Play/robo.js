/**
 * HMR Mapper Tests
 *
 * Tests for the file-to-route mapping functionality used by HMR.
 */

import { describe, it, expect } from '@jest/globals'

// Import the HMR mapper functions
import {
	mapFileToRoute,
	requiresFullRestart,
	detectRouteChanges,
	getNonHandlerChanges,
	getRestartRequiredChanges,
	getUniqueRoutes,
	groupByRoute
} from '../../src/cli/utils/hmr-mapper.js'
import type { Change, ChangeType } from '../../src/cli/utils/watcher.js'
import type { RouteDefinitions } from '../../src/types/manifest-v1.js'

// Helper to create properly typed Change objects
function change(filePath: string, changeType: ChangeType): Change {
	return { filePath, changeType }
}

/**
 * Standard route definitions that mimic what would be loaded from the manifest.
 * These are used by most tests that need to map files to routes.
 */
const STANDARD_ROUTE_DEFINITIONS: RouteDefinitions = {
	discordjs: {
		plugin: 'project',
		namespace: 'discordjs',
		routes: {
			commands: {
				directory: 'commands',
				key: { style: 'filepath', separator: ' ' },
				nesting: { maxDepth: 3, allowIndex: false },
				exports: { named: ['autocomplete'], default: 'required', config: 'optional' },
				description: 'Discord slash commands'
			},
			context: {
				directory: 'context',
				key: { style: 'filename' },
				nesting: { maxDepth: 2, allowIndex: false },
				exports: { default: 'required', config: 'optional' },
				description: 'Discord context menu commands'
			},
			events: {
				directory: 'events',
				key: { style: 'filepath', separator: ' ' },
				exports: { default: 'required', config: 'optional' },
				multiple: true,
				filter: '^(?!_)',
				description: 'Discord gateway events'
			}
		}
	},
	server: {
		plugin: 'project',
		namespace: 'server',
		routes: {
			api: {
				directory: 'api',
				key: { style: 'filepath', separator: '/' },
				nesting: { maxDepth: 10, allowIndex: true },
				exports: { named: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], default: 'optional', config: 'optional' },
				description: 'HTTP API endpoints'
			},
			middleware: {
				directory: 'middleware',
				key: { style: 'filepath', separator: '/' },
				nesting: { maxDepth: 3, allowIndex: true },
				exports: { default: 'required', config: 'optional' },
				description: 'Server middleware'
			}
		}
	}
}

describe('HMR Mapper', () => {
	describe('requiresFullRestart', () => {
		it('returns true for config files', () => {
			expect(requiresFullRestart('config/robo.mjs')).toBe(true)
			expect(requiresFullRestart('config/plugins/server.ts')).toBe(true)
		})

		it('returns true for robo config files', () => {
			expect(requiresFullRestart('robo.config.mjs')).toBe(true)
			expect(requiresFullRestart('robo.config.ts')).toBe(true)
		})

		it('returns true for tsconfig', () => {
			expect(requiresFullRestart('tsconfig.json')).toBe(true)
		})

		it('returns true for .env files', () => {
			expect(requiresFullRestart('.env')).toBe(true)
		})

		it('returns true for hook files', () => {
			expect(requiresFullRestart('src/robo/hooks/ready.ts')).toBe(true)
			expect(requiresFullRestart('src/robo/hooks/start.ts')).toBe(true)
		})

		it('returns true for route definition files', () => {
			expect(requiresFullRestart('src/robo/routes/commands.ts')).toBe(true)
		})

		it('returns true for terminal command files', () => {
			expect(requiresFullRestart('src/robo/terminal/commands/skills.ts')).toBe(true)
			expect(requiresFullRestart('src/robo/terminal/commands/discord/status.ts')).toBe(true)
		})

		it('returns false for handler files', () => {
			expect(requiresFullRestart('src/commands/ping.ts')).toBe(false)
			expect(requiresFullRestart('src/events/ready.ts')).toBe(false)
			expect(requiresFullRestart('src/api/users/[id].ts')).toBe(false)
		})

		it('returns false for utility files', () => {
			expect(requiresFullRestart('src/utils/format.ts')).toBe(false)
			expect(requiresFullRestart('src/lib/database.ts')).toBe(false)
		})

		it('handles Windows-style paths', () => {
			expect(requiresFullRestart('config\\robo.mjs')).toBe(true)
			expect(requiresFullRestart('src\\commands\\ping.ts')).toBe(false)
		})
	})

	describe('mapFileToRoute', () => {
		it('maps command files to discord:commands route', () => {
			const result = mapFileToRoute('src/commands/ping.ts', STANDARD_ROUTE_DEFINITIONS)
			expect(result).toEqual({
				namespace: 'discordjs',
				route: 'commands',
				key: 'ping',
				type: 'handler',
				filePath: 'src/commands/ping.ts',
				sourceDir: 'src/commands'
			})
		})

		it('maps nested command files with space-separated key', () => {
			const result = mapFileToRoute('src/commands/admin/ban.ts', STANDARD_ROUTE_DEFINITIONS)
			expect(result).toEqual({
				namespace: 'discordjs',
				route: 'commands',
				key: 'admin ban',
				type: 'handler',
				filePath: 'src/commands/admin/ban.ts',
				sourceDir: 'src/commands'
			})
		})

		it('maps event files to discord:events route', () => {
			const result = mapFileToRoute('src/events/ready.ts', STANDARD_ROUTE_DEFINITIONS)
			expect(result).toEqual({
				namespace: 'discordjs',
				route: 'events',
				key: 'ready',
				type: 'handler',
				filePath: 'src/events/ready.ts',
				sourceDir: 'src/events'
			})
		})

		it('maps nested event files', () => {
			const result = mapFileToRoute('src/events/interactionCreate/handler.ts', STANDARD_ROUTE_DEFINITIONS)
			expect(result).toEqual({
				namespace: 'discordjs',
				route: 'events',
				key: 'interactionCreate handler',
				type: 'handler',
				filePath: 'src/events/interactionCreate/handler.ts',
				sourceDir: 'src/events'
			})
		})

		it('maps API route files', () => {
			const result = mapFileToRoute('src/api/users.ts', STANDARD_ROUTE_DEFINITIONS)
			expect(result).toEqual({
				namespace: 'server',
				route: 'api',
				key: 'users',
				type: 'handler',
				filePath: 'src/api/users.ts',
				sourceDir: 'src/api'
			})
		})

		it('maps dynamic API routes', () => {
			const result = mapFileToRoute('src/api/users/[id].ts', STANDARD_ROUTE_DEFINITIONS)
			expect(result).toEqual({
				namespace: 'server',
				route: 'api',
				key: 'users/[id]',
				type: 'handler',
				filePath: 'src/api/users/[id].ts',
				sourceDir: 'src/api'
			})
		})

		it('identifies utility files', () => {
			const result = mapFileToRoute('src/utils/format.ts')
			expect(result).toEqual({
				namespace: '',
				route: '',
				key: '',
				type: 'utility',
				filePath: 'src/utils/format.ts',
				sourceDir: 'src'
			})
		})

		it('identifies config files as config type', () => {
			const result = mapFileToRoute('config/robo.mjs')
			expect(result?.type).toBe('config')
		})

		it('identifies hook files as hook type', () => {
			const result = mapFileToRoute('src/robo/hooks/ready.ts')
			expect(result?.type).toBe('hook')
		})

		it('returns null for files outside src/', () => {
			const result = mapFileToRoute('package.json')
			expect(result).toBe(null)
		})

		it('uses custom route definitions when provided', () => {
			// Route definitions use directories WITHOUT the src/ prefix
			// (as they appear in the manifest)
			const routeDefinitions: RouteDefinitions = {
				custom: {
					plugin: 'project',
					namespace: 'custom',
					routes: {
						handlers: {
							directory: 'custom-handlers',
							key: { style: 'filename' as const, separator: ' ', nested: 'camelCase' as const }
						}
					}
				}
			}

			const result = mapFileToRoute('src/custom-handlers/my-handler.ts', routeDefinitions)
			expect(result).toEqual({
				namespace: 'custom',
				route: 'handlers',
				key: 'my-handler',
				type: 'handler',
				filePath: 'src/custom-handlers/my-handler.ts',
				sourceDir: 'src/custom-handlers'
			})
		})

		it('does not treat disallowed index files as handlers', () => {
			// Discord slash commands explicitly disallow index.ts as a handler.
			// It should be treated as a utility (it may still be imported by real handlers).
			const result = mapFileToRoute('src/commands/admin/index.ts', STANDARD_ROUTE_DEFINITIONS)
			expect(result?.type).toBe('utility')
		})

		it('maps allowed index files to their parent key (api route)', () => {
			const result = mapFileToRoute('src/api/users/index.ts', STANDARD_ROUTE_DEFINITIONS)
			expect(result).toEqual({
				namespace: 'server',
				route: 'api',
				key: 'users',
				type: 'handler',
				filePath: 'src/api/users/index.ts',
				sourceDir: 'src/api'
			})
		})

		it('maps filename-style routes using only the basename (even when nested)', () => {
			const result = mapFileToRoute('src/context/user/Profile.ts', STANDARD_ROUTE_DEFINITIONS)
			expect(result).toEqual({
				namespace: 'discordjs',
				route: 'context',
				key: 'Profile',
				type: 'handler',
				filePath: 'src/context/user/Profile.ts',
				sourceDir: 'src/context'
			})
		})

		it('treats filtered-out files in handler directories as utilities', () => {
			// Discord.js events filter excludes lifecycle files starting with underscore.
			const result = mapFileToRoute('src/events/_start.ts', STANDARD_ROUTE_DEFINITIONS)
			expect(result?.type).toBe('utility')
		})

		it('treats files deeper than maxDepth as utilities', () => {
			// Context route maxDepth is 2; this file is nested 3 directories deep under context/.
			const result = mapFileToRoute('src/context/user/admin/extra/TooDeep.ts', STANDARD_ROUTE_DEFINITIONS)
			expect(result?.type).toBe('utility')
		})

		it('returns utility type for unknown handler directories without route definitions', () => {
			// Without route definitions, handler paths are treated as utilities
			const result = mapFileToRoute('src/commands/ping.ts')
			expect(result?.type).toBe('utility')
		})
	})

	describe('detectRouteChanges', () => {
		it('categorizes added files', () => {
			const changes = [
				change('src/commands/new-cmd.ts', 'added')
			]

			const result = detectRouteChanges(changes, STANDARD_ROUTE_DEFINITIONS)
			expect(result.added).toHaveLength(1)
			expect(result.added[0].key).toBe('new-cmd')
			expect(result.removed).toHaveLength(0)
			expect(result.modified).toHaveLength(0)
		})

		it('categorizes removed files', () => {
			const changes = [
				change('src/commands/old-cmd.ts', 'removed')
			]

			const result = detectRouteChanges(changes, STANDARD_ROUTE_DEFINITIONS)
			expect(result.removed).toHaveLength(1)
			expect(result.removed[0].key).toBe('old-cmd')
			expect(result.added).toHaveLength(0)
			expect(result.modified).toHaveLength(0)
		})

		it('categorizes modified files', () => {
			const changes = [
				change('src/commands/ping.ts', 'changed')
			]

			const result = detectRouteChanges(changes, STANDARD_ROUTE_DEFINITIONS)
			expect(result.modified).toHaveLength(1)
			expect(result.modified[0].key).toBe('ping')
			expect(result.added).toHaveLength(0)
			expect(result.removed).toHaveLength(0)
		})

		it('handles mixed changes', () => {
			const changes = [
				change('src/commands/new.ts', 'added'),
				change('src/commands/old.ts', 'removed'),
				change('src/commands/ping.ts', 'changed')
			]

			const result = detectRouteChanges(changes, STANDARD_ROUTE_DEFINITIONS)
			expect(result.added).toHaveLength(1)
			expect(result.removed).toHaveLength(1)
			expect(result.modified).toHaveLength(1)
		})

		it('filters out non-handler files', () => {
			const changes = [
				change('src/commands/ping.ts', 'changed'),
				change('src/utils/format.ts', 'changed')
			]

			const result = detectRouteChanges(changes, STANDARD_ROUTE_DEFINITIONS)
			expect(result.modified).toHaveLength(1)
			expect(result.modified[0].key).toBe('ping')
		})
	})

	describe('getNonHandlerChanges', () => {
		it('returns only utility file changes', () => {
			const changes = [
				change('src/commands/ping.ts', 'changed'),
				change('src/utils/format.ts', 'changed'),
				change('src/lib/database.ts', 'changed')
			]

			const result = getNonHandlerChanges(changes, STANDARD_ROUTE_DEFINITIONS)
			expect(result).toHaveLength(2)
			expect(result.map(r => r.filePath)).toContain('src/utils/format.ts')
			expect(result.map(r => r.filePath)).toContain('src/lib/database.ts')
		})

		it('returns empty array when no utility files changed', () => {
			const changes = [
				change('src/commands/ping.ts', 'changed')
			]

			const result = getNonHandlerChanges(changes, STANDARD_ROUTE_DEFINITIONS)
			expect(result).toHaveLength(0)
		})
	})

	describe('getRestartRequiredChanges', () => {
		it('returns changes that require full restart', () => {
			const changes = [
				change('src/commands/ping.ts', 'changed'),
				change('config/robo.mjs', 'changed'),
				change('tsconfig.json', 'changed')
			]

			const result = getRestartRequiredChanges(changes)
			expect(result).toHaveLength(2)
			expect(result.map(c => c.filePath)).toContain('config/robo.mjs')
			expect(result.map(c => c.filePath)).toContain('tsconfig.json')
		})

		it('returns empty array when no restart required', () => {
			const changes = [
				change('src/commands/ping.ts', 'changed'),
				change('src/utils/format.ts', 'changed')
			]

			const result = getRestartRequiredChanges(changes)
			expect(result).toHaveLength(0)
		})
	})

	describe('groupByRoute', () => {
		it('groups mappings by namespace:route', () => {
			const mappings = [
				mapFileToRoute('src/commands/ping.ts', STANDARD_ROUTE_DEFINITIONS),
				mapFileToRoute('src/commands/help.ts', STANDARD_ROUTE_DEFINITIONS),
				mapFileToRoute('src/events/ready.ts', STANDARD_ROUTE_DEFINITIONS)
			]

			const groups = groupByRoute(mappings as any[])
			expect(groups.size).toBe(2)
			expect(groups.get('discordjs:commands')).toHaveLength(2)
			expect(groups.get('discordjs:events')).toHaveLength(1)
		})
	})

	describe('getUniqueRoutes', () => {
		it('returns unique namespace:route tuples', () => {
			const mappings = [
				mapFileToRoute('src/commands/ping.ts', STANDARD_ROUTE_DEFINITIONS),
				mapFileToRoute('src/commands/help.ts', STANDARD_ROUTE_DEFINITIONS),
				mapFileToRoute('src/events/ready.ts', STANDARD_ROUTE_DEFINITIONS)
			]

			const routes = getUniqueRoutes(mappings as any[])
			expect(routes).toHaveLength(2)
			expect(routes).toContainEqual(['discordjs', 'commands'])
			expect(routes).toContainEqual(['discordjs', 'events'])
		})

		it('handles empty array', () => {
			const routes = getUniqueRoutes([])
			expect(routes).toHaveLength(0)
		})
	})
})

describe('HMR Edge Cases', () => {
	describe('File path edge cases', () => {
		it('handles files with multiple extensions', () => {
			const result = mapFileToRoute('src/commands/test.config.ts', STANDARD_ROUTE_DEFINITIONS)
			expect(result?.key).toBe('test.config')
		})

		it('handles files with dots in name', () => {
			const result = mapFileToRoute('src/commands/my.command.ts', STANDARD_ROUTE_DEFINITIONS)
			expect(result?.key).toBe('my.command')
		})

		it('handles deeply nested paths', () => {
			const result = mapFileToRoute('src/commands/admin/moderation/ban/permanent.ts', STANDARD_ROUTE_DEFINITIONS)
			expect(result?.key).toBe('admin moderation ban permanent')
		})

		it('handles tsx files', () => {
			const result = mapFileToRoute('src/api/dashboard.tsx', STANDARD_ROUTE_DEFINITIONS)
			expect(result?.type).toBe('handler')
			expect(result?.key).toBe('dashboard')
		})

		it('handles mjs files', () => {
			const result = mapFileToRoute('src/commands/legacy.mjs', STANDARD_ROUTE_DEFINITIONS)
			expect(result?.type).toBe('handler')
			expect(result?.key).toBe('legacy')
		})

		it('handles empty path gracefully', () => {
			const result = mapFileToRoute('')
			expect(result).toBe(null)
		})

		it('handles root src file', () => {
			const result = mapFileToRoute('src/index.ts')
			expect(result?.type).toBe('utility')
		})
	})

	describe('Change detection edge cases', () => {
		it('handles empty changes array', () => {
			const result = detectRouteChanges([])
			expect(result.added).toHaveLength(0)
			expect(result.removed).toHaveLength(0)
			expect(result.modified).toHaveLength(0)
		})

		it('processes multiple routes in same change batch', () => {
			const changes = [
				change('src/commands/ping.ts', 'changed'),
				change('src/events/ready.ts', 'changed'),
				change('src/api/users.ts', 'changed')
			]

			const result = detectRouteChanges(changes, STANDARD_ROUTE_DEFINITIONS)
			expect(result.modified).toHaveLength(3)

			const namespaces = result.modified.map(m => m.namespace)
			expect(namespaces).toContain('discordjs')
			expect(namespaces).toContain('server')
		})
	})

	describe('Error resilience', () => {
		it('handles undefined route definitions gracefully - returns utility type', () => {
			// Without route definitions, handler paths are treated as utilities
			const result = mapFileToRoute('src/commands/ping.ts', undefined)
			expect(result?.type).toBe('utility')
		})

		it('handles malformed file paths without throwing', () => {
			expect(() => mapFileToRoute('///invalid//path.ts')).not.toThrow()
			expect(() => mapFileToRoute('.')).not.toThrow()
		})
	})
})

describe('parentOrFilename key style', () => {
	/**
	 * Tests for the parentOrFilename key style used by Discord.js events.
	 * This style extracts:
	 * - Parent folder name for nested files (e.g., messageCreate/chat.ts → "messageCreate")
	 * - Filename for root-level files (e.g., ready.ts → "ready")
	 */
	const PARENTORFILENAME_ROUTES: RouteDefinitions = {
		discordjs: {
			plugin: 'project',
			namespace: 'discordjs',
			routes: {
				events: {
					directory: 'events',
					key: { style: 'parentOrFilename' },
					multiple: true
				}
			}
		}
	}

	it('extracts filename for root-level files', () => {
		const result = mapFileToRoute('src/events/ready.ts', PARENTORFILENAME_ROUTES)
		expect(result?.key).toBe('ready')
	})

	it('extracts parent folder name for nested files', () => {
		const result = mapFileToRoute('src/events/messageCreate/chat.ts', PARENTORFILENAME_ROUTES)
		expect(result?.key).toBe('messageCreate')
	})

	it('extracts parent folder for deeply nested files', () => {
		// Even with deep nesting, only the first segment (parent folder) is used
		const result = mapFileToRoute('src/events/messageCreate/button/handler.ts', PARENTORFILENAME_ROUTES)
		expect(result?.key).toBe('messageCreate')
	})

	it('handles index files in nested directories', () => {
		// Index files in nested directories should use the parent folder as key
		const result = mapFileToRoute('src/events/interactionCreate/index.ts', PARENTORFILENAME_ROUTES)
		expect(result?.key).toBe('interactionCreate')
	})

	it('handles multiple files under same event folder', () => {
		// Multiple handlers for same event should all get the same key
		const chat = mapFileToRoute('src/events/messageCreate/chat.ts', PARENTORFILENAME_ROUTES)
		const button = mapFileToRoute('src/events/messageCreate/button.ts', PARENTORFILENAME_ROUTES)
		const modal = mapFileToRoute('src/events/messageCreate/modal.ts', PARENTORFILENAME_ROUTES)

		expect(chat?.key).toBe('messageCreate')
		expect(button?.key).toBe('messageCreate')
		expect(modal?.key).toBe('messageCreate')

		// But their file paths should be different
		expect(chat?.filePath).toBe('src/events/messageCreate/chat.ts')
		expect(button?.filePath).toBe('src/events/messageCreate/button.ts')
		expect(modal?.filePath).toBe('src/events/messageCreate/modal.ts')
	})

	it('correctly identifies as handler type', () => {
		const result = mapFileToRoute('src/events/messageCreate/chat.ts', PARENTORFILENAME_ROUTES)
		expect(result?.type).toBe('handler')
	})

	it('sets correct sourceDir', () => {
		const result = mapFileToRoute('src/events/messageCreate/chat.ts', PARENTORFILENAME_ROUTES)
		expect(result?.sourceDir).toBe('src/events')
	})
})

describe('HMR Dependency Chain (Phase 3 Preparation)', () => {
	/**
	 * These tests document the expected behavior for Phase 3 dependency tracking.
	 * They document the current limitation where utility changes don't auto-reload handlers.
	 */

	it('KNOWN LIMITATION: utility change does NOT auto-reload handlers in Phase 1-2', () => {
		// This documents the current limitation
		const changes = [
			change('src/utils/format.ts', 'changed')
		]

		const handlerChanges = detectRouteChanges(changes)
		expect(handlerChanges.modified).toHaveLength(0) // No handlers are detected

		// The mapper correctly identifies this as a utility
		const mapping = mapFileToRoute('src/utils/format.ts')
		expect(mapping?.type).toBe('utility')
	})
})
