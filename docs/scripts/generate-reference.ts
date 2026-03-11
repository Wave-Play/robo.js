/**
 * Automated reference documentation generator.
 *
 * Uses TypeDoc + typedoc-plugin-markdown to generate MDX reference docs
 * from TypeScript source for all Robo.js packages.
 */
import { FRAMEWORK, PACKAGES, type PackageEntry } from './reference-registry.js'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ROOT = path.resolve(__dirname, '..', '..')
const DOCS_DIR = path.resolve(__dirname, '..')
const REFERENCE_DIR = path.resolve(__dirname, '..', 'content', 'docs', 'reference')

/** Map of TypeDoc kind directory names to display labels */
const KIND_LABELS: Record<string, string> = {
	classes: 'Classes',
	functions: 'Functions',
	variables: 'Variables',
	interfaces: 'Interfaces',
	'type-aliases': 'Type Aliases',
	enumerations: 'Enumerations',
	components: 'Components'
}

/** Order for kind categories in meta.json */
const KIND_ORDER = ['classes', 'interfaces', 'type-aliases', 'enumerations', 'functions', 'variables', 'components']

// ─── Utilities ───────────────────────────────────────────────

/** Convert PascalCase/camelCase to kebab-case */
function toKebabCase(str: string): string {
	return str
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
		.toLowerCase()
}

/** Recursively rename files in a directory to kebab-case .mdx */
function renameToKebabMdx(dir: string): void {
	if (!fs.existsSync(dir)) {
		return
	}

	// Process directories first (depth-first)
	const entries = fs.readdirSync(dir, { withFileTypes: true })

	for (const entry of entries) {
		if (entry.isDirectory()) {
			const oldPath = path.join(dir, entry.name)
			const kebabDir = toKebabCase(entry.name)
			const newDirPath = path.join(dir, kebabDir)

			if (oldPath !== newDirPath) {
				fs.renameSync(oldPath, newDirPath)
			}

			renameToKebabMdx(newDirPath)
		}
	}

	// Then process files
	const fileEntries = fs.readdirSync(dir, { withFileTypes: true })

	for (const entry of fileEntries) {
		if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdx'))) {
			const oldPath = path.join(dir, entry.name)
			const baseName = entry.name.replace(/\.mdx?$/, '')
			const kebabName = toKebabCase(baseName) + '.mdx'
			const newPath = path.join(dir, kebabName)

			if (oldPath !== newPath) {
				fs.renameSync(oldPath, newPath)
			}
		}
	}
}

/**
 * Clean up generated MDX/MD files:
 * - Remove breadcrumb navigation lines
 * - Add YAML frontmatter with title
 */
