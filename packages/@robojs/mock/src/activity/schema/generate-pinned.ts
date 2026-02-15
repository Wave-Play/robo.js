/**
 * Pinned Manifest Generator
 *
 * Developer tool for regenerating the pinned RPC manifest from the installed
 * @discord/embedded-app-sdk package.
 *
 * Usage:
 *   npx tsx src/activity/schema/generate-pinned.ts
 *
 * Requires @discord/embedded-app-sdk to be installed (e.g., as a devDependency).
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { extractManifest } from './extractor.js'
import type { RpcManifest } from './manifest-types.js'

const PINNED_DIR = resolve(import.meta.dirname, 'pinned')

function main(): void {
	console.log('Extracting RPC manifest from installed @discord/embedded-app-sdk...')

	let manifest: RpcManifest
	try {
		manifest = extractManifest(process.cwd())
	} catch (error) {
		console.error('Extraction failed:', (error as Error).message)
		process.exit(1)
	}

	// Override source to 'pinned' for the checked-in version
	manifest = { ...manifest, source: 'pinned' }

	const version = manifest.sdk_version
	const versionedPath = resolve(PINNED_DIR, `manifest-${version}.json`)
	const latestPath = resolve(PINNED_DIR, 'latest.json')
	const content = JSON.stringify(manifest, null, 2) + '\n'

	// Write versioned manifest
	writeFileSync(versionedPath, content, 'utf-8')
	console.log(`Wrote: ${versionedPath}`)

	// Write latest.json
	writeFileSync(latestPath, content, 'utf-8')
	console.log(`Wrote: ${latestPath}`)

	console.log(`\nManifest for SDK v${version}:`)
	console.log(`  Commands: ${manifest.commands.length}`)
	console.log(`  Events:   ${manifest.events.length}`)
	console.log(`  Source:   ${manifest.source}`)
}

main()
