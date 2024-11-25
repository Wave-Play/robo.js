import { mdiDotsGrid, mdiLightbulb, mdiPowerPlug, mdiRobot, mdiShapePlus, mdiWeb } from '@mdi/js'

export interface Template {
	author?: string
	description: string
	href: string
	tags: string[]
	title: string
}

export interface TemplateFilter {
	icon: string
	name: string
	tags: string[]
	value: string
}

export const Filters: TemplateFilter[] = [
	{
		icon: mdiDotsGrid,
		name: 'All Templates',
		tags: [],
		value: 'all-templates'
	},
	{
		icon: mdiShapePlus,
		name: 'Discord Activities',
		tags: ['Discord Activity'],
		value: 'discord-activities'
	},
	{
		icon: mdiRobot,
		name: 'Discord Bots',
		tags: ['Discord Bot'],
		value: 'discord-bots'
	},
	{
		icon: mdiLightbulb,
		name: 'MrJAwesome',
		tags: ['MrJAwesome'],
		value: 'mrjawesome'
	},
	{
		icon: mdiPowerPlug,
		name: 'Plugins',
		tags: ['Plugin'],
		value: 'plugins'
	},
	{
		icon: mdiWeb,
		name: 'Web Apps',
		tags: ['Web App'],
		value: 'web-apps'
	}
]

