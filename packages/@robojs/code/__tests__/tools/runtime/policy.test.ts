/**
 * Unit tests for policy enforcement
 */

import {
	checkCommandPolicy,
	checkCommandArgPolicy,
	checkFilePolicy,
	checkSnapshotPolicy,
	checkDiffPolicy,
	PolicyValidator
} from '../../../src/tools/runtime/policy.js'
import type { AgentPolicy, CommandArgPolicy } from '../../../src/types/index.js'

// Helper to create a valid policy with defaults
function createPolicy(overrides: Partial<AgentPolicy> = {}): AgentPolicy {
	return {
		autoApprove: false,
		maxIterations: 10,
		commandAllowlist: ['npm', 'node', 'git'],
		denyPaths: ['.env', '.git/'],
		...overrides
	}
}

describe('checkCommandPolicy', () => {
	it('should allow commands in allowlist', () => {
		const policy = createPolicy()
		const result = checkCommandPolicy({ command: 'npm', args: ['install'] }, policy)
		expect(result.allowed).toBe(true)
	})

	it('should deny commands not in allowlist', () => {
		const policy = createPolicy()
		const result = checkCommandPolicy({ command: 'rm', args: ['-rf', '/'] }, policy)
		expect(result.allowed).toBe(false)
		expect(result.reason).toContain('rm')
	})

	it('should allow any command if allowlist is empty', () => {
		const policy = createPolicy({ commandAllowlist: [] })
		const result = checkCommandPolicy({ command: 'anything', args: [] }, policy)
		// Empty list means nothing is allowed
		expect(result.allowed).toBe(false)
	})

	it('should be case-sensitive for command matching', () => {
		const policy = createPolicy({ commandAllowlist: ['npm'] })
		const result = checkCommandPolicy({ command: 'NPM', args: [] }, policy)
		expect(result.allowed).toBe(false)
	})

	it('should check argument policy when defined', () => {
		const policy = createPolicy({
			commandArgPolicy: {
				disallow: [{ command: 'node', argsPrefix: ['-e'] }]
			}
		})
		const result = checkCommandPolicy({ command: 'node', args: ['-e', 'code'] }, policy)
		expect(result.allowed).toBe(false)
	})
})

describe('checkCommandArgPolicy', () => {
	describe('disallow patterns', () => {
		const argPolicy: CommandArgPolicy = {
			disallow: [
				{ command: 'node', argsPrefix: ['-e', '--eval'] },
				{ command: 'rm', argsPrefix: ['-rf'] }
			]
		}

		it('should block disallowed argument prefixes', () => {
			const result = checkCommandArgPolicy('node', ['-e', 'console.log("hi")'], argPolicy)
			expect(result.allowed).toBe(false)
			expect(result.reason).toContain('-e')
		})

		it('should block --eval variant', () => {
			const result = checkCommandArgPolicy('node', ['--eval', 'code'], argPolicy)
			expect(result.allowed).toBe(false)
		})

		it('should allow safe arguments', () => {
			const result = checkCommandArgPolicy('node', ['index.js'], argPolicy)
			expect(result.allowed).toBe(true)
		})

		it('should block combined dangerous flags', () => {
			const result = checkCommandArgPolicy('rm', ['-rf', '/'], argPolicy)
			expect(result.allowed).toBe(false)
		})

		it('should allow commands not in disallow list', () => {
			const result = checkCommandArgPolicy('echo', ['hello'], argPolicy)
			expect(result.allowed).toBe(true)
		})
	})

	describe('requireApproval patterns', () => {
		const argPolicy: CommandArgPolicy = {
			requireApproval: [{ command: 'npx' }, { command: 'npm', argsPrefix: ['run'] }]
		}

		it('should require approval for entire command', () => {
			const result = checkCommandArgPolicy('npx', ['cowsay'], argPolicy)
			expect(result.allowed).toBe(false)
			expect(result.canApprove).toBe(true)
		})

		it('should require approval for specific args', () => {
			const result = checkCommandArgPolicy('npm', ['run', 'build'], argPolicy)
			expect(result.allowed).toBe(false)
			expect(result.canApprove).toBe(true)
		})

		it('should allow npm install without approval', () => {
			const result = checkCommandArgPolicy('npm', ['install'], argPolicy)
			expect(result.allowed).toBe(true)
		})
	})

	it('should allow when no policy defined', () => {
		const result = checkCommandArgPolicy('node', ['-e', 'code'], {})
		expect(result.allowed).toBe(true)
	})

	it('should handle empty args', () => {
		const argPolicy: CommandArgPolicy = {
			disallow: [{ command: 'node', argsPrefix: ['-e'] }]
		}
		const result = checkCommandArgPolicy('node', [], argPolicy)
		expect(result.allowed).toBe(true)
	})
})

