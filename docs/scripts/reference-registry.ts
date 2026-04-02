/**
 * Registry of all packages and their entry points for reference doc generation.
 */

export interface SubmoduleEntry {
	/** Submodule import path (e.g., './client', './server') */
	subpath: string
	/** Source file path relative to monorepo root */
	source: string
	/** Display label for sidebar grouping */
	label: string
}

export interface PackageEntry {
	/** npm package name */
	name: string
	/** Directory name used in output (e.g., 'ai', 'server') */
	slug: string
	/** Display name for sidebar */
	displayName: string
	/** Source entry point relative to monorepo root */
	entryPoint: string
	/** Path to tsconfig.json relative to monorepo root */
	tsconfig: string
	/** Submodule entry points */
	submodules?: SubmoduleEntry[]
}

/**
 * The core framework (robo.js) — output goes to reference/framework/
 */
export const FRAMEWORK: PackageEntry = {
	name: 'robo.js',
	slug: 'framework',
	displayName: 'Framework',
	entryPoint: 'packages/robo/src/index.ts',
	tsconfig: 'packages/robo/tsconfig.json',
	submodules: [
		{
			subpath: './flashcore',
			source: 'packages/robo/src/flashcore/index.ts',
			label: 'robo.js/flashcore'
		},
		{
			subpath: './logger',
			source: 'packages/robo/src/core/logger.ts',
			label: 'robo.js/logger'
		},
		{
			subpath: './logger/drains',
			source: 'packages/robo/src/core/drains.ts',
			label: 'robo.js/logger/drains'
		},
		{
			subpath: './hmr',
			source: 'packages/robo/src/core/hmr.ts',
			label: 'robo.js/hmr'
		},
		{
			subpath: './types',
			source: 'packages/robo/src/types/index.ts',
			label: 'robo.js/types'
		},
		{
			subpath: './ipc',
			source: 'packages/robo/src/core/ipc.ts',
			label: 'robo.js/ipc'
		}
	]
}

/**
 * All plugin packages — output goes to reference/packages/<slug>/
 */
