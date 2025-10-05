import { mdiDotsGrid, mdiLightbulb, mdiPowerPlug, mdiRobot, mdiShapePlus, mdiWeb } from '@mdi/js'

export interface Template {
	author?: string
	decorator?: boolean
	description: string
	href: string
	images: string[]
	tags: string[]
	title: string
}

export interface TemplateFilter {
	icon: string
	name: string
	tags: string[]
	value: string
}

const ImageBase = 'https://robojs.dev/templates/'

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
		description: 'A basic JavaScript template using React.',
		href: './discord-activities/react-js',
		images: [],
		tags: ['Discord Activity', 'JavaScript'],
		title: 'Discord Activity Starter'
	},
	{
		author: 'WavePlay',
		description: 'A basic TypeScript template using React.',
		href: './discord-activities/react-ts',
		images: [],
		tags: ['Discord Activity', 'TypeScript'],
		title: 'Discord Activity Starter'
	},
	{
		author: 'WavePlay',
		description: 'A basic JavaScript bot using Robo.js.',
		href: './discord-bots/starter-js',
		images: [],
		tags: ['Discord Bot', 'JavaScript'],
		title: 'Discord Bot Starter'
	},
	{
		author: 'WavePlay',
		description: 'A basic TypeScript bot using Robo.js.',
		href: './discord-bots/starter-ts',
		images: [],
		tags: ['Discord Bot', 'TypeScript'],
		title: 'Discord Bot Starter'
	},
	{
		author: 'WavePlay',
		description: 'A basic Unity template for Discord Activities.',
		href: './discord-activities/unity',
		images: [ImageBase + 'unity.png'],
		tags: ['Discord Activity', 'TypeScript'],
		title: 'Unity'
	},
	{
		author: 'WavePlay',
		description: 'A simplified TypeScript template using Colyseus.',
		href: './discord-activities/react-colyseus-ts',
		images: [ImageBase + 'colyseus.png'],
		tags: ['Discord Activity', 'TypeScript'],
		title: 'Multiplayer Colyseus'
	},
	{
		author: 'WavePlay',
		description: 'A music player proxying external audio using React.',
		href: './discord-activities/react-music-proxy-ts',
		images: [],
		tags: ['Discord Activity', 'TypeScript'],
		title: 'Music Player Proxy'
	},
	{
		author: 'MrJAwesome',
		decorator: false,
		description: 'An all-in-one toolkit for developers.',
		href: './discord-bots/mrjawesome-dev-toolkit-js',
		images: [ImageBase + 'mrjawesome.png'],
		tags: ['Discord Bot', 'MrJAwesome', 'JavaScript'],
		title: 'Dev Toolkit'
	},
	{
		author: 'MrJAwesome',
		decorator: false,
		description: 'An all-in-one toolkit for developers.',
		href: './discord-bots/mrjawesome-dev-toolkit-ts',
		images: [ImageBase + 'mrjawesome.png'],
		tags: ['Discord Bot', 'MrJAwesome', 'TypeScript'],
		title: 'Dev Toolkit'
	},
	{
		author: 'MrJAwesome',
		decorator: false,
		description: 'Quickstart for creating slash commands.',
		href: './discord-bots/mrjawesome-slash-commands-js',
		images: [ImageBase + 'mrjawesome.png'],
		tags: ['Discord Bot', 'MrJAwesome', 'JavaScript'],
		title: 'Slash Command Package'
	},
	{
		author: 'MrJAwesome',
		decorator: false,
		description: 'Quickstart for creating slash commands.',
		href: './discord-bots/mrjawesome-slash-commands-ts',
		images: [ImageBase + 'mrjawesome.png'],
		tags: ['Discord Bot', 'MrJAwesome', 'TypeScript'],
		title: 'Slash Command Package'
	},
	{
		author: 'Arnav K',
		decorator: false,
		description: 'A 2D game made with KAPLAY and TypeScript.',
		href: './discord-activities/2d-game',
		images: [ImageBase + '2d-game.png'],
		tags: ['Discord Activity', 'TypeScript'],
		title: '2D Game'
	},
	{
		author: 'Sideways-Sky',
		decorator: false,
		description: 'Game powered by the Godot Engine and TypeScript.',
		href: './discord-activities/godot',
		images: [ImageBase + 'godot.png'],
		tags: ['Discord Activity', 'TypeScript'],
		title: 'Godot'
	},
	{
		author: 'WavePlay',
		decorator: false,
		description: "Bake 'n take orders with this Discord bot!",
		href: './discord-bots/bake-n-take-js',
		images: [ImageBase + 'bake-n-take.png'],
		tags: ['Discord Bot', 'JavaScript'],
		title: "Bake n' Take"
	},
	{
		author: 'WavePlay',
		decorator: false,
		description: "Bake 'n take orders with this Discord bot!",
		href: './discord-bots/bake-n-take-ts',
		images: [ImageBase + 'bake-n-take.png'],
		tags: ['Discord Bot', 'TypeScript'],
		title: "Bake n' Take"
	},
	{
		author: 'WavePlay',
		description: 'Starter Discord Activity set up with Firebase Firestore.',
		href: './discord-activities/react-firebase-ts',
		images: [ImageBase + 'firebase.png'],
		tags: ['Discord Activity', 'TypeScript'],
		title: 'Discord Activity w/ Firebase'
	},
	{
		author: 'waru',
		description: 'A basic TypeScript template using Tailwind CSS.',
		href: './discord-activities/react-tailwind-ts',
		images: [ImageBase + 'tailwind.png'],
		tags: ['Discord Activity', 'TypeScript'],
		title: 'TailwindCSS'
	},
	{
		author: 'waru',
		description: 'A basic TypeScript template using Tailwind and shadcn.',
		href: './discord-activities/react-tailwind-shadcn-ts',
		images: [ImageBase + 'shadcn.png'],
		tags: ['Discord Activity', 'TypeScript'],
		title: 'TailwindCSS + shadcn/ui'
	},
	{
		author: 'WavePlay',
		description: 'A basic TypeScript template using tRPC and React.',
		href: './discord-activities/react-trpc-ts',
		images: [ImageBase + 'trpc.png'],
		tags: ['Discord Activity', 'TypeScript'],
		title: 'tRPC'
	},
	{
		author: 'WavePlay',
		description: 'Control a video player with friends using React.',
		href: './discord-activities/react-multiplayer-video-ts',
		images: [],
		tags: ['Discord Activity', 'TypeScript'],
		title: 'Multiplayer Video'
	},
	{
		author: 'WavePlay',
		description: 'A bot using MongoDB and TypeScript.',
		href: './discord-bots/mongodb-ts',
		images: [ImageBase + 'mongodb.png'],
		tags: ['Discord Bot', 'TypeScript'],
		title: 'MongoDB'
	},
	{
		author: 'waru',
		description: 'A bot using PostgreSQL and TypeScript.',
		href: './discord-bots/postgres-ts',
		images: [ImageBase + 'postgres.png'],
		tags: ['Discord Bot', 'TypeScript'],
		title: 'PostgreSQL'
	},
	{
		author: 'waru',
		description: 'A bot using Prisma ORM and TypeScript.',
		href: './discord-bots/prisma-ts',
		images: [ImageBase + 'prisma.png'],
		tags: ['Discord Bot', 'TypeScript'],
		title: 'Prisma'
	},
	{
		author: 'WavePlay',
		description: 'A chatbot using @robojs/ai and TypeScript.',
		href: './discord-bots/ai-chatbot-ts',
		images: [],
		tags: ['Discord Bot', 'TypeScript'],
		title: 'AI Chatbot'
	},
	{
		author: 'WavePlay',
		description: 'Track bot usage over time. A TypeScript bot.',
		href: './discord-bots/analytics-ts',
		images: [ImageBase + 'analytics.png'],
		tags: ['Discord Bot', 'TypeScript'],
		title: 'Analytics'
	},
	{
		author: 'WavePlay',
		description: 'A basic JavaScript template without any UI libraries.',
		href: './discord-activities/vanilla-js',
		images: [ImageBase + 'html5.png'],
		tags: ['Discord Activity', 'JavaScript'],
		title: 'Vanilla Starter'
	},
	{
		author: 'WavePlay',
		description: 'A basic TypeScript template without any UI libraries.',
		href: './discord-activities/vanilla-ts',
		images: [ImageBase + 'html5.png'],
		tags: ['Discord Activity', 'TypeScript'],
		title: 'Vanilla Starter'
	},
	{
		author: 'WavePlay',
		description: 'Starter template containerized with Docker.',
		href: './discord-bots/docker-ts',
		images: [ImageBase + 'docker.png'],
		tags: ['Discord Bot', 'TypeScript'],
		title: 'Docker'
	},
	{
		author: 'Arnav K',
		description: 'An economy bot using Robo.js.',
		href: './discord-bots/economy-ts',
		images: [],
		tags: ['Discord Bot', 'TypeScript'],
		title: 'Economy'
	},
	{
		author: 'WavePlay',
		description: 'A user-installable AI companion.',
		href: './discord-bots/purrth-vader-ts',
		images: [],
		tags: ['Discord Bot', 'TypeScript'],
		title: 'Purrth Vader'
	},
	{
		author: 'Arnav K',
		description: 'A tag bot using TagScript and TypeScript.',
		href: './discord-bots/tagbot',
		images: [],
		tags: ['Discord Bot', 'TypeScript'],
		title: 'TagBot'
	},
	{
		author: 'WavePlay',
		description: 'A basic JavaScript plugin for Robo.js.',
		href: './plugins/starter-js',
		images: [],
		tags: ['Plugin', 'JavaScript'],
		title: 'Plugin Starter'
	},
	{
		author: 'WavePlay',
		description: 'React + @robojs/auth starter with a session-aware dashboard.',
		href: './web-apps/discord-auth-ts',
		images: [ImageBase + 'react.png'],
		tags: ['Web App', 'TypeScript', 'Auth'],
		title: 'Discord Auth Starter'
	},
	{
		author: 'WavePlay',
		description: 'A basic JavaScript web app using Robo.js.',
		href: './web-apps/react-js',
		images: [ImageBase + 'react.png'],
		tags: ['Web App', 'JavaScript'],
		title: 'React Starter'
	},
	{
		author: 'WavePlay',
		description: 'A basic TypeScript web app using Next.js and Robo.js.',
		href: './web-apps/next-ts',
		images: [ImageBase + 'react.png'],
		tags: ['Web App', 'TypeScript'],
		title: 'Next Starter'
	},
	{
		author: 'WavePlay',
		description: 'A basic TypeScript web app using Robo.js.',
		href: './web-apps/react-ts',
		images: [ImageBase + 'react.png'],
		tags: ['Web App', 'TypeScript'],
		title: 'React Starter'
	},
	{
		author: 'Matej Bošnjak',
		description: 'Svelte web app using JavaScript.',
		href: './web-apps/svelte-js',
		images: [ImageBase + 'svelte.png'],
		tags: ['Web App', 'JavaScript'],
		title: 'Svelte Starter'
	},
	{
		author: 'Matej Bošnjak',
		description: 'Svelte web app using TypeScript.',
		href: './web-apps/svelte-ts',
		images: [ImageBase + 'svelte.png'],
		tags: ['Web App', 'TypeScript'],
		title: 'Svelte Starter'
	}
].map((template) => {
	// Prefix all template hrefs with /templates
	return {
		...template,
		href: template.href.replace('./', '/templates/')
	}
})

const Host = 'https://preview.robojs.dev/template'

export function getPreview(template: Template) {
	if (template.decorator !== false && template.images.length) {
		return (
			Host +
			'?title=' +
			encodeURIComponent(template.title) +
			'&tags=' +
			encodeURIComponent(template.tags.join(',')) +
			'&image=' +
			encodeURIComponent(template.images[0])
		)
	}
	if (template.images.length) {
		return template.images[0]
	}

	return Host + '?title=' + encodeURIComponent(template.title) + '&tags=' + encodeURIComponent(template.tags.join(','))
}
