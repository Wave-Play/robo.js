/**
 * Shared logic for managing AI coding skills shipped by plugins.
 *
 * Skills live in a plugin's `skills/` directory (each skill is a subdirectory containing
 * a `SKILL.md` file). When a plugin is installed via `robo add`, discovered skills are
 * offered to the user and, on consent, copied into the detected coding tool's skills directory.
 *
 * A manifest (`.robo/.robo-skills.json`) tracks which skills were installed, from which
 * plugin, and at which version so that `robo remove` can clean them up.
 */

import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { Indent } from '../../core/constants.js'
import { color } from '../../core/color.js'
import { PackageDir, copyDir } from './utils.js'
import { loadConfig } from '../../core/config.js'
import { logger } from '../../core/logger.js'

// ── Types ────────────────────────────────────────────────────────────────

export interface SkillsManifest {
	version: 1
	targets?: string[] // relative paths, saved from user prompt or auto-detect
	installed: Record<string, SkillRecord>
}

export interface SkillRecord {
	plugin: string
	pluginVersion?: string
	installedAt: string
	files: string[] // paths relative to skill target dir
}

export interface DiscoveredSkill {
	name: string // dir name (e.g., "robo-discordjs")
	description: string // parsed from SKILL.md frontmatter
	plugin: string // source plugin name
	sourcePath: string // absolute path to skill dir in plugin
	files: string[] // relative file paths within the skill dir
}

// ── Tool Detection ──────────────────────────────────────────────────────

interface CodingTool {
	name: string
	skillsDir: string // relative to project root
}

const TOOL_MARKERS: Array<{ markers: string[]; tool: CodingTool }> = [
	{
		markers: ['.claude', 'CLAUDE.md'],
		tool: { name: 'Claude Code', skillsDir: '.claude/skills' }
	},
	{
		markers: ['.github/copilot-instructions.md', '.github/skills'],
		tool: { name: 'GitHub Copilot', skillsDir: '.github/skills' }
	},
	{
		markers: ['.cursor', '.cursorrules'],
		tool: { name: 'Cursor', skillsDir: '.agents/skills' }
	},
	{
		markers: ['.windsurf', '.windsurfrules'],
		tool: { name: 'Windsurf', skillsDir: '.windsurf/skills' }
	},
	{
		markers: ['.codex'],
		tool: { name: 'Codex CLI', skillsDir: '.agents/skills' }
	},
	{
		markers: ['.gemini', 'GEMINI.md'],
		tool: { name: 'Gemini CLI', skillsDir: '.agents/skills' }
	}
]

export const TOOL_CHOICES = [
	{ label: 'Claude Code', dir: '.claude/skills' },
	{ label: 'GitHub Copilot', dir: '.github/skills' },
	{ label: 'Cursor / Codex / Gemini', dir: '.agents/skills' },
	{ label: 'Windsurf', dir: '.windsurf/skills' }
]

/**
 * Detect which AI coding tools are in use by checking for marker files/dirs.
 * Returns deduplicated list of skills directory paths (relative).
 */
export function detectCodingTools(): { tools: string[]; dirs: string[] } {
	const cwd = process.cwd()
	const detectedTools: string[] = []
	const detectedDirs = new Set<string>()

	for (const { markers, tool } of TOOL_MARKERS) {
		const found = markers.some((m) => existsSync(path.join(cwd, m)))
		if (found) {
			detectedTools.push(tool.name)
			detectedDirs.add(tool.skillsDir)
		}
	}

	return { tools: detectedTools, dirs: [...detectedDirs] }
}

/**
 * Resolve skill installation targets.
 *
 * Priority:
 * 1. ROBO_SKILL_TARGETS env var (comma-separated, 'none' to disable)
 * 2. Saved targets from manifest (from prior user prompt)
 * 3. Auto-detected from project markers
 * 4. null — caller must prompt the user
 */
export async function getSkillTargets(): Promise<string[] | null> {
	const cwd = process.cwd()

	// 1. Env var override
	const envTargets = process.env.ROBO_SKILL_TARGETS
	if (envTargets !== undefined) {
		if (envTargets === 'none' || envTargets.trim() === '') return []
		return envTargets
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean)
			.map((t) => path.join(cwd, t))
	}

	// 2. Check manifest for saved targets
	const manifest = await readManifest()
	if (manifest.targets && manifest.targets.length > 0) {
		return manifest.targets.map((t) => path.join(cwd, t))
	}

	// 3. Auto-detect from project markers
	const { dirs } = detectCodingTools()
	if (dirs.length > 0) {
		return dirs.map((d) => path.join(cwd, d))
	}

	// 4. No tool detected — caller must prompt
	return null
}

