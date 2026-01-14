/**
 * Integration tests for policy enforcement across all tools
 *
 * Verifies that deny-paths, command allowlists, and argument policies
 * are consistently enforced across the tool layer.
 */

import { jest } from '@jest/globals'
import { fsReadTool } from '../../src/tools/fs/read.js'
import { fsReadManyTool } from '../../src/tools/fs/read-many.js'
import { fsWriteTool } from '../../src/tools/fs/write.js'
import { fsListTool } from '../../src/tools/fs/list.js'
import { fsSearchTool } from '../../src/tools/fs/search.js'
import { fsSnapshotTool } from '../../src/tools/fs/snapshot.js'
import { fsStatTool } from '../../src/tools/fs/stat.js'
import { fsReadHeadTool } from '../../src/tools/fs/read-head.js'
import { fsReadTailTool } from '../../src/tools/fs/read-tail.js'
import { fsReadRangeTool } from '../../src/tools/fs/read-range.js'
import { terminalRunTool } from '../../src/tools/terminal/run.js'
import { applyChangesTool } from '../../src/tools/changes/apply.js'
import type { ToolContext } from '../../src/tools/types.js'
import type { ExecutionProvider, AgentPolicy, FileChange } from '../../src/types/index.js'

/**
 * Mock provider that includes sensitive files
 */
function createMockProvider(): ExecutionProvider {
	const files: Record<string, string> = {
		// Normal files
		'/src/index.ts': 'export const app = {};',
		'/src/utils.ts': 'export function helper() {}',
		'/package.json': '{"name": "test"}',

		// Sensitive files that should be denied
		'/.env': 'API_KEY=secret123',
		'/.env.local': 'DB_PASSWORD=supersecret',
		'/.git/config': '[core]\nrepositoryformatversion = 0',
		'/.git/HEAD': 'ref: refs/heads/main',
		'/node_modules/lodash/index.js': 'module.exports = {}',
		'/secrets/private.key': '-----BEGIN RSA PRIVATE KEY-----',
		'/certs/server.pem': '-----BEGIN CERTIFICATE-----'
	}

	return {
		readFile: jest.fn(async (path: string) => {
			if (files[path]) return files[path]
			throw new Error(`File not found: ${path}`)
		}),
		writeFile: jest.fn(async () => {}),
		deletePath: jest.fn(async () => {}),
		exists: jest.fn(async (path: string) => {
			return path in files
		}),
		stat: jest.fn(async (path: string) => {
			if (files[path]) {
				return { size: files[path].length, isDirectory: false }
			}
			throw new Error(`File not found: ${path}`)
		}),
		readdir: jest.fn(async (path: string) => {
			const entries: Array<{ name: string; path: string; isDirectory: boolean }> = []
			const prefix = path.endsWith('/') ? path : `${path}/`

			for (const filePath of Object.keys(files)) {
				if (filePath.startsWith(prefix)) {
					const relative = filePath.slice(prefix.length)
					const parts = relative.split('/')
					if (parts.length === 1 && parts[0]) {
						entries.push({
							name: parts[0],
							path: filePath,
							isDirectory: false
						})
					}
				}
			}
			return entries
		}),
		search: jest.fn(async (pattern: string) => {
			const results: Array<{ path: string; matches: Array<{ line: number; column: number; text: string }> }> = []
			for (const [path, content] of Object.entries(files)) {
				if (content.includes(pattern)) {
					results.push({
						path,
						matches: [{ line: 1, column: 1, text: content.slice(0, 50) }]
					})
				}
			}
			return results
		}),
		snapshot: jest.fn(async () => ({ ...files })),
		run: jest.fn(async () => ({ exitCode: 0, output: 'success' })),
		runStream: jest.fn(async function* () {})
	} as unknown as ExecutionProvider
}

function createContext(policy: Partial<AgentPolicy> = {}, provider?: ExecutionProvider): ToolContext {
	return {
		provider: provider ?? createMockProvider(),
		policy: {
			autoApprove: true,
			maxIterations: 10,
			commandAllowlist: ['npm', 'node', 'git'],
			denyPaths: ['.env', '.env.local', '.git/', 'node_modules/', '*.key', '*.pem'],
			...policy
		},
		runId: 'policy-test-run'
	}
}

