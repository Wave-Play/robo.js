/**
 * HMR Manifest Utilities Tests
 *
 * Tests for the manifest helper functions used by incremental HMR updates.
 */

import { describe, it, expect } from '@jest/globals'
import {
	applyManifestUpdates,
	toBuildPath,
	reindexEntries,
	type ManifestEntry
} from '../../src/cli/utils/hmr-manifest.js'
import type { HmrMapping } from '../../src/cli/utils/hmr-mapper.js'
import type { RouteDefinitions } from '../../src/types/manifest-v1.js'

describe('HMR Manifest Utilities', () => {
	describe('toBuildPath', () => {
		it('converts source path to build path for TypeScript files', () => {
			const mapping: HmrMapping = {
				namespace: 'discordjs',
				route: 'events',
				key: 'ready',
				type: 'handler',
				filePath: 'src/events/ready.ts',
				sourceDir: 'src/events'
			}

			expect(toBuildPath(mapping)).toBe('events/ready.js')
		})

		it('converts nested source path to build path', () => {
			const mapping: HmrMapping = {
				namespace: 'discordjs',
				route: 'events',
				key: 'messageCreate',
				type: 'handler',
				filePath: 'src/events/messageCreate/chat.ts',
				sourceDir: 'src/events'
			}

			expect(toBuildPath(mapping)).toBe('events/messageCreate/chat.js')
		})

		it('handles tsx files', () => {
			const mapping: HmrMapping = {
				namespace: 'server',
				route: 'api',
				key: 'users',
				type: 'handler',
				filePath: 'src/api/users.tsx',
				sourceDir: 'src/api'
			}

			expect(toBuildPath(mapping)).toBe('api/users.js')
		})

		it('handles mts files', () => {
			const mapping: HmrMapping = {
				namespace: 'discordjs',
				route: 'commands',
				key: 'ping',
				type: 'handler',
				filePath: 'src/commands/ping.mts',
				sourceDir: 'src/commands'
			}

			expect(toBuildPath(mapping)).toBe('commands/ping.js')
		})

		it('normalizes Windows backslashes to forward slashes', () => {
			const mapping: HmrMapping = {
				namespace: 'discordjs',
				route: 'events',
				key: 'messageCreate',
				type: 'handler',
				filePath: 'src/events/messageCreate/chat.ts',
				sourceDir: 'src/events'
			}

			// Even if path.join uses backslashes, result should use forward slashes
			const result = toBuildPath(mapping)
			expect(result).not.toContain('\\')
			expect(result).toBe('events/messageCreate/chat.js')
		})

		it('handles deeply nested paths', () => {
			const mapping: HmrMapping = {
				namespace: 'discordjs',
				route: 'commands',
				key: 'admin moderation ban',
				type: 'handler',
				filePath: 'src/commands/admin/moderation/ban.ts',
				sourceDir: 'src/commands'
			}

			expect(toBuildPath(mapping)).toBe('commands/admin/moderation/ban.js')
		})
	})

	describe('reindexEntries', () => {
		it('assigns simple id for single handlers', () => {
			const entries: ManifestEntry[] = [
				{ id: '', key: 'ready', path: 'events/ready.js', source: 'project', plugin: null },
				{ id: '', key: 'messageCreate', path: 'events/messageCreate/chat.js', source: 'project', plugin: null }
			]

			reindexEntries(entries)

			expect(entries[0].id).toBe('ready')
			expect(entries[0].index).toBeUndefined()
			expect(entries[1].id).toBe('messageCreate')
			expect(entries[1].index).toBeUndefined()
		})

		it('assigns indexed id for multiple handlers with same key', () => {
			const entries: ManifestEntry[] = [
				{ id: '', key: 'messageCreate', path: 'events/messageCreate/chat.js', source: 'project', plugin: null },
				{ id: '', key: 'messageCreate', path: 'events/messageCreate/button.js', source: 'project', plugin: null },
				{ id: '', key: 'ready', path: 'events/ready.js', source: 'project', plugin: null }
			]

			reindexEntries(entries)

			// messageCreate handlers get indexed ids
			expect(entries[0].id).toBe('messageCreate:0')
			expect(entries[0].index).toBe(0)
			expect(entries[1].id).toBe('messageCreate:1')
			expect(entries[1].index).toBe(1)

			// ready handler gets simple id (only one)
			expect(entries[2].id).toBe('ready')
			expect(entries[2].index).toBeUndefined()
		})

		it('handles three handlers with same key', () => {
			const entries: ManifestEntry[] = [
				{ id: '', key: '_start', path: 'events/_start/file1.js', source: 'project', plugin: null },
				{ id: '', key: '_start', path: 'events/_start/file2.js', source: 'project', plugin: null },
				{ id: '', key: '_start', path: 'events/_start/file3.js', source: 'project', plugin: null }
			]

			reindexEntries(entries)

			expect(entries[0].id).toBe('_start:0')
			expect(entries[0].index).toBe(0)
			expect(entries[1].id).toBe('_start:1')
			expect(entries[1].index).toBe(1)
			expect(entries[2].id).toBe('_start:2')
			expect(entries[2].index).toBe(2)
		})

		it('handles mixed single and multiple handlers', () => {
			const entries: ManifestEntry[] = [
				{ id: '', key: 'ready', path: 'events/ready.js', source: 'project', plugin: null },
				{ id: '', key: 'messageCreate', path: 'events/messageCreate/chat.js', source: 'project', plugin: null },
				{ id: '', key: 'messageCreate', path: 'events/messageCreate/button.js', source: 'project', plugin: null },
				{ id: '', key: 'error', path: 'events/error.js', source: 'project', plugin: null }
			]

			reindexEntries(entries)

			expect(entries[0].id).toBe('ready')
			expect(entries[0].index).toBeUndefined()
			expect(entries[1].id).toBe('messageCreate:1')
			expect(entries[1].index).toBe(1)
			expect(entries[2].id).toBe('messageCreate:2')
			expect(entries[2].index).toBe(2)
			expect(entries[3].id).toBe('error')
			expect(entries[3].index).toBeUndefined()
		})

		it('removes stale index when handler becomes single', () => {
			// Simulate a handler that previously had an index but now is the only one
			const entries: ManifestEntry[] = [
				{ id: 'messageCreate:0', key: 'messageCreate', path: 'events/messageCreate/chat.js', source: 'project', plugin: null, index: 0 }
			]

			reindexEntries(entries)

			// Should now have simple id with no index
			expect(entries[0].id).toBe('messageCreate')
			expect(entries[0].index).toBeUndefined()
		})

		it('handles empty array', () => {
			const entries: ManifestEntry[] = []

			expect(() => reindexEntries(entries)).not.toThrow()
			expect(entries).toHaveLength(0)
		})

		it('preserves other entry properties', () => {
			const entries: ManifestEntry[] = [
				{
					id: '',
					key: 'ready',
					path: 'events/ready.js',
					source: 'project',
					plugin: null,
					exports: { default: true, config: true },
					metadata: { description: 'Ready handler' }
				}
			]

			reindexEntries(entries)

			expect(entries[0].exports).toEqual({ default: true, config: true })
			expect(entries[0].metadata).toEqual({ description: 'Ready handler' })
			expect(entries[0].source).toBe('project')
			expect(entries[0].plugin).toBeNull()
		})

		it('preserves parent and extended manifest fields during structural updates', () => {
			const entries: ManifestEntry[] = [
				{
					id: 'admin',
					key: 'admin',
					path: 'commands/admin.js',
					source: 'project',
					plugin: null,
					pluginVersion: '1.2.3',
					exports: { default: true, config: true, named: ['run'] },
					metadata: { description: 'Admin command' },
					module: 'admin',
					auto: true,
					extra: { scope: 'guild' },
					parent: 'root'
				}
			]

			const result = applyManifestUpdates(entries, {
				updated: [
					{
						namespace: 'discordjs',
						route: 'commands',
						key: 'admin',
						type: 'handler',
						filePath: 'src/commands/admin.ts',
						sourceDir: 'src/commands'
					}
				]
			})

			expect(result.entries[0]).toMatchObject({
				pluginVersion: '1.2.3',
				module: 'admin',
				auto: true,
				extra: { scope: 'guild' },
				parent: 'root'
			})
		})
	})

	describe('multiple: true route scenarios', () => {
		/**
		 * These tests simulate real-world scenarios for event handlers
		 * where multiple handlers share the same key (event name).
		 */

		it('scenario: adding second handler for same event', () => {
			// Initial state: one messageCreate handler
			const entries: ManifestEntry[] = [
				{ id: 'messageCreate', key: 'messageCreate', path: 'events/messageCreate/chat.js', source: 'project', plugin: null }
			]

			// Add a second handler
			entries.push({
				id: '', // Will be assigned by reindex
				key: 'messageCreate',
				path: 'events/messageCreate/button.js',
				source: 'project',
				plugin: null,
				exports: { default: true }
			})

			reindexEntries(entries)

			// Both should now have indexed ids
			expect(entries[0].id).toBe('messageCreate:0')
			expect(entries[0].index).toBe(0)
			expect(entries[1].id).toBe('messageCreate:1')
			expect(entries[1].index).toBe(1)
		})

		it('scenario: removing one handler leaves other intact', () => {
			// Initial state: two _start handlers
			const entries: ManifestEntry[] = [
				{ id: '_start:0', key: '_start', path: 'events/_start/file1.js', source: 'project', plugin: null, index: 0 },
				{ id: '_start:1', key: '_start', path: 'events/_start/file2.js', source: 'project', plugin: null, index: 1 }
			]

			// Remove first handler (simulate path-based filtering)
			const filteredEntries = entries.filter(e => e.path !== 'events/_start/file1.js')

			reindexEntries(filteredEntries)

			// Remaining handler should have simple id (it's now the only one)
			expect(filteredEntries).toHaveLength(1)
			expect(filteredEntries[0].id).toBe('_start')
			expect(filteredEntries[0].index).toBeUndefined()
			expect(filteredEntries[0].path).toBe('events/_start/file2.js')
		})

		it('scenario: removing one of three handlers', () => {
			// Initial state: three _start handlers
			const entries: ManifestEntry[] = [
				{ id: '_start:0', key: '_start', path: 'events/_start/file1.js', source: 'project', plugin: null, index: 0 },
				{ id: '_start:1', key: '_start', path: 'events/_start/file2.js', source: 'project', plugin: null, index: 1 },
				{ id: '_start:2', key: '_start', path: 'events/_start/file3.js', source: 'project', plugin: null, index: 2 }
			]

			// Remove middle handler
			const filteredEntries = entries.filter(e => e.path !== 'events/_start/file2.js')

			reindexEntries(filteredEntries)

			// Two remaining handlers should still have indexed ids
			expect(filteredEntries).toHaveLength(2)
			expect(filteredEntries[0].id).toBe('_start:0')
			expect(filteredEntries[0].index).toBe(0)
			expect(filteredEntries[1].id).toBe('_start:1') // Index updated
			expect(filteredEntries[1].index).toBe(1)
		})
	})

	describe('applyManifestUpdates', () => {
		const routeDefinitions: RouteDefinitions = {
			discordjs: {
				namespace: 'discordjs',
				plugin: '@robojs/discordjs',
				routes: {
					events: {
						directory: 'events',
						key: { style: 'parentOrFilename' },
						exports: { default: 'required', config: 'optional' }
					}
				}
			}
		} as const

		it('adds structural entries without scanning route files', () => {
			const added: HmrMapping[] = [
				{
					namespace: 'discordjs',
					route: 'events',
					key: 'ready',
					type: 'handler',
					filePath: 'src/events/ready.ts',
					sourceDir: 'src/events'
				}
			]

			const result = applyManifestUpdates([], { added, routeDefinitions })

			expect(result.entries).toEqual([
				expect.objectContaining({
					id: 'ready',
					key: 'ready',
					path: 'events/ready.js',
					source: 'project',
					plugin: null,
					exports: { default: true, config: undefined, named: [] }
				})
			])
			expect(result.summaries).toEqual([
				expect.objectContaining({
					key: 'ready',
					path: 'events/ready.js'
				})
			])
		})

		it('removes deleted entries and reindexes duplicates', () => {
			const entries: ManifestEntry[] = [
				{ id: 'messageCreate:0', key: 'messageCreate', path: 'events/messageCreate/chat.js', source: 'project', plugin: null, index: 0 },
				{ id: 'messageCreate:1', key: 'messageCreate', path: 'events/messageCreate/button.js', source: 'project', plugin: null, index: 1 }
			]
			const removed: HmrMapping[] = [
				{
					namespace: 'discordjs',
					route: 'events',
					key: 'messageCreate',
					type: 'handler',
					filePath: 'src/events/messageCreate/chat.ts',
					sourceDir: 'src/events'
				}
			]

			const result = applyManifestUpdates(entries, { removed })

			expect(result.entries).toEqual([
				expect.objectContaining({
					id: 'messageCreate',
					key: 'messageCreate',
					path: 'events/messageCreate/button.js'
				})
			])
			expect(result.summaries[0]?.index).toBeUndefined()
		})
	})
})