function cleanAndAddFrontmatter(dir: string): void {
	if (!fs.existsSync(dir)) return

	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name)

		if (entry.isDirectory()) {
			cleanAndAddFrontmatter(fullPath)
			continue
		}

		if (!entry.name.endsWith('.mdx') && !entry.name.endsWith('.md')) continue

		let content = fs.readFileSync(fullPath, 'utf-8')
		const lines = content.split('\n')
		const cleaned: string[] = []
		let removedBreadcrumb = false

		// Filter out breadcrumb lines (appear in first few lines)
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]

			// Remove breadcrumb navigation lines (contain links to readme)
			if (!removedBreadcrumb && /\]\([^)]*readme[^)]*\)/i.test(line)) {
				removedBreadcrumb = true
				// Also skip blank line after breadcrumb
				if (i + 1 < lines.length && lines[i + 1].trim() === '') {
					i++
				}
				continue
			}

			cleaned.push(line)
		}

		// Remove existing frontmatter if present
		let bodyLines = cleaned
		if (bodyLines[0] === '---') {
			const endIdx = bodyLines.indexOf('---', 1)
			if (endIdx > 0) {
				bodyLines = bodyLines.slice(endIdx + 1)
				// Remove leading blank line
				if (bodyLines[0] === '') bodyLines.shift()
			}
		}

		// Extract title from first # heading
		let title = ''

		for (const line of bodyLines) {
			const match = line.match(/^# (?:Class|Interface|Type [Aa]lias|Function|Variable|Enumeration):?\s*(.+)/)

			if (match) {
				title = match[1].replace(/\\</g, '<').replace(/\\>/g, '>').replace(/`/g, '')
				break
			}
		}

		if (!title) {
			title = entry.name
				.replace(/\.mdx?$/, '')
				.split('-')
				.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
				.join('')
		}

		const frontmatter = `---\ntitle: "${title}"\n---\n\n`
		fs.writeFileSync(fullPath, frontmatter + bodyLines.join('\n'))
	}
}

/**
 * Escape angle brackets in MDX files that aren't inside code blocks, inline code,
 * or HTML anchor tags. TypeDoc generates type syntax like <T>, <boolean> that MDX parses as JSX.
 */
function escapeMdxAngles(dir: string): void {
	if (!fs.existsSync(dir)) return

	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name)

		if (entry.isDirectory()) {
			escapeMdxAngles(fullPath)
			continue
		}

		if (!entry.name.endsWith('.mdx') && !entry.name.endsWith('.md')) continue

		const content = fs.readFileSync(fullPath, 'utf-8')

		// Process line by line, tracking code block and frontmatter state
		const lines = content.split('\n')
		let inCodeBlock = false
		let inFrontmatter = false
		let frontmatterDone = false
		let modified = false

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]

			// Track YAML frontmatter (--- delimiters)
			if (!frontmatterDone && line === '---') {
				if (!inFrontmatter) {
					inFrontmatter = true
				} else {
					inFrontmatter = false
					frontmatterDone = true
				}
				continue
			}

			if (inFrontmatter) continue

			// Track fenced code blocks
			if (/^```/.test(line)) {
				inCodeBlock = !inCodeBlock
				continue
			}

			if (inCodeBlock) continue

			// First, protect HTML anchor tags by replacing them with placeholders
			let processed = line
			const placeholders: string[] = []

			// Replace <a ...>...</a> and self-closing <a .../> with placeholders
			processed = processed.replace(/<a\s[^>]*>|<\/a>/g, (match) => {
				const idx = placeholders.length
				placeholders.push(match)
				return `%%PLACEHOLDER_${idx}%%`
			})

			// Now escape < and > outside of inline code
			let result = ''
			let inInlineCode = false

			for (let j = 0; j < processed.length; j++) {
				const ch = processed[j]

				if (ch === '`') {
					inInlineCode = !inInlineCode
					result += ch
					continue
				}

				if (inInlineCode) {
					result += ch
					continue
				}

				if (ch === '<') {
					// Skip if already escaped (\<)
					if (j > 0 && processed[j - 1] === '\\') {
						result += ch
					} else {
						result += '\\<'
					}
					continue
				}

				if (ch === '>') {
					// Don't escape blockquote markers at line start
					if (/^\s*$/.test(result)) {
						result += ch
					// Skip if already escaped (\>)
					} else if (j > 0 && processed[j - 1] === '\\') {
						result += ch
					} else {
						result += '\\>'
					}
					continue
				}

				// Escape curly braces (MDX treats them as JSX expressions)
				if (ch === '{') {
					if (j > 0 && processed[j - 1] === '\\') {
						result += ch
					} else {
						result += '\\{'
					}
					continue
				}

				if (ch === '}') {
					if (j > 0 && processed[j - 1] === '\\') {
						result += ch
					} else {
						result += '\\}'
					}
					continue
				}

				result += ch
			}

			// Restore placeholders
			for (let p = 0; p < placeholders.length; p++) {
				result = result.replace(`%%PLACEHOLDER_${p}%%`, placeholders[p])
			}

			if (result !== line) {
				lines[i] = result
				modified = true
			}
		}

		if (modified) {
			fs.writeFileSync(fullPath, lines.join('\n'))
		}
	}
}

/** Fix internal markdown links to match kebab-case renamed files */
function fixInternalLinks(dir: string): void {
	if (!fs.existsSync(dir)) {
		return
	}

	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name)

		if (entry.isDirectory()) {
			fixInternalLinks(fullPath)
		} else if (entry.name.endsWith('.mdx')) {
			let content = fs.readFileSync(fullPath, 'utf-8')
			const original = content

			// Fix markdown links: [text](../SomePath.md) → [text](../some-path)
			content = content.replace(/\]\(([^)]*?)\.md(#[^)]*)?\)/g, (_match, linkPath, hash) => {
				const parts = linkPath.split('/')
				const lastPart = parts[parts.length - 1]
				parts[parts.length - 1] = toKebabCase(lastPart)
				return `](${parts.join('/')}${hash || ''})`
			})

			if (content !== original) {
				fs.writeFileSync(fullPath, content)
			}
		}
	}
}

/**
 * Flatten module-based directory structures into kind-based directories.
 * TypeDoc creates module dirs (e.g., index/, core/logger/) for multi-entry packages.
 * We flatten these so all classes end up in classes/, all functions in functions/, etc.
 */