describe('Policy Integration: Deny Path Enforcement', () => {
	describe('fs_read denies all sensitive paths', () => {
		const sensitivePaths = [
			{ path: '/.env', description: 'env file' },
			{ path: '/.env.local', description: 'local env file' },
			{ path: '/.git/config', description: 'git config' },
			{ path: '/.git/HEAD', description: 'git HEAD' },
			{ path: '/node_modules/lodash/index.js', description: 'node_modules file' },
			{ path: '/secrets/private.key', description: 'private key' },
			{ path: '/certs/server.pem', description: 'PEM certificate' }
		]

		test.each(sensitivePaths)('denies reading $description at $path', async ({ path }) => {
			const context = createContext()
			const result = await fsReadTool.execute({ path }, context)

			expect(result.success).toBe(false)
			expect(result.errorCode).toBe('POLICY_VIOLATION')
		})
	})

	describe('fs_stat denies sensitive paths', () => {
		it('denies stat on .env', async () => {
			const context = createContext()
			const result = await fsStatTool.execute({ path: '/.env' }, context)

			expect(result.success).toBe(false)
			expect(result.errorCode).toBe('POLICY_VIOLATION')
		})

		it('denies stat on .git directory contents', async () => {
			const context = createContext()
			const result = await fsStatTool.execute({ path: '/.git/config' }, context)

			expect(result.success).toBe(false)
			expect(result.errorCode).toBe('POLICY_VIOLATION')
		})
	})

	describe('fs_read_head/tail/range deny sensitive paths', () => {
		it('denies head read on .env', async () => {
			const context = createContext()
			const result = await fsReadHeadTool.execute({ path: '/.env', maxBytes: 100 }, context)

			expect(result.success).toBe(false)
			expect(result.errorCode).toBe('POLICY_VIOLATION')
		})

		it('denies tail read on private key', async () => {
			const context = createContext()
			const result = await fsReadTailTool.execute({ path: '/secrets/private.key', maxBytes: 100 }, context)

			expect(result.success).toBe(false)
			expect(result.errorCode).toBe('POLICY_VIOLATION')
		})

		it('denies range read on .git contents', async () => {
			const context = createContext()
			const result = await fsReadRangeTool.execute({ path: '/.git/HEAD', offset: 0, length: 10 }, context)

			expect(result.success).toBe(false)
			expect(result.errorCode).toBe('POLICY_VIOLATION')
		})
	})

	describe('fs_read_many rejects entire batch if any path denied', () => {
		it('rejects batch containing one denied path', async () => {
			const context = createContext()
			const result = await fsReadManyTool.execute(
				{
					paths: ['/src/index.ts', '/.env', '/package.json']
				},
				context
			)

			expect(result.success).toBe(false)
			expect(result.errorCode).toBe('POLICY_VIOLATION')
		})

		it('allows batch with only safe paths', async () => {
			const context = createContext()
			const result = await fsReadManyTool.execute(
				{
					paths: ['/src/index.ts', '/src/utils.ts', '/package.json']
				},
				context
			)

			expect(result.success).toBe(true)
			expect(result.data?.files).toHaveLength(3)
		})
	})

	describe('fs_write denies sensitive paths', () => {
		it('denies writing to .env', async () => {
			const context = createContext()
			const result = await fsWriteTool.execute({ path: '/.env', content: 'MALICIOUS=true' }, context)

			expect(result.success).toBe(false)
			expect(result.errorCode).toBe('POLICY_VIOLATION')
		})

		it('denies writing to .git directory', async () => {
			const context = createContext()
			const result = await fsWriteTool.execute(
				{ path: '/.git/hooks/pre-commit', content: '#!/bin/bash\nrm -rf /' },
				context
			)

			expect(result.success).toBe(false)
			expect(result.errorCode).toBe('POLICY_VIOLATION')
		})

		it('denies writing key files', async () => {
			const context = createContext()
			const result = await fsWriteTool.execute({ path: '/new-secret.key', content: 'fake key' }, context)

			expect(result.success).toBe(false)
			expect(result.errorCode).toBe('POLICY_VIOLATION')
		})
	})

	describe('fs_list denies listing sensitive directories', () => {
		it('denies listing .git directory', async () => {
			const context = createContext()
			const result = await fsListTool.execute({ path: '/.git', recursive: false }, context)

			expect(result.success).toBe(false)
			expect(result.errorCode).toBe('POLICY_VIOLATION')
		})

		it('denies listing node_modules', async () => {
			const context = createContext()
			const result = await fsListTool.execute({ path: '/node_modules', recursive: false }, context)

			expect(result.success).toBe(false)
			expect(result.errorCode).toBe('POLICY_VIOLATION')
		})
	})

	describe('fs_search filters out denied paths from results', () => {
		it('filters .env from search results', async () => {
			const context = createContext()
			const result = await fsSearchTool.execute({ pattern: 'secret', maxResults: 100 }, context)

			expect(result.success).toBe(true)
			const paths = result.data?.results.map((r) => r.path) ?? []
			expect(paths).not.toContain('/.env')
			expect(paths).not.toContain('/.env.local')
		})

		it('filters private.key from search results', async () => {
			const context = createContext()
			const result = await fsSearchTool.execute({ pattern: 'BEGIN', maxResults: 100 }, context)

			expect(result.success).toBe(true)
			const paths = result.data?.results.map((r) => r.path) ?? []
			expect(paths).not.toContain('/secrets/private.key')
			expect(paths).not.toContain('/certs/server.pem')
		})
	})

	describe('fs_snapshot filters out denied paths', () => {
		it('excludes sensitive files from snapshot', async () => {
			const context = createContext()
			// snapshot schema uses optional paths array, not single path
			const result = await fsSnapshotTool.execute({}, context)

			expect(result.success).toBe(true)
			const paths = Object.keys(result.data?.files ?? {})

			// Should include safe files
			expect(paths).toContain('/src/index.ts')
			expect(paths).toContain('/package.json')

			// Should exclude sensitive files
			expect(paths).not.toContain('/.env')
			expect(paths).not.toContain('/.git/config')
			expect(paths).not.toContain('/node_modules/lodash/index.js')
			expect(paths).not.toContain('/secrets/private.key')
		})
	})
})