export const PACKAGES: PackageEntry[] = [
	{
		name: '@robojs/ai',
		slug: 'ai',
		displayName: '@robojs/ai',
		entryPoint: 'packages/@robojs/ai/src/index.ts',
		tsconfig: 'packages/@robojs/ai/tsconfig.json',
		submodules: [
			{
				subpath: './engines/openai',
				source: 'packages/@robojs/ai/src/engines/openai/index.ts',
				label: '@robojs/ai/engines/openai'
			}
		]
	},
	{
		name: '@robojs/analytics',
		slug: 'analytics',
		displayName: '@robojs/analytics',
		entryPoint: 'packages/@robojs/analytics/src/index.ts',
		tsconfig: 'packages/@robojs/analytics/tsconfig.json'
	},
	{
		name: '@robojs/auth',
		slug: 'auth',
		displayName: '@robojs/auth',
		entryPoint: 'packages/@robojs/auth/src/index.ts',
		tsconfig: 'packages/@robojs/auth/tsconfig.json',
		submodules: [
			{
				subpath: './client',
				source: 'packages/@robojs/auth/src/client.ts',
				label: '@robojs/auth/client'
			},
			{
				subpath: './server',
				source: 'packages/@robojs/auth/src/server.ts',
				label: '@robojs/auth/server'
			},
			{
				subpath: './emails',
				source: 'packages/@robojs/auth/src/emails/index.ts',
				label: '@robojs/auth/emails'
			}
		]
	},
	{
		name: '@robojs/better-stack',
		slug: 'better-stack',
		displayName: '@robojs/better-stack',
		entryPoint: 'packages/plugin-better-stack/src/index.ts',
		tsconfig: 'packages/plugin-better-stack/tsconfig.json'
	},
	{
		name: '@robojs/cli',
		slug: 'cli',
		displayName: '@robojs/cli',
		entryPoint: 'packages/@robojs/cli/src/index.ts',
		tsconfig: 'packages/@robojs/cli/tsconfig.json'
	},
	{
		name: '@robojs/cron',
		slug: 'cron',
		displayName: '@robojs/cron',
		entryPoint: 'packages/@robojs/cron/src/index.ts',
		tsconfig: 'packages/@robojs/cron/tsconfig.json'
	},
	{
		name: '@robojs/dev',
		slug: 'dev',
		displayName: '@robojs/dev',
		entryPoint: 'packages/plugin-devtools/src/index.ts',
		tsconfig: 'packages/plugin-devtools/tsconfig.json'
	},
	{
		name: '@robojs/discordjs',
		slug: 'discordjs',
		displayName: '@robojs/discordjs',
		entryPoint: 'packages/@robojs/discordjs/src/index.ts',
		tsconfig: 'packages/@robojs/discordjs/tsconfig.json',
		submodules: [
			{
				subpath: './types',
				source: 'packages/@robojs/discordjs/src/types/index.ts',
				label: '@robojs/discordjs/types'
			}
		]
	},
	{
		name: '@robojs/giveaways',
		slug: 'giveaways',
		displayName: '@robojs/giveaways',
		entryPoint: 'packages/@robojs/giveaways/src/index.ts',
		tsconfig: 'packages/@robojs/giveaways/tsconfig.json'
	},
	{
		name: '@robojs/i18n',
		slug: 'i18n',
		displayName: '@robojs/i18n',
		entryPoint: 'packages/@robojs/i18n/src/index.ts',
		tsconfig: 'packages/@robojs/i18n/tsconfig.json'
	},
	{
		name: '@robojs/mock',
		slug: 'mock',
		displayName: '@robojs/mock',
		entryPoint: 'packages/@robojs/mock/src/index.ts',
		tsconfig: 'packages/@robojs/mock/tsconfig.json',
		submodules: [
			{
				subpath: './session',
				source: 'packages/@robojs/mock/src/session/index.ts',
				label: '@robojs/mock/session'
			},
			{
				subpath: './testing',
				source: 'packages/@robojs/mock/src/testing/index.ts',
				label: '@robojs/mock/testing'
			}
		]
	},
	{
		name: '@robojs/moderation',
		slug: 'moderation',
		displayName: '@robojs/moderation',
		entryPoint: 'packages/plugin-modtools/src/index.ts',
		tsconfig: 'packages/plugin-modtools/tsconfig.json'
	},
	{
		name: '@robojs/patch',
		slug: 'patch',
		displayName: '@robojs/patch',
		entryPoint: 'packages/@robojs/patch/src/index.ts',
		tsconfig: 'packages/@robojs/patch/tsconfig.json'
	},
	{
		name: '@robojs/roadmap',
		slug: 'roadmap',
		displayName: '@robojs/roadmap',
		entryPoint: 'packages/@robojs/roadmap/src/index.ts',
		tsconfig: 'packages/@robojs/roadmap/tsconfig.json'
	},
	{
		name: '@robojs/server',
		slug: 'server',
		displayName: '@robojs/server',
		entryPoint: 'packages/plugin-api/src/index.ts',
		tsconfig: 'packages/plugin-api/tsconfig.json',
		submodules: [
			{
				subpath: './testing',
				source: 'packages/plugin-api/src/testing/index.ts',
				label: '@robojs/server/testing'
			}
		]
	},
	{
		name: '@robojs/sync',
		slug: 'sync',
		displayName: '@robojs/sync',
		entryPoint: 'packages/plugin-sync/src/index.ts',
		tsconfig: 'packages/plugin-sync/tsconfig.json',
		submodules: [
			{
				subpath: './server',
				source: 'packages/plugin-sync/src/server/index.ts',
				label: '@robojs/sync/server'
			}
		]
	},
	{
		name: '@robojs/trpc',
		slug: 'trpc',
		displayName: '@robojs/trpc',
		entryPoint: 'packages/@robojs/trpc/src/index.ts',
		tsconfig: 'packages/@robojs/trpc/tsconfig.json'
	},
	{
		name: '@robojs/xp',
		slug: 'xp',
		displayName: '@robojs/xp',
		entryPoint: 'packages/@robojs/xp/src/index.ts',
		tsconfig: 'packages/@robojs/xp/tsconfig.json'
	}
]

/** All packages including framework */
export const ALL_PACKAGES: PackageEntry[] = [FRAMEWORK, ...PACKAGES]