/**
 * Save resolved skill targets into the manifest for future runs.
 */
export async function saveTargets(targets: string[]): Promise<void> {
	const manifest = await readManifest()
	const cwd = process.cwd()
	manifest.targets = targets.map((t) => (path.isAbsolute(t) ? path.relative(cwd, t) : t))
	await writeManifest(manifest)
}

/**
 * Prompt user to select which coding tool(s) they use.
 * Returns selected skill directory paths (relative).
 */
export async function promptForCodingTools(): Promise<string[]> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
	const ask = (q: string) => new Promise<string>((r) => rl.question(q, r))

	logger.log('')
	logger.log(Indent, color.bold('Which AI coding tool(s) do you use?'))
	logger.log('')

	for (let i = 0; i < TOOL_CHOICES.length; i++) {
		logger.log(`${Indent}    ${i + 1}. ${TOOL_CHOICES[i].label}`)
	}

	logger.log('')
	await logger.flush()
	const response = await ask(Indent + `    Enter numbers (e.g. 1,3) or press Enter for all: `)
	rl.close()

	if (!response.trim()) {
		// Default: all unique directories
		return [...new Set(TOOL_CHOICES.map((c) => c.dir))]
	}

	const indices = response.split(',').map((s) => parseInt(s.trim(), 10) - 1)
	const selected = new Set<string>()
	for (const i of indices) {
		if (i >= 0 && i < TOOL_CHOICES.length) {
			selected.add(TOOL_CHOICES[i].dir)
		}
	}

	return selected.size > 0 ? [...selected] : [...new Set(TOOL_CHOICES.map((c) => c.dir))]
}

// ── Path helpers ─────────────────────────────────────────────────────────

export function getManifestPath(): string {
	return path.join(process.cwd(), '.robo', '.robo-skills.json')
}

function getLegacyManifestPath(): string {
	return path.join(process.cwd(), '.claude', 'skills', '.robo-skills.json')
}

// ── Manifest I/O ─────────────────────────────────────────────────────────

export async function readManifest(): Promise<SkillsManifest> {
	try {
		const raw = await fs.readFile(getManifestPath(), 'utf-8')
		return JSON.parse(raw) as SkillsManifest
	} catch {
		/* not found */
	}

	try {
		const raw = await fs.readFile(getLegacyManifestPath(), 'utf-8')
		return JSON.parse(raw) as SkillsManifest
	} catch {
		/* not found */
	}

	return { version: 1, installed: {} }
}

export async function writeManifest(manifest: SkillsManifest): Promise<void> {
	const manifestPath = getManifestPath()
	await fs.mkdir(path.dirname(manifestPath), { recursive: true })
	await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

	// Best-effort cleanup of legacy manifest
	try {
		await fs.rm(getLegacyManifestPath(), { force: true })
	} catch {
		/* ignore */
	}
}

// ── Plugin path resolution ───────────────────────────────────────────────

/**
 * Resolves the `skills/` directory inside a plugin package.
 *
 * For `robo.js` (the core package) we look relative to `PackageDir` (the
 * dist root of the running CLI). For everything else we check the sibling
 * package path and then `node_modules`.
 */
export function getPluginSkillsDir(pluginName: string): string | null {
	const candidates: string[] = []

	if (pluginName === 'robo.js') {
		// Core package – skills sit next to dist/
		candidates.push(path.join(PackageDir, 'skills'))
	} else {
		candidates.push(path.resolve(PackageDir, '..', pluginName, 'skills'))
		candidates.push(path.resolve(process.cwd(), 'node_modules', pluginName, 'skills'))
	}

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate
		}
	}

	return null
}

// ── Scanning ─────────────────────────────────────────────────────────────

/**
 * Parse the `description` field from YAML frontmatter in a SKILL.md file.
 * Keeps it simple — no YAML parser dependency.
 */