describe('Policy Integration: Command Allowlist', () => {
	it('allows commands in allowlist', async () => {
		const context = createContext({ commandAllowlist: ['npm', 'node', 'git'] })
		const result = await terminalRunTool.execute({ command: 'npm', args: ['install'] }, context)

		expect(result.success).toBe(true)
	})

	it('denies commands not in allowlist', async () => {
		const context = createContext({ commandAllowlist: ['npm', 'node'] })
		const result = await terminalRunTool.execute({ command: 'rm', args: ['-rf', '/'] }, context)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('COMMAND_DENIED')
	})

	it('denies curl when not in allowlist', async () => {
		const context = createContext({ commandAllowlist: ['npm'] })
		const result = await terminalRunTool.execute({ command: 'curl', args: ['http://malicious.com'] }, context)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('COMMAND_DENIED')
	})
})

describe('Policy Integration: Argument Policies', () => {
	it('blocks dangerous node -e eval', async () => {
		const context = createContext({
			commandAllowlist: ['node'],
			commandArgPolicy: {
				disallow: [{ command: 'node', argsPrefix: ['-e', '--eval'] }]
			}
		})

		const result = await terminalRunTool.execute(
			{ command: 'node', args: ['-e', 'require("child_process").exec("rm -rf /")'] },
			context
		)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('COMMAND_DENIED')
	})

	it('allows safe node commands', async () => {
		const context = createContext({
			commandAllowlist: ['node'],
			commandArgPolicy: {
				disallow: [{ command: 'node', argsPrefix: ['-e', '--eval'] }]
			}
		})

		const result = await terminalRunTool.execute({ command: 'node', args: ['index.js'] }, context)

		expect(result.success).toBe(true)
	})

	it('requires approval for npx commands', async () => {
		const context = createContext({
			autoApprove: false,
			commandAllowlist: ['npx'],
			commandArgPolicy: {
				requireApproval: [{ command: 'npx' }]
			}
		})

		const result = await terminalRunTool.execute({ command: 'npx', args: ['cowsay', 'hello'] }, context)

		expect(result.success).toBe(false)
		expect(result.requiresApproval).toBe(true)
	})

	it('auto-approves npx when autoApprove is true', async () => {
		const context = createContext({
			autoApprove: true,
			commandAllowlist: ['npx'],
			commandArgPolicy: {
				requireApproval: [{ command: 'npx' }]
			}
		})

		const result = await terminalRunTool.execute({ command: 'npx', args: ['cowsay', 'hello'] }, context)

		expect(result.success).toBe(true)
	})
})

describe('Policy Integration: Apply Changes Atomicity', () => {
	it('rejects entire changeset if any path is denied', async () => {
		const provider = createMockProvider()
		const context = createContext({}, provider)

		const changes: FileChange[] = [
			{ type: 'create', path: '/src/new.ts', content: 'safe' },
			{ type: 'create', path: '/.env.production', content: 'SECRET=value' },
			{ type: 'create', path: '/src/another.ts', content: 'also safe' }
		]

		const result = await applyChangesTool.execute({ changes }, context)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('POLICY_VIOLATION')

		// Verify no files were written (provider.writeFile not called)
		expect(provider.writeFile).not.toHaveBeenCalled()
	})

	it('applies all changes when none are denied', async () => {
		const provider = createMockProvider()
		const context = createContext({}, provider)

		const changes: FileChange[] = [
			{ type: 'create', path: '/src/a.ts', content: 'a' },
			{ type: 'create', path: '/src/b.ts', content: 'b' },
			{ type: 'create', path: '/src/c.ts', content: 'c' }
		]

		const result = await applyChangesTool.execute({ changes }, context)

		expect(result.success).toBe(true)
		expect(result.data?.appliedPaths).toHaveLength(3)
		expect(provider.writeFile).toHaveBeenCalledTimes(3)
	})
})

describe('Policy Integration: Empty/Permissive Policies', () => {
	it('allows all paths when denyPaths is empty', async () => {
		const provider = createMockProvider()
		const context = createContext({ denyPaths: [] }, provider)

		// Should be able to read .env when no deny paths
		const result = await fsReadTool.execute({ path: '/.env' }, context)
		expect(result.success).toBe(true)
		expect(result.data?.content).toBe('API_KEY=secret123')
	})

	it('denies all commands when commandAllowlist is empty', async () => {
		const context = createContext({ commandAllowlist: [] })

		const result = await terminalRunTool.execute({ command: 'npm', args: ['install'] }, context)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('COMMAND_DENIED')
	})
})

describe('Policy Integration: Case Sensitivity', () => {
	it('matches deny paths case-insensitively', async () => {
		const context = createContext()

		// Try uppercase variant
		const result = await fsReadTool.execute({ path: '/.ENV' }, context)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('POLICY_VIOLATION')
	})
})