function flattenModuleDirectories(outputDir: string): void {
	const kindDirNames = new Set(KIND_ORDER)
	const entries = fs.readdirSync(outputDir, { withFileTypes: true })

	// Check if there are non-kind directories (module directories)
	const moduleDirs = entries.filter((e) => {
		return e.isDirectory() && !kindDirNames.has(e.name) && e.name !== 'assets' && e.name !== 'modules'
	})

	if (moduleDirs.length === 0) {
		return
	}

	// Recursively collect all .md files from module directories
	const collectFiles = (dir: string): { relativePath: string; absolutePath: string }[] => {
		const results: { relativePath: string; absolutePath: string }[] = []

		if (!fs.existsSync(dir)) return results

		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const fullPath = path.join(dir, entry.name)

			if (entry.isDirectory()) {
				// Check if this is a kind directory
				if (kindDirNames.has(entry.name)) {
					// Collect files from kind directories
					for (const file of fs.readdirSync(fullPath)) {
						const filePath = path.join(fullPath, file)

						if (fs.statSync(filePath).isFile()) {
							results.push({
								relativePath: `${entry.name}/${file}`,
								absolutePath: filePath
							})
						}
					}
				} else {
					// Recurse into subdirectories
					const subResults = collectFiles(fullPath)
					results.push(...subResults)
				}
			} else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
				// Direct .md files in module dirs (readme, etc.)
				if (entry.name !== 'README.md' && entry.name !== 'index.md') {
					results.push({
						relativePath: entry.name,
						absolutePath: fullPath
					})
				}
			}
		}

		return results
	}

	for (const moduleDir of moduleDirs) {
		const modulePath = path.join(outputDir, moduleDir.name)
		const files = collectFiles(modulePath)

		for (const file of files) {
			const destPath = path.join(outputDir, file.relativePath)
			const destDir = path.dirname(destPath)
			fs.mkdirSync(destDir, { recursive: true })

			// Handle naming conflicts by checking if destination exists
			if (fs.existsSync(destPath)) {
				// Skip duplicates — first one wins
				continue
			}

			fs.renameSync(file.absolutePath, destPath)
		}

		// Remove the now-empty module directory
		fs.rmSync(modulePath, { recursive: true, force: true })
	}
}

/** Remove TypeDoc HTML artifacts and generated index files */
function cleanTypeDocArtifacts(dir: string): void {
	const artifacts = ['.nojekyll', 'hierarchy.html', 'index.html', 'README.md', 'README.mdx', 'index.md']

	for (const name of artifacts) {
		const p = path.join(dir, name)

		if (fs.existsSync(p)) {
			fs.unlinkSync(p)
		}
	}

	// Remove assets directory (HTML theme artifacts)
	const assetsDir = path.join(dir, 'assets')

	if (fs.existsSync(assetsDir)) {
		fs.rmSync(assetsDir, { recursive: true })
	}

	// Remove modules directory (TypeDoc HTML artifact)
	const modulesDir = path.join(dir, 'modules')

	if (fs.existsSync(modulesDir)) {
		fs.rmSync(modulesDir, { recursive: true })
	}

	// Recursively remove .html files
	removeHtmlFiles(dir)
}

function removeHtmlFiles(dir: string): void {
	if (!fs.existsSync(dir)) return

	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name)

		if (entry.isDirectory()) {
			removeHtmlFiles(fullPath)
		} else if (entry.name.endsWith('.html')) {
			fs.unlinkSync(fullPath)
		}
	}
}

/** Add all .mdx files from a directory to the pages array */
function addFilesFromDir(pages: string[], dir: string, prefix: string): void {
	if (!fs.existsSync(dir)) {
		return
	}

	const files = fs
		.readdirSync(dir)
		.filter((f) => f.endsWith('.mdx') && f !== 'index.mdx')
		.sort()

	for (const file of files) {
		pages.push(`${prefix}/${file.replace('.mdx', '')}`)
	}
}

/** Scan output directory and build meta.json pages array */
function buildMetaPages(outputDir: string): string[] {
	const pages: string[] = ['index']

	if (!fs.existsSync(outputDir)) {
		return pages
	}

	for (const kind of KIND_ORDER) {
		const kindPath = path.join(outputDir, kind)

		if (fs.existsSync(kindPath) && fs.statSync(kindPath).isDirectory()) {
			const files = fs
				.readdirSync(kindPath)
				.filter((f) => f.endsWith('.mdx'))
				.sort()

			if (files.length > 0) {
				pages.push(`---${KIND_LABELS[kind] || kind}---`)
				addFilesFromDir(pages, kindPath, kind)
			}
		}
	}

	return pages
}

