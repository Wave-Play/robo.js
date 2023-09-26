import type { Config } from '../src/types/config'
import type { Manifest } from '../src/types/manifest'

declare global {
	const bindings: Bindings
	const color: typeof import('../src/index').color
	const cwd: string
	const exec: typeof import('../src/cli/utils/utils').exec
	const fs: typeof import('node:fs')
	const logger: typeof import('../src/index').logger
	const path: typeof import('node:path')
}

declare const console: Console

export interface Change {
	id: number
	name: string
	description: string
}

export interface CheckResult {
	breaking: Change[]
	suggestions: Change[]
}

export interface Bindings {
	check?: (version: string, config: Config, manifest: Manifest) => Promise<CheckResult> | CheckResult
	execute?: (changes: Change[], config: Config, manifest: Manifest) => Promise<void> | void
}

export default {}
