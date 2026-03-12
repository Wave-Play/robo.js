/**
 * Changelog data generator.
 *
 * Parses CHANGELOG.md files from all packages, fetches publish dates from npm,
 * groups releases by date, and writes structured JSON to src/data/changelog-data.json.
 */
import { ALL_PACKAGES, type PackageEntry } from './reference-registry.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ROOT = path.resolve(__dirname, '..', '..')
const OUTPUT_PATH = path.resolve(__dirname, '..', 'src', 'data', 'changelog-data.json')

// ── Types ──────────────────────────────────────────────────────────────

interface ChangeEntry {
	hash: string
	type: string
	scope: string | null
	message: string
	breaking: boolean
}

interface PackageRelease {
	name: string
	displayName: string
	slug: string
	version: string
	impact: 'major' | 'minor' | 'patch'
	changes: ChangeEntry[]
}

interface Release {
	date: string
	packages: PackageRelease[]
}

interface ChangelogData {
	generatedAt: string
	packages: { name: string; slug: string; displayName: string }[]
	releases: Release[]
}

// ── Changelog Parsing ──────────────────────────────────────────────────

interface ParsedVersion {
	version: string
	impact: 'major' | 'minor' | 'patch'
	changes: ChangeEntry[]
}

function parseChangelog(content: string): ParsedVersion[] {
	const versions: ParsedVersion[] = []
	let current: ParsedVersion | null = null
	let currentImpact: 'major' | 'minor' | 'patch' = 'patch'
	let inDependencyUpdate = false

	for (const line of content.split('\n')) {
		// Version header: ## <version>
		const versionMatch = line.match(/^## (\d+\.\d+\.\d+.*)$/)
		if (versionMatch) {
			if (current && current.changes.length > 0) {
				versions.push(current)
			}
			current = {
				version: versionMatch[1],
				impact: 'patch',
				changes: []
			}
			currentImpact = 'patch'
			inDependencyUpdate = false
			continue
		}

		// Impact section headers
		const sectionMatch = line.match(/^### (Major|Minor|Patch) Changes$/)
		if (sectionMatch && current) {
			const level = sectionMatch[1].toLowerCase() as 'major' | 'minor' | 'patch'
			// Highest impact wins
			if (level === 'major') {
				currentImpact = 'major'
				current.impact = 'major'
			} else if (level === 'minor' && currentImpact !== 'major') {
				currentImpact = 'minor'
				current.impact = 'minor'
			}
			inDependencyUpdate = false
			continue
		}

		if (!current) continue

		// Dependency update lines — skip these
		if (line.match(/^- Updated dependencies/)) {
			inDependencyUpdate = true
			continue
		}

		// Indented dependency entries (part of "Updated dependencies" block)
		if (inDependencyUpdate && line.match(/^\s+-\s+\S+@/)) {
			continue
		}

		// Change entry: - <hash>: <type>(<scope>)(!): <message>
		// Also handles: - <hash>: <type>(!): <message> (no scope)
		// And plain: - <hash>: <message> (no conventional commit prefix)
		const changeMatch = line.match(/^- ([a-f0-9]{7,}): (.+)$/)
		if (changeMatch) {
			inDependencyUpdate = false
			const hash = changeMatch[1].slice(0, 7)
			const rest = changeMatch[2]

			// Try to parse conventional commit format
			const conventionalMatch = rest.match(/^(\w+)(?:\(([^)]*)\))?(!)?: (.+)$/)
			if (conventionalMatch) {
				current.changes.push({
					hash,
					type: conventionalMatch[1],
					scope: conventionalMatch[2] || null,
					message: conventionalMatch[4],
					breaking: conventionalMatch[3] === '!'
				})
			} else {
				// Plain message without conventional commit format
				current.changes.push({
					hash,
					type: 'patch',
					scope: null,
					message: rest,
					breaking: false
				})
			}
			continue
		}

		// Any other non-empty, non-dependency line resets the dependency flag
		if (line.trim()) {
			inDependencyUpdate = false
		}
	}

	// Push last version
	if (current && current.changes.length > 0) {
		versions.push(current)
	}

	return versions
}

// ── npm Registry ───────────────────────────────────────────────────────

interface NpmTimes {
	[version: string]: string
}

async function fetchNpmTimes(packageName: string): Promise<NpmTimes> {
	try {
		const response = await fetch(`https://registry.npmjs.org/${packageName}`)
		if (!response.ok) return {}
		const data = (await response.json()) as { time?: NpmTimes }
		return data.time ?? {}
	} catch {
		console.warn(`  ⚠ Failed to fetch npm times for ${packageName}`)
		return {}
	}
}

// ── Previous Package Names ──────────────────────────────────────────────

/** Packages that were renamed — fetch times from both registries and merge. */
const PREVIOUS_NAMES: Record<string, string> = {
	'robo.js': '@roboplay/robo.js',
	'@robojs/ai': '@roboplay/plugin-ai',
	'@robojs/server': '@roboplay/plugin-api',
	'@robojs/moderation': '@roboplay/plugin-modtools',
	'@robojs/dev': '@roboplay/plugin-devtools',
	'@robojs/sync': '@roboplay/plugin-sync',
}

// ── Path Resolution ────────────────────────────────────────────────────

function getChangelogPath(pkg: PackageEntry): string | null {
	// Derive package directory from entryPoint by stripping /src/*.ts
	const pkgDir = pkg.entryPoint.replace(/\/src\/.*$/, '')
	const changelogPath = path.resolve(ROOT, pkgDir, 'CHANGELOG.md')
	return fs.existsSync(changelogPath) ? changelogPath : null
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
	console.log('Generating changelog data...\n')

	// 1. Collect packages with changelogs
	const packagesWithChangelogs: { pkg: PackageEntry; changelogPath: string }[] = []
	for (const pkg of ALL_PACKAGES) {
		const changelogPath = getChangelogPath(pkg)
		if (changelogPath) {
			packagesWithChangelogs.push({ pkg, changelogPath })
			console.log(`  ✓ Found changelog: ${pkg.name}`)
		} else {
			console.log(`  ✗ No changelog: ${pkg.name}`)
		}
	}

	console.log(`\nParsing ${packagesWithChangelogs.length} changelogs...`)

	// 2. Parse changelogs
	const parsedPackages: { pkg: PackageEntry; versions: ParsedVersion[] }[] = []
	for (const { pkg, changelogPath } of packagesWithChangelogs) {
		const content = fs.readFileSync(changelogPath, 'utf-8')
		const versions = parseChangelog(content)
		if (versions.length > 0) {
			parsedPackages.push({ pkg, versions })
			console.log(`  ✓ ${pkg.name}: ${versions.length} versions`)
		}
	}

	// 3. Fetch npm publish dates in parallel
	console.log('\nFetching publish dates from npm...')
	const npmTimesMap = new Map<string, NpmTimes>()
	const results = await Promise.allSettled(
		parsedPackages.map(async ({ pkg }) => {
			const times = await fetchNpmTimes(pkg.name)
			// Also fetch from previous package name if it was renamed
			const prevName = PREVIOUS_NAMES[pkg.name]
			if (prevName) {
				const prevTimes = await fetchNpmTimes(prevName)
				// Merge old times — don't overwrite newer entries
				for (const [ver, time] of Object.entries(prevTimes)) {
					if (!times[ver]) {
						times[ver] = time
					}
				}
			}
			return { name: pkg.name, times }
		})
	)
	for (const result of results) {
		if (result.status === 'fulfilled') {
			npmTimesMap.set(result.value.name, result.value.times)
			const versionCount = Object.keys(result.value.times).length
			if (versionCount > 0) {
				console.log(`  ✓ ${result.value.name}: ${versionCount} versions`)
			} else {
				console.log(`  ⚠ ${result.value.name}: no npm data`)
			}
		}
	}

	// 4. Group releases by date
	console.log('\nGrouping releases by date...')
	const dateMap = new Map<string, PackageRelease[]>()

	for (const { pkg, versions } of parsedPackages) {
		const times = npmTimesMap.get(pkg.name) ?? {}

		for (const ver of versions) {
			const publishTime = times[ver.version]
			const date = publishTime ? publishTime.split('T')[0] : 'unknown'

			const release: PackageRelease = {
				name: pkg.name,
				displayName: pkg.displayName,
				slug: pkg.slug,
				version: ver.version,
				impact: ver.impact,
				changes: ver.changes
			}

			const existing = dateMap.get(date) ?? []
			// Merge if same package+version already exists (e.g., duplicate headers in CHANGELOG)
			const duplicate = existing.find((r) => r.name === release.name && r.version === release.version)
			if (duplicate) {
				duplicate.changes.push(...release.changes)
			} else {
				existing.push(release)
			}
			dateMap.set(date, existing)
		}
	}

	// Sort releases newest-first, put "unknown" at the end
	const sortedDates = Array.from(dateMap.keys()).sort((a, b) => {
		if (a === 'unknown') return 1
		if (b === 'unknown') return -1
		return b.localeCompare(a)
	})

	const releases: Release[] = sortedDates.map((date) => ({
		date,
		packages: dateMap.get(date)!.sort((a, b) => a.name.localeCompare(b.name))
	}))

	// 5. Build output
	const packageList = parsedPackages.map(({ pkg }) => ({
		name: pkg.name,
		slug: pkg.slug,
		displayName: pkg.displayName
	}))

	const output: ChangelogData = {
		generatedAt: new Date().toISOString(),
		packages: packageList,
		releases
	}

	// 6. Write JSON
	const outputDir = path.dirname(OUTPUT_PATH)
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true })
	}
	fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, '\t'))

	const totalChanges = releases.reduce(
		(sum, r) => sum + r.packages.reduce((s, p) => s + p.changes.length, 0),
		0
	)
	console.log(`\n✓ Generated ${OUTPUT_PATH}`)
	console.log(`  ${packageList.length} packages, ${releases.length} release dates, ${totalChanges} changes`)
}

main().catch((err) => {
	console.error('Failed to generate changelog data:', err)
	process.exit(1)
})
