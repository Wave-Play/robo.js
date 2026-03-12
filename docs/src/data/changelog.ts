import data from './changelog-data.json'

export interface ChangeEntry {
	hash: string
	type: string
	scope: string | null
	message: string
	breaking: boolean
}

export interface PackageRelease {
	name: string
	displayName: string
	slug: string
	version: string
	impact: 'major' | 'minor' | 'patch'
	changes: ChangeEntry[]
}

export interface Release {
	date: string
	packages: PackageRelease[]
}

export interface ChangelogData {
	generatedAt: string
	packages: { name: string; slug: string; displayName: string }[]
	releases: Release[]
}

export const changelog = data as ChangelogData