export const Templates: Template[] = [
	{
		author: 'WavePlay',
		description: 'A basic JavaScript template without any UI libraries.',
		href: './discord-activities/vanilla-js',
		tags: ['Discord Activity', 'JavaScript'],
		title: 'Vanilla'
	},
	{
		author: 'WavePlay',
		description: 'A basic TypeScript template without any UI libraries.',
		href: './discord-activities/vanilla-ts',
		tags: ['Discord Activity', 'TypeScript'],
		title: 'Vanilla'
	},
	{
		author: 'WavePlay',
		description: 'A basic JavaScript template using React.',
		href: './discord-activities/react-js',
		tags: ['Discord Activity', 'JavaScript'],
		title: 'React'
	},
	{
		author: 'WavePlay',
		description: 'A basic TypeScript template using React.',
		href: './discord-activities/react-ts',
		tags: ['Discord Activity', 'TypeScript'],
		title: 'React'
	},
	{
		author: 'Arnav K',
		description: 'A 2D game made with KAPLAY and TypeScript.',
		href: './discord-activities/2d-game',
		tags: ['Discord Activity', 'TypeScript'],
		title: '2D Game'
	},
	{
		author: 'Sideways-Sky',
		description: 'Game powered by the Godot Engine and TypeScript.',
		href: './discord-activities/godot',
		tags: ['Discord Activity', 'TypeScript'],
		title: 'Godot'
	},
	{
		author: 'WavePlay',
		description: 'A basic Unity template for Discord Activities.',
		href: './discord-activities/unity',
		tags: ['Discord Activity', 'TypeScript'],
		title: 'Unity'
	},
	{
		author: 'WavePlay',
		description: 'A simplified TypeScript template using Colyseus.',
		href: './discord-activities/react-colyseus-ts',
		tags: ['Discord Activity', 'TypeScript'],
		title: 'Multiplayer Colyseus'
	},
	{
		author: 'WavePlay',
		description: 'Control a video player with friends using React.',
		href: './discord-activities/react-multiplayer-video-ts',
		tags: ['Discord Activity', 'TypeScript'],
		title: 'Multiplayer Video'
	},
	{
		author: 'WavePlay',
		description: 'A music player proxying external audio using React.',
		href: './discord-activities/react-music-proxy-ts',
		tags: ['Discord Activity', 'TypeScript'],
		title: 'Music Player Proxy'
	},
	{
		author: 'waru',
		description: 'A basic TypeScript template using Tailwind CSS.',
		href: './discord-activities/react-tailwind-ts',
		tags: ['Discord Activity', 'TypeScript'],
		title: 'TailwindCSS'
	},
	{
		author: 'waru',
		description: 'A basic TypeScript template using Tailwind and shadcn.',
		href: './discord-activities/react-tailwind-shadcn-ts',
		tags: ['Discord Activity', 'TypeScript'],
		title: 'TailwindCSS + shadcn/ui'
	},
	{
		author: 'WavePlay',
		description: 'A basic TypeScript template using tRPC and React.',
		href: './discord-activities/react-trpc-ts',
		tags: ['Discord Activity', 'TypeScript'],
		title: 'tRPC'
	},
	{
		author: 'WavePlay',
		description: 'A basic JavaScript bot using Robo.js.',
		href: './discord-bots/starter-js',
		tags: ['Discord Bot', 'JavaScript'],
		title: 'Starter (JS)'
	},
	{
		author: 'WavePlay',
		description: 'A basic TypeScript bot using Robo.js.',
		href: './discord-bots/starter-ts',
		tags: ['Discord Bot', 'TypeScript'],
		title: 'Starter (TS)'
	},
	{
		author: 'MrJAwesome',
		description: 'An all-in-one toolkit for developers by MrJAwesome.',
		href: './discord-bots/mrjawesome-dev-toolkit-js',
		tags: ['Discord Bot', 'MrJAwesome', 'JavaScript'],
		title: 'Dev Toolkit (JS)'
	},
	{
		author: 'MrJAwesome',
		description: 'An all-in-one toolkit for developers by MrJAwesome.',
		href: './discord-bots/mrjawesome-dev-toolkit-ts',
		tags: ['Discord Bot', 'MrJAwesome', 'TypeScript'],
		title: 'Dev Toolkit (TS)'
	},
	{
		author: 'MrJAwesome',
		description: 'Quickstart for creating slash commands by MrJAwesome.',
		href: './discord-bots/mrjawesome-slash-commands-js',
		tags: ['Discord Bot', 'MrJAwesome', 'JavaScript'],
		title: 'Slash Command Package (JS)'
	},
	{
		author: 'MrJAwesome',
		description: 'Quickstart for creating slash commands by MrJAwesome.',
		href: './discord-bots/mrjawesome-slash-commands-ts',
		tags: ['Discord Bot', 'MrJAwesome', 'TypeScript'],
		title: 'Slash Command Package (TS)'
	},
	{
		author: 'WavePlay',
		description: 'A bot using MongoDB and TypeScript.',
		href: './discord-bots/mongodb-ts',
		tags: ['Discord Bot', 'TypeScript'],
		title: 'MongoDB (TS)'
	},
	{
		author: 'waru',
		description: 'A bot using PostgreSQL and TypeScript.',
		href: './discord-bots/postgres-ts',
		tags: ['Discord Bot', 'TypeScript'],
		title: 'PostgreSQL (TS)'
	},
	{
		author: 'waru',
		description: 'A bot using Prisma ORM and TypeScript.',
		href: './discord-bots/prisma-ts',
		tags: ['Discord Bot', 'TypeScript'],
		title: 'Prisma (TS)'
	},
	{
		author: 'WavePlay',
		description: 'A chatbot using @robojs/ai and TypeScript.',
		href: './discord-bots/ai-chatbot-ts',
		tags: ['Discord Bot', 'TypeScript'],
		title: 'AI Chatbot (TS)'
	},
	{
		author: 'WavePlay',
		description: 'Track bot usage over time. A TypeScript bot.',
		href: './discord-bots/analytics-ts',
		tags: ['Discord Bot', 'TypeScript'],
		title: 'Analytics (TS)'
	},
	{
		author: 'WavePlay',
		description: "Bake 'n take orders with this Discord bot!",
		href: './discord-bots/bake-n-take-js',
		tags: ['Discord Bot', 'JavaScript'],
		title: "Bake n' Take (JS)"
	},
	{
		author: 'WavePlay',
		description: "Bake 'n take orders with this Discord bot!",
		href: './discord-bots/bake-n-take-ts',
		tags: ['Discord Bot', 'TypeScript'],
		title: "Bake n' Take (TS)"
	},
	{
		author: 'WavePlay',
		description: 'Starter template containerized with Docker.',
		href: './discord-bots/docker-ts',
		tags: ['Discord Bot', 'TypeScript'],
		title: 'Docker (TS)'
	},
	{
		author: 'Arnav K',
		description: 'An economy bot using Robo.js.',
		href: './discord-bots/economy-ts',
		tags: ['Discord Bot', 'TypeScript'],
		title: 'Economy (TS)'
	},
	{
		author: 'WavePlay',
		description: 'A user-installable AI companion.',
		href: './discord-bots/purrth-vader-ts',
		tags: ['Discord Bot', 'TypeScript'],
		title: 'Purrth Vader (TS)'
	},
	{
		author: 'Arnav K',
		description: 'A tag bot using TagScript and TypeScript.',
		href: './discord-bots/tagbot',
		tags: ['Discord Bot', 'TypeScript'],
		title: 'TagBot (TS)'
	},
	{
		author: 'WavePlay',
		description: 'A basic JavaScript plugin for Robo.js.',
		href: './plugins/starter-js',
		tags: ['Plugin', 'JavaScript'],
		title: 'Starter (JS)'
	},
	{
		author: 'WavePlay',
		description: 'A basic JavaScript web app using Robo.js.',
		href: './web-apps/react-js',
		tags: ['Web App', 'JavaScript'],
		title: 'React (JS)'
	},
	{
		author: 'WavePlay',
		description: 'A basic TypeScript web app using Robo.js.',
		href: './web-apps/react-ts',
		tags: ['Web App', 'TypeScript'],
		title: 'React (TS)'
	},
	{
		author: 'Matej Bošnjak',
		description: 'Svelte web app using JavaScript.',
		href: './web-apps/svelte-js',
		tags: ['Web App', 'JavaScript'],
		title: 'Svelte (JS)'
	},
	{
		author: 'Matej Bošnjak',
		description: 'Svelte web app using TypeScript.',
		href: './web-apps/svelte-ts',
		tags: ['Web App', 'TypeScript'],
		title: 'Svelte (TS)'
	}
].map((template) => {
	// Prefix all template hrefs with /templates
	return { ...template, href: template.href.replace('./', '/templates/') }
})
