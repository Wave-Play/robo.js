/**
 * Skills System Tests
 *
 * Tests for tool detection, skill targets, manifest I/O, install/remove logic.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

// We need to mock modules before importing the code under test
let tmpDir: string

const logger = {
	debug: jest.fn(),
	log: jest.fn(),
	flush: jest.fn(async () => {}),
	fork: jest.fn()
}
// logger itself is callable
const loggerCallable = Object.assign(jest.fn(), logger)

jest.unstable_mockModule('../../src/core/logger.js', () => ({
	logger: loggerCallable
}))

jest.unstable_mockModule('../../src/core/color.js', () => ({
	color: {
		bold: (v: string) => v,
		dim: (v: string) => v
	}
}))

jest.unstable_mockModule('../../src/core/constants.js', () => ({
	Indent: '  ',
	Highlight: (v: string) => v,
	HighlightGreen: (v: string) => v
}))

jest.unstable_mockModule('../../src/core/config.js', () => ({
	loadConfig: jest.fn(async () => ({ plugins: [] }))
}))

jest.unstable_mockModule('../../src/cli/utils/utils.js', () => ({
	PackageDir: '/fake/package/dir',
	copyDir: jest.fn(async (src: string, dest: string) => {
		await fs.mkdir(dest, { recursive: true })
		const entries = await fs.readdir(src, { withFileTypes: true })
		for (const entry of entries) {
			const srcPath = path.join(src, entry.name)
			const destPath = path.join(dest, entry.name)
			if (entry.isDirectory()) {
				await fs.cp(srcPath, destPath, { recursive: true })
			} else {
				await fs.copyFile(srcPath, destPath)
			}
		}
	})
}))

// Lazy-loaded module reference
type SkillsModule = typeof import('../../src/cli/utils/skills.js')
let skills: SkillsModule

beforeEach(async () => {
	tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'robo-skills-test-'))
	jest.spyOn(process, 'cwd').mockReturnValue(tmpDir)
	delete process.env.ROBO_SKILL_TARGETS
	skills = await import('../../src/cli/utils/skills.js')
})

afterEach(async () => {
	jest.restoreAllMocks()
	await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('detectCodingTools', () => {
	it('detects Claude Code from .claude/ directory', async () => {
		await fs.mkdir(path.join(tmpDir, '.claude'), { recursive: true })
		const { tools, dirs } = skills.detectCodingTools()
		expect(tools).toContain('Claude Code')
		expect(dirs).toContain('.claude/skills')
	})

	it('detects Claude Code from CLAUDE.md file', async () => {
		await fs.writeFile(path.join(tmpDir, 'CLAUDE.md'), '# Claude')
		const { tools, dirs } = skills.detectCodingTools()
		expect(tools).toContain('Claude Code')
		expect(dirs).toContain('.claude/skills')
	})

	it('detects Cursor from .cursor/ directory → .agents/skills', async () => {
		await fs.mkdir(path.join(tmpDir, '.cursor'), { recursive: true })
		const { tools, dirs } = skills.detectCodingTools()
		expect(tools).toContain('Cursor')
		expect(dirs).toContain('.agents/skills')
	})

	it('detects Windsurf from .windsurf/ directory', async () => {
		await fs.mkdir(path.join(tmpDir, '.windsurf'), { recursive: true })
		const { tools, dirs } = skills.detectCodingTools()
		expect(tools).toContain('Windsurf')
		expect(dirs).toContain('.windsurf/skills')
	})

	it('detects multiple tools and deduplicates dirs', async () => {
		await fs.mkdir(path.join(tmpDir, '.claude'), { recursive: true })
		await fs.mkdir(path.join(tmpDir, '.cursor'), { recursive: true })
		await fs.mkdir(path.join(tmpDir, '.codex'), { recursive: true })
		const { tools, dirs } = skills.detectCodingTools()
		expect(tools).toContain('Claude Code')
		expect(tools).toContain('Cursor')
		expect(tools).toContain('Codex CLI')
		// Cursor and Codex both map to .agents/skills — should be deduplicated
		const agentsDirs = dirs.filter((d) => d === '.agents/skills')
		expect(agentsDirs).toHaveLength(1)
	})

	it('returns empty when no markers found', () => {
		const { tools, dirs } = skills.detectCodingTools()
		expect(tools).toHaveLength(0)
		expect(dirs).toHaveLength(0)
	})
})

describe('getSkillTargets', () => {
	it('returns auto-detected targets when markers exist', async () => {
		await fs.mkdir(path.join(tmpDir, '.claude'), { recursive: true })
		const targets = await skills.getSkillTargets()
		expect(targets).not.toBeNull()
		expect(targets).toHaveLength(1)
		expect(targets![0]).toBe(path.join(tmpDir, '.claude/skills'))
	})

	it('returns saved targets from manifest when present', async () => {
		await skills.writeManifest({
			version: 1,
			targets: ['.claude/skills', '.agents/skills'],
			installed: {}
		})
		const targets = await skills.getSkillTargets()
		expect(targets).toHaveLength(2)
		expect(targets![0]).toBe(path.join(tmpDir, '.claude/skills'))
		expect(targets![1]).toBe(path.join(tmpDir, '.agents/skills'))
	})

	it('respects ROBO_SKILL_TARGETS env var', async () => {
		process.env.ROBO_SKILL_TARGETS = '.custom/skills'
		const targets = await skills.getSkillTargets()
		expect(targets).toHaveLength(1)
		expect(targets![0]).toBe(path.join(tmpDir, '.custom/skills'))
	})

	it('returns empty array for ROBO_SKILL_TARGETS=none', async () => {
		process.env.ROBO_SKILL_TARGETS = 'none'
		const targets = await skills.getSkillTargets()
		expect(targets).toEqual([])
	})

	it('returns null when nothing detected and no saved targets', async () => {
		const targets = await skills.getSkillTargets()
		expect(targets).toBeNull()
	})
})

describe('Manifest migration', () => {
	it('readManifest reads from new location (.robo/.robo-skills.json)', async () => {
		const newPath = path.join(tmpDir, '.robo', '.robo-skills.json')
		await fs.mkdir(path.dirname(newPath), { recursive: true })
		await fs.writeFile(
			newPath,
			JSON.stringify({ version: 1, installed: { 'test-skill': { plugin: 'test-plugin', installedAt: '2024-01-01', files: [] } } })
		)
		const manifest = await skills.readManifest()
		expect(manifest.installed['test-skill']).toBeDefined()
		expect(manifest.installed['test-skill'].plugin).toBe('test-plugin')
	})

	it('readManifest falls back to legacy location (.claude/skills/.robo-skills.json)', async () => {
		const legacyPath = path.join(tmpDir, '.claude', 'skills', '.robo-skills.json')
		await fs.mkdir(path.dirname(legacyPath), { recursive: true })
		await fs.writeFile(
			legacyPath,
			JSON.stringify({ version: 1, installed: { 'legacy-skill': { plugin: 'legacy-plugin', installedAt: '2024-01-01', files: [] } } })
		)
		const manifest = await skills.readManifest()
		expect(manifest.installed['legacy-skill']).toBeDefined()
		expect(manifest.installed['legacy-skill'].plugin).toBe('legacy-plugin')
	})

	it('writeManifest writes to new location and cleans up legacy', async () => {
		// Create legacy manifest first
		const legacyPath = path.join(tmpDir, '.claude', 'skills', '.robo-skills.json')
		await fs.mkdir(path.dirname(legacyPath), { recursive: true })
		await fs.writeFile(legacyPath, JSON.stringify({ version: 1, installed: {} }))

		// Write to new location
		await skills.writeManifest({
			version: 1,
			installed: { 'new-skill': { plugin: 'new-plugin', installedAt: '2024-01-01', files: [] } }
		})

		// New location should exist
		const newPath = path.join(tmpDir, '.robo', '.robo-skills.json')
		const newContent = JSON.parse(await fs.readFile(newPath, 'utf-8'))
		expect(newContent.installed['new-skill']).toBeDefined()

		// Legacy should be cleaned up
		let legacyExists = true
		try {
			await fs.access(legacyPath)
		} catch {
			legacyExists = false
		}
		expect(legacyExists).toBe(false)
	})
})

describe('installSkills', () => {
	let skillSourceDir: string

	beforeEach(async () => {
		skillSourceDir = path.join(tmpDir, '_source', 'my-skill')
		await fs.mkdir(skillSourceDir, { recursive: true })
		await fs.writeFile(path.join(skillSourceDir, 'SKILL.md'), '---\ndescription: Test skill\n---\n# Test')
	})

	it('copies skills to all provided target directories', async () => {
		const target1 = path.join(tmpDir, '.claude', 'skills')
		const target2 = path.join(tmpDir, '.agents', 'skills')

		const { installed } = await skills.installSkills(
			[{ name: 'my-skill', description: 'Test', plugin: 'test-plugin', sourcePath: skillSourceDir, files: ['SKILL.md'] }],
			'test-plugin',
			{ targets: [target1, target2] }
		)

		expect(installed).toEqual(['my-skill'])

		// Verify files exist in both targets
		const file1 = await fs.readFile(path.join(target1, 'my-skill', 'SKILL.md'), 'utf-8')
		expect(file1).toContain('Test skill')
		const file2 = await fs.readFile(path.join(target2, 'my-skill', 'SKILL.md'), 'utf-8')
		expect(file2).toContain('Test skill')
	})

	it('collision detection skips if different plugin', async () => {
		const target = path.join(tmpDir, '.claude', 'skills')

		await skills.writeManifest({
			version: 1,
			installed: { 'my-skill': { plugin: 'other-plugin', installedAt: '2024-01-01', files: [] } }
		})

		const { installed, skipped } = await skills.installSkills(
			[{ name: 'my-skill', description: 'Test', plugin: 'test-plugin', sourcePath: skillSourceDir, files: ['SKILL.md'] }],
			'test-plugin',
			{ targets: [target] }
		)

		expect(installed).toEqual([])
		expect(skipped).toEqual(['my-skill'])
	})

	it('force overrides collision', async () => {
		const target = path.join(tmpDir, '.claude', 'skills')

		await skills.writeManifest({
			version: 1,
			installed: { 'my-skill': { plugin: 'other-plugin', installedAt: '2024-01-01', files: [] } }
		})

		const { installed, skipped } = await skills.installSkills(
			[{ name: 'my-skill', description: 'Test', plugin: 'test-plugin', sourcePath: skillSourceDir, files: ['SKILL.md'] }],
			'test-plugin',
			{ force: true, targets: [target] }
		)

		expect(installed).toEqual(['my-skill'])
		expect(skipped).toEqual([])
	})

	it('records pluginVersion in manifest', async () => {
		const target = path.join(tmpDir, '.claude', 'skills')

		await skills.installSkills(
			[{ name: 'my-skill', description: 'Test', plugin: 'test-plugin', sourcePath: skillSourceDir, files: ['SKILL.md'] }],
			'test-plugin',
			{ pluginVersion: '1.2.3', targets: [target] }
		)

		const manifest = await skills.readManifest()
		expect(manifest.installed['my-skill'].pluginVersion).toBe('1.2.3')
	})
})

describe('removeSkillsByPlugin', () => {
	it('removes from all target directories', async () => {
		const target1 = path.join(tmpDir, '.claude', 'skills')
		const target2 = path.join(tmpDir, '.agents', 'skills')

		// Create skill dirs in both targets
		await fs.mkdir(path.join(target1, 'my-skill'), { recursive: true })
		await fs.writeFile(path.join(target1, 'my-skill', 'SKILL.md'), 'test')
		await fs.mkdir(path.join(target2, 'my-skill'), { recursive: true })
		await fs.writeFile(path.join(target2, 'my-skill', 'SKILL.md'), 'test')

		// Set up manifest with targets
		await skills.writeManifest({
			version: 1,
			targets: ['.claude/skills', '.agents/skills'],
			installed: { 'my-skill': { plugin: 'test-plugin', installedAt: '2024-01-01', files: ['my-skill/SKILL.md'] } }
		})

		const removed = await skills.removeSkillsByPlugin('test-plugin')
		expect(removed).toEqual(['my-skill'])

		// Verify directories are gone
		let exists1 = true
		try {
			await fs.access(path.join(target1, 'my-skill'))
		} catch {
			exists1 = false
		}
		expect(exists1).toBe(false)

		let exists2 = true
		try {
			await fs.access(path.join(target2, 'my-skill'))
		} catch {
			exists2 = false
		}
		expect(exists2).toBe(false)
	})

	it('handles missing directories gracefully', async () => {
		await skills.writeManifest({
			version: 1,
			targets: ['.claude/skills'],
			installed: { 'gone-skill': { plugin: 'test-plugin', installedAt: '2024-01-01', files: [] } }
		})

		const removed = await skills.removeSkillsByPlugin('test-plugin')
		expect(removed).toEqual(['gone-skill'])

		const manifest = await skills.readManifest()
		expect(manifest.installed['gone-skill']).toBeUndefined()
	})
})

describe('saveTargets', () => {
	it('saves targets as relative paths in manifest', async () => {
		await skills.saveTargets([path.join(tmpDir, '.claude', 'skills'), path.join(tmpDir, '.agents', 'skills')])

		const manifest = await skills.readManifest()
		expect(manifest.targets).toEqual(['.claude/skills', '.agents/skills'])
	})
})