// ─── TypeDoc Runner ──────────────────────────────────────────

function runTypeDoc(pkg: PackageEntry, outputDir: string): boolean {
	console.log(`\n📦 Generating docs for ${pkg.name}...`)

	// Collect entry points
	const entryPoints = [path.resolve(ROOT, pkg.entryPoint)]

	if (pkg.submodules) {
		for (const sub of pkg.submodules) {
			const subPath = path.resolve(ROOT, sub.source)

			if (fs.existsSync(subPath)) {
				entryPoints.push(subPath)
			} else {
				console.warn(`  ⚠ Submodule source not found: ${sub.source}`)
			}
		}
	}

	const tsconfigPath = path.resolve(ROOT, pkg.tsconfig)

	if (!fs.existsSync(tsconfigPath)) {
		console.warn(`  ⚠ tsconfig not found: ${pkg.tsconfig}, skipping`)
		return false
	}

	if (!fs.existsSync(entryPoints[0])) {
		console.warn(`  ⚠ Entry point not found: ${pkg.entryPoint}, skipping`)
		return false
	}

	// Build CLI args
	const args: string[] = [
		'--plugin',
		'typedoc-plugin-markdown',
		'--plugin',
		'typedoc-plugin-frontmatter',
		'--tsconfig',
		tsconfigPath,
		'--out',
		outputDir,
		// TypeDoc core options
		'--skipErrorChecking',
		'--excludeExternals',
		'--excludePrivate',
		'--excludeInternal',
		'--readme',
		'none',
		// typedoc-plugin-markdown options
		'--outputFileStrategy',
		'members',
		'--membersWithOwnFile',
		'Class',
		'--membersWithOwnFile',
		'Interface',
		'--membersWithOwnFile',
		'TypeAlias',
		'--membersWithOwnFile',
		'Function',
		'--membersWithOwnFile',
		'Variable',
		'--membersWithOwnFile',
		'Enum',
		'--useCodeBlocks',
		'true',
		'--parametersFormat',
		'table',
		'--interfacePropertiesFormat',
		'table',
		'--classPropertiesFormat',
		'table',
		'--enumMembersFormat',
		'table',
		'--typeDeclarationFormat',
		'table',
		'--propertyMembersFormat',
		'table',
		'--expandObjects',
		'true',
		'--hidePageHeader',
		'true',
		'--disableSources',
		'true',
		// Entry points
		...entryPoints
	]

	const typedocBin = path.resolve(DOCS_DIR, 'node_modules', '.bin', 'typedoc')

	try {
		execSync(`"${typedocBin}" ${args.map((a) => `"${a}"`).join(' ')}`, {
			cwd: ROOT,
			stdio: 'pipe',
			encoding: 'utf-8'
		})
		console.log(`  ✓ Generated to ${path.relative(ROOT, outputDir)}`)
		return true
	} catch (err: unknown) {
		const execErr = err as { stdout?: string; stderr?: string; status?: number }

		// TypeDoc warnings cause non-zero exit but output is still valid
		if (fs.existsSync(outputDir) && fs.readdirSync(outputDir).length > 0) {
			const hasMarkdown = fs.readdirSync(outputDir).some((f) => f.endsWith('.md') || f.endsWith('.mdx'))

			if (hasMarkdown) {
				console.log(`  ✓ Generated to ${path.relative(ROOT, outputDir)} (with warnings)`)
				return true
			}
		}

		console.warn(`  ⚠ TypeDoc failed for ${pkg.name}`)

		if (execErr.stderr) {
			// Show just the last few lines of stderr
			const lines = execErr.stderr.trim().split('\n')
			const tail = lines.slice(-5).join('\n')
			console.warn(`    ${tail}`)
		}

		return false
	}
}

// ─── Post-Processing ─────────────────────────────────────────