function parseFrontmatterDescription(content: string): string {
	const match = content.match(/^---\s*\n([\s\S]*?)\n---/)

	if (!match) {
		return ''
	}

	const frontmatter = match[1]
	const descLine = frontmatter.match(/^description:\s*["']?(.*?)["']?\s*$/m)
	return descLine?.[1] ?? ''
}

/**
 * Recursively list all files inside a directory, returning paths relative to `base`.
 */
async function listFiles(dir: string, base: string): Promise<string[]> {
	const result: string[] = []
	const entries = await fs.readdir(dir, { withFileTypes: true })

	for (const entry of entries) {
		const full = path.join(dir, entry.name)

		if (entry.isDirectory()) {
			result.push(...(await listFiles(full, base)))
		} else {
			result.push(path.relative(base, full))
		}
	}

	return result
}

/**
 * Scan a single plugin for skills (skills / * / SKILL.md).
 */
export async function scanPluginSkills(pluginName: string): Promise<DiscoveredSkill[]> {
	const skillsDir = getPluginSkillsDir(pluginName)

	if (!skillsDir) {
		return []
	}

	let entries: string[]

	try {
		entries = await fs.readdir(skillsDir)
	} catch {
		return []
	}

	const skills: DiscoveredSkill[] = []

	for (const entry of entries) {
		const skillDir = path.join(skillsDir, entry)
		const skillMd = path.join(skillDir, 'SKILL.md')

		try {
			const stat = await fs.stat(skillDir)

			if (!stat.isDirectory()) {
				continue
			}

			if (!existsSync(skillMd)) {
				continue
			}

			const content = await fs.readFile(skillMd, 'utf-8')
			const description = parseFrontmatterDescription(content)
			const files = await listFiles(skillDir, skillDir)

			skills.push({
				name: entry,
				description,
				plugin: pluginName,
				sourcePath: skillDir,
				files
			})
		} catch {
			// Skip unreadable entries
		}
	}

	return skills
}

/**
 * Scan all registered plugins (plus `robo.js` core) for skills.
 */
export async function scanAllPluginSkills(): Promise<Map<string, DiscoveredSkill[]>> {
	const result = new Map<string, DiscoveredSkill[]>()

	// Always scan core
	const coreSkills = await scanPluginSkills('robo.js')

	if (coreSkills.length > 0) {
		result.set('robo.js', coreSkills)
	}

	// Scan registered plugins
	try {
		const config = await loadConfig('robo', true)
		const plugins = config?.plugins ?? []

		for (const plugin of plugins) {
			const name = Array.isArray(plugin) ? plugin[0] : plugin
			const skills = await scanPluginSkills(name)

			if (skills.length > 0) {
				result.set(name, skills)
			}
		}
	} catch (error) {
		logger.debug('Could not load config for skill scanning:', error)
	}

	return result
}

// ── Install / Remove ─────────────────────────────────────────────────────

export interface InstallOptions {
	force?: boolean
	pluginVersion?: string
	targets?: string[]
}

/**
 * Copy skill directories into all target skill directories and update the manifest.
 */
export async function installSkills(
	skills: DiscoveredSkill[],
	pluginName: string,
	options?: InstallOptions
): Promise<{ installed: string[]; skipped: string[] }> {
	const targets = options?.targets ?? (await getSkillTargets()) ?? []
	const manifest = await readManifest()
	const installed: string[] = []
	const skipped: string[] = []

	// Refuse to record manifest entries when there are no targets to copy to
	if (targets.length === 0) {
		logger.debug('No skill targets resolved — skipping install for ' + pluginName)
		return { installed, skipped }
	}

	for (const skill of skills) {
		const existing = manifest.installed[skill.name]

		// Collision check — skip if owned by a different plugin unless forced
		if (existing && existing.plugin !== pluginName && !options?.force) {
			logger.debug('Skill "' + skill.name + '" already installed from ' + existing.plugin + ', skipping')
			skipped.push(skill.name)
			continue
		}

		for (const target of targets) {
			await copyDir(skill.sourcePath, path.join(target, skill.name), [], [])
		}

		manifest.installed[skill.name] = {
			plugin: pluginName,
			pluginVersion: options?.pluginVersion,
			installedAt: new Date().toISOString(),
			files: skill.files.map((f) => path.join(skill.name, f))
		}

		installed.push(skill.name)
	}

	await writeManifest(manifest)
	return { installed, skipped }
}

/**
 * Remove all skills belonging to a plugin from all target directories and update the manifest.
 */
export async function removeSkillsByPlugin(pluginName: string): Promise<string[]> {
	const targets = (await getSkillTargets()) ?? []
	const manifest = await readManifest()
	const removed: string[] = []

	if (targets.length === 0) {
		logger.debug('No skill targets resolved — manifest entries will be removed but files may remain on disk')
	}

	for (const [skillName, record] of Object.entries(manifest.installed)) {
		if (record.plugin !== pluginName) {
			continue
		}

		for (const target of targets) {
			try {
				await fs.rm(path.join(target, skillName), { recursive: true, force: true })
			} catch {
				// Directory may already be gone
			}
		}

		delete manifest.installed[skillName]
		removed.push(skillName)
	}

	await writeManifest(manifest)
	return removed
}

/**
 * Returns the currently installed skills from the manifest.
 */
export async function getInstalledSkills(): Promise<Record<string, SkillRecord>> {
	const manifest = await readManifest()
	return manifest.installed
}