describe('checkFilePolicy', () => {
	describe('deny path matching', () => {
		const policy = createPolicy({
			denyPaths: ['.env', '.env.local', '.git/', 'node_modules/', '*.key', '*.pem']
		})

		it('should deny exact matches', () => {
			const result = checkFilePolicy({ path: '/.env', operation: 'read' }, policy)
			expect(result.allowed).toBe(false)
			expect(result.reason).toContain('.env')
		})

		it('should deny directory matches', () => {
			const result = checkFilePolicy({ path: '/.git/config', operation: 'read' }, policy)
			expect(result.allowed).toBe(false)
		})

		it('should deny glob matches', () => {
			const result = checkFilePolicy({ path: '/secrets/private.key', operation: 'read' }, policy)
			expect(result.allowed).toBe(false)
		})

		it('should allow non-matching paths', () => {
			const result = checkFilePolicy({ path: '/src/index.ts', operation: 'read' }, policy)
			expect(result.allowed).toBe(true)
		})
	})

	describe('operation types', () => {
		const policy = createPolicy()

		it('should check read operations', () => {
			const result = checkFilePolicy({ path: '/.env', operation: 'read' }, policy)
			expect(result.allowed).toBe(false)
		})

		it('should check write operations', () => {
			const result = checkFilePolicy({ path: '/.env', operation: 'write' }, policy)
			expect(result.allowed).toBe(false)
		})

		it('should check delete operations', () => {
			const result = checkFilePolicy({ path: '/.git/config', operation: 'delete' }, policy)
			expect(result.allowed).toBe(false)
		})
	})

	describe('edge cases', () => {
		it('should allow with empty deny list', () => {
			const policy = createPolicy({ denyPaths: [] })
			const result = checkFilePolicy({ path: '/.env', operation: 'read' }, policy)
			expect(result.allowed).toBe(true)
		})

		it('should allow with undefined deny list', () => {
			const policy = createPolicy({ denyPaths: undefined })
			const result = checkFilePolicy({ path: '/.env', operation: 'read' }, policy)
			expect(result.allowed).toBe(true)
		})

		it('should match nested files', () => {
			const policy = createPolicy({ denyPaths: ['.env.local'] })
			const result = checkFilePolicy({ path: '/config/.env.local', operation: 'read' }, policy)
			expect(result.allowed).toBe(false)
		})
	})

	describe('size limits', () => {
		it('should enforce maxFileWriteBytes', () => {
			const policy = createPolicy({ maxFileWriteBytes: 1000 })
			const result = checkFilePolicy({ path: '/file.txt', operation: 'write', size: 2000 }, policy)
			expect(result.allowed).toBe(false)
			expect(result.reason).toContain('exceeds')
		})

		it('should allow writes under limit', () => {
			const policy = createPolicy({ maxFileWriteBytes: 1000 })
			const result = checkFilePolicy({ path: '/file.txt', operation: 'write', size: 500 }, policy)
			expect(result.allowed).toBe(true)
		})
	})
})

describe('checkSnapshotPolicy', () => {
	it('should allow snapshots under limit', () => {
		const policy = createPolicy({ maxSnapshotBytes: 1000000 })
		const result = checkSnapshotPolicy(500000, policy)
		expect(result.allowed).toBe(true)
	})

	it('should deny snapshots over limit', () => {
		const policy = createPolicy({ maxSnapshotBytes: 1000000 })
		const result = checkSnapshotPolicy(2000000, policy)
		expect(result.allowed).toBe(false)
		expect(result.reason).toContain('exceeds')
	})

	it('should use default limit if not specified', () => {
		const policy = createPolicy()
		// Default is 2MB
		const result = checkSnapshotPolicy(3000000, policy)
		expect(result.allowed).toBe(false)
	})
})

describe('checkDiffPolicy', () => {
	it('should allow diffs under limit', () => {
		const policy = createPolicy({ maxTotalDiffBytes: 100000 })
		const result = checkDiffPolicy(50000, policy)
		expect(result.allowed).toBe(true)
	})

	it('should deny diffs over limit', () => {
		const policy = createPolicy({ maxTotalDiffBytes: 100000 })
		const result = checkDiffPolicy(200000, policy)
		expect(result.allowed).toBe(false)
	})

	it('should use default limit if not specified', () => {
		const policy = createPolicy()
		// Default is 2MB
		const result = checkDiffPolicy(3000000, policy)
		expect(result.allowed).toBe(false)
	})
})

describe('PolicyValidator', () => {
	const policy = createPolicy({
		commandArgPolicy: {
			disallow: [{ command: 'node', argsPrefix: ['-e', '--eval'] }]
		},
		maxSnapshotBytes: 1000000
	})

	let validator: PolicyValidator

	beforeEach(() => {
		validator = new PolicyValidator(policy, 'test-run-id')
	})

	describe('checkCommand', () => {
		it('should validate both command and args', () => {
			const result = validator.checkCommand('npm', ['install'])
			expect(result.allowed).toBe(true)
		})

		it('should fail if command not in allowlist', () => {
			const result = validator.checkCommand('rm', ['-rf', '/'])
			expect(result.allowed).toBe(false)
		})

		it('should fail if args are blocked', () => {
			const result = validator.checkCommand('node', ['-e', 'code'])
			expect(result.allowed).toBe(false)
		})
	})

	describe('checkFile', () => {
		it('should validate file paths', () => {
			const result = validator.checkFile('/src/index.ts', 'read')
			expect(result.allowed).toBe(true)
		})

		it('should deny restricted paths', () => {
			const result = validator.checkFile('/.env', 'read')
			expect(result.allowed).toBe(false)
		})
	})

	describe('checkSnapshot', () => {
		it('should validate snapshot sizes', () => {
			expect(validator.checkSnapshot(500000).allowed).toBe(true)
			expect(validator.checkSnapshot(2000000).allowed).toBe(false)
		})
	})

	describe('checkDiff', () => {
		it('should validate diff sizes', () => {
			expect(validator.checkDiff(50000).allowed).toBe(true)
			expect(validator.checkDiff(3000000).allowed).toBe(false)
		})
	})

	describe('getDenyPaths', () => {
		it('should return deny paths from policy', () => {
			expect(validator.getDenyPaths()).toContain('.env')
			expect(validator.getDenyPaths()).toContain('.git/')
		})
	})

	describe('isAutoApprove', () => {
		it('should return autoApprove setting', () => {
			expect(validator.isAutoApprove()).toBe(false)

			const approvedValidator = new PolicyValidator(createPolicy({ autoApprove: true }), 'test-run')
			expect(approvedValidator.isAutoApprove()).toBe(true)
		})
	})
})