function postProcess(pkg: PackageEntry, outputDir: string): void {
	// Clean HTML artifacts
	cleanTypeDocArtifacts(outputDir)

	// Flatten module directories into kind-based directories
	flattenModuleDirectories(outputDir)

	// Clean breadcrumbs and add frontmatter
	cleanAndAddFrontmatter(outputDir)

	// Rename files to kebab-case .mdx
	renameToKebabMdx(outputDir)

	// Escape angle brackets for MDX compatibility
	escapeMdxAngles(outputDir)

	// Fix internal links
	fixInternalLinks(outputDir)

	// Generate index.mdx for the package
	generatePackageIndex(pkg, outputDir)

	// Generate meta.json
	const pages = buildMetaPages(outputDir)
	const meta: Record<string, unknown> = {
		title: pkg.displayName,
		pages
	}

	if (pkg.slug === 'framework') {
		meta.icon = 'Boxes'
	}

	fs.writeFileSync(path.join(outputDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')
	console.log(`  ✓ Generated meta.json (${pages.length} entries)`)
}

/**
 * Extract a one-sentence description from a generated MDX file.
 * Looks for the first plain-text paragraph after the `# Heading` line,
 * skipping code blocks, tables, and section headings.
 */
function extractDescription(filePath: string): string {
	const content = fs.readFileSync(filePath, 'utf-8')
	const lines = content.split('\n')
	let pastHeading = false
	let inCodeBlock = false
	let inFrontmatter = false
	let frontmatterDone = false

	for (const line of lines) {
		// Skip YAML frontmatter
		if (!frontmatterDone && line === '---') {
			if (!inFrontmatter) {
				inFrontmatter = true
			} else {
				inFrontmatter = false
				frontmatterDone = true
			}
			continue
		}
		if (inFrontmatter) continue

		// Track code blocks
		if (/^```/.test(line)) {
			inCodeBlock = !inCodeBlock
			continue
		}
		if (inCodeBlock) continue

		// Find the main heading
		if (!pastHeading && /^# /.test(line)) {
			pastHeading = true
			continue
		}
		if (!pastHeading) continue

		// Skip blank lines, sub-headings, tables, and HTML
		const trimmed = line.trim()
		if (!trimmed) continue
		if (/^#{2,}/.test(trimmed)) break
		if (/^\|/.test(trimmed)) break
		if (/^</.test(trimmed)) break

		// Found a description paragraph — take the first sentence
		const firstSentence = trimmed.replace(/\s+/g, ' ').split(/\.\s/)[0]
		// Clean up MDX escapes for display
		const cleaned = firstSentence.replace(/\\</g, '<').replace(/\\>/g, '>').replace(/\\{/g, '{').replace(/\\}/g, '}')
		return cleaned.endsWith('.') ? cleaned : cleaned + '.'
	}

	return ''
}

function generatePackageIndex(pkg: PackageEntry, outputDir: string): void {
	const lines: string[] = [
		'---',
		'title: "DIRECTORY"',
		`description: "API reference for ${pkg.name}"`,
		'---',
		'',
		`# ${pkg.displayName}`,
		'',
		`API reference documentation for \`${pkg.name}\`.`,
		''
	]

	for (const kind of KIND_ORDER) {
		const kindPath = path.join(outputDir, kind)

		if (fs.existsSync(kindPath) && fs.statSync(kindPath).isDirectory()) {
			const files = fs
				.readdirSync(kindPath)
				.filter((f) => f.endsWith('.mdx'))
				.sort()

			if (files.length > 0) {
				lines.push(`## ${KIND_LABELS[kind] || kind}`)
				lines.push('')

				for (const file of files) {
					const name = file.replace('.mdx', '')
					const displayName = name
						.split('-')
						.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
						.join('')
					const desc = extractDescription(path.join(kindPath, file))
					if (desc) {
						lines.push(`- [\`${displayName}\`](${kind}/${name}) - ${desc}`)
					} else {
						lines.push(`- [\`${displayName}\`](${kind}/${name})`)
					}
				}

				lines.push('')
			}
		}
	}

	fs.writeFileSync(path.join(outputDir, 'index.mdx'), lines.join('\n'))
}

// ─── Top-Level Generators ────────────────────────────────────

function generateRootMeta(): void {
	const meta = {
		title: 'Reference',
		description: 'Learn about the technical specifics of Robo.js.',
		icon: 'BookText',
		root: true,
		pages: ['!index', '...']
	}

	fs.writeFileSync(path.join(REFERENCE_DIR, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')
}

function generatePackagesMeta(generatedSlugs: string[]): void {
	const packagesDir = path.join(REFERENCE_DIR, 'packages')
	fs.mkdirSync(packagesDir, { recursive: true })

	const meta = {
		title: 'Packages',
		description: 'Reference documentation for Robo.js packages',
		icon: 'Boxes',
		pages: generatedSlugs.sort()
	}

	fs.writeFileSync(path.join(packagesDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')
}

function generateReferenceIndex(): void {
	const lines: string[] = [
		'---',
		'title: "Reference"',
		'description: "Technical reference documentation for Robo.js and its packages"',
		'---',
		'',
		'# Reference Documentation',
		'',
		"Welcome to the Robo.js Reference Documentation. This section provides detailed technical information about Robo.js' core framework and all official packages.",
		'',
		'## Core Framework',
		'',
		'The [framework](/reference/framework) section covers all core components of Robo.js:',
		'',
		'- **Classes** - Object-oriented interfaces like `Env`, `Logger`, and `State`',
		'- **Variables** - Global objects like `Flashcore`, `Mode`, and `Robo`',
		'- **Functions** - Utility functions like `getConfig` and `setState`',
		'- **Interfaces** - TypeScript interfaces for configuration and other objects',
		'- **Type Aliases** - TypeScript types for various Robo.js components',
		'',
		'## Official Packages',
		'',
		'Robo.js comes with several official packages that provide enhanced functionality:',
		'',
		'| Package | Description |',
		'| ------- | ----------- |'
	]

	const descriptions: Record<string, string> = {
		ai: 'AI chatbot with voice, vision, image generation, and token tracking',
		analytics: 'Analytics tracking via Google Analytics, Plausible, and custom engines',
		auth: 'User authentication and authorization with OAuth2 and credentials',
		'better-stack': 'Better Stack (Logtail) log ingestion and heartbeat monitoring',
		cron: 'Scheduled tasks with cron expressions and persisted jobs',
		dev: 'Development utilities for inspecting state, flashcore, and modules',
		giveaways: 'Discord giveaway creation and management',
		i18n: 'Internationalization with locale management and MessageFormat 2.0',
		mock: 'Discord API mock server for testing bots and activities',
		moderation: 'Discord moderation suite with audit, ban, kick, and warn commands',
		patch: 'Patches for Discord activities including proxy and entry point fixes',
		roadmap: 'Project roadmap sync with Jira and Discord forum channels',
		server: 'File-based HTTP server with routing, tunnels, and engine support',
		sync: 'Real-time state synchronization with cursors, drag, and presence',
		trpc: 'tRPC integration for type-safe APIs with React Query support',
		xp: 'Experience points, leveling, leaderboards, and role rewards'
	}

	for (const pkg of PACKAGES) {
		const desc = descriptions[pkg.slug] || ''
		lines.push(`| [\`${pkg.name}\`](/reference/packages/${pkg.slug}) | ${desc} |`)
	}

	lines.push('')

	fs.writeFileSync(path.join(REFERENCE_DIR, 'index.mdx'), lines.join('\n'))
}

// ─── Main ────────────────────────────────────────────────────

function main(): void {
	console.log('🔧 Generating reference documentation...\n')

	// Clean output directories
	const frameworkDir = path.join(REFERENCE_DIR, 'framework')
	const packagesDir = path.join(REFERENCE_DIR, 'packages')

	if (fs.existsSync(frameworkDir)) {
		fs.rmSync(frameworkDir, { recursive: true })
	}

	if (fs.existsSync(packagesDir)) {
		fs.rmSync(packagesDir, { recursive: true })
	}

	fs.mkdirSync(frameworkDir, { recursive: true })
	fs.mkdirSync(packagesDir, { recursive: true })

	// Generate framework docs
	const frameworkSuccess = runTypeDoc(FRAMEWORK, frameworkDir)

	if (frameworkSuccess) {
		postProcess(FRAMEWORK, frameworkDir)
	}

	// Generate package docs
	const generatedSlugs: string[] = []

	for (const pkg of PACKAGES) {
		const outputDir = path.join(packagesDir, pkg.slug)
		fs.mkdirSync(outputDir, { recursive: true })

		const success = runTypeDoc(pkg, outputDir)

		if (success) {
			postProcess(pkg, outputDir)
			generatedSlugs.push(pkg.slug)
		} else {
			fs.rmSync(outputDir, { recursive: true, force: true })
		}
	}

	// Generate top-level files
	generateRootMeta()
	generatePackagesMeta(generatedSlugs)
	generateReferenceIndex()

	// Count output files
	let totalFiles = 0
	const countMdx = (dir: string) => {
		if (!fs.existsSync(dir)) return

		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				countMdx(path.join(dir, entry.name))
			} else if (entry.name.endsWith('.mdx')) {
				totalFiles++
			}
		}
	}

	countMdx(REFERENCE_DIR)

	console.log(`\n✅ Done! Generated ${totalFiles} MDX files across ${generatedSlugs.length + 1} packages.`)
}

main()
