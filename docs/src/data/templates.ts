export interface Template {
	author?: string
	description: string
	href: string
	tags: string[]
	title: string
}

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
		description: 'A 2D game made with KAPLAY and TypeScript.',
		href: './discord-activities/2d-game',
		tags: ['Discord Activity', 'TypeScript'],
		title: '2D Game'
	},
	{
		description: 'Game powered by the Godot Engine and TypeScript.',
		href: './discord-activities/godot',
		tags: ['Discord Activity', 'TypeScript'],
		title: 'Godot'
	},
	{
		description: 'A basic Unity template for Discord Activities.',
		href: './discord-activities/unity',
		tags: ['Discord Activity', 'TypeScript'],
		title: 'Unity'
	},
	{
		description: 'A simplified TypeScript template using Colyseus.',
		href: './discord-activities/react-colyseus-ts',
		tags: ['Discord Activity', 'TypeScript'],
		title: 'Multiplayer Colyseus'
	},
	{
		description: 'Control a video player with friends using React.',
		href: './discord-activities/react-multiplayer-video-ts',
		tags: ['Discord Activity', 'TypeScript'],
		title: 'Multiplayer Video'
	},
	{
		description: 'A music player proxying external audio using React.',
		href: './discord-activities/react-music-proxy-ts',
		tags: ['Discord Activity', 'TypeScript'],
		title: 'Music Player Proxy'
	},
	{
		description: 'A basic TypeScript template using Tailwind CSS.',
		href: './discord-activities/react-tailwind-ts',
		tags: ['Discord Activity', 'TypeScript'],
		title: 'TailwindCSS'
	},
	{
		description: 'A basic TypeScript template using Tailwind and shadcn.',
		href: './discord-activities/react-tailwind-shadcn-ts',
		tags: ['Discord Activity', 'TypeScript'],
		title: 'TailwindCSS + shadcn/ui'
	},
	{
		description: 'A basic TypeScript template using tRPC and React.',
		href: './discord-activities/react-trpc-ts',
		tags: ['Discord Activity', 'TypeScript'],
		title: 'tRPC'
	},
	{
		description: 'A basic JavaScript bot using Robo.js.',
		href: './discord-bots/starter-js',
		tags: ['Discord Bot'],
		title: 'Starter (JS)'
	},
	{
		description: 'A basic TypeScript bot using Robo.js.',
		href: './discord-bots/starter-ts',
		tags: ['Discord Bot'],
		title: 'Starter (TS)'
	},
	{
		author: 'MrJAwesome',
		description: 'An all-in-one toolkit for developers by MrJAwesome.',
		href: './discord-bots/mrjawesome-dev-toolkit-js',
		tags: ['Discord Bot'],
		title: 'Dev Toolkit (JS)'
	},
	{
		author: 'MrJAwesome',
		description: 'An all-in-one toolkit for developers by MrJAwesome.',
		href: './discord-bots/mrjawesome-dev-toolkit-ts',
		tags: ['Discord Bot'],
		title: 'Dev Toolkit (TS)'
	},
	{
		author: 'MrJAwesome',
		description: 'Quickstart for creating slash commands by MrJAwesome.',
		href: './discord-bots/mrjawesome-slash-commands-js',
		tags: ['Discord Bot'],
		title: 'Slash Command Package (JS)'
	},
	{
		author: 'MrJAwesome',
		description: 'Quickstart for creating slash commands by MrJAwesome.',
		href: './discord-bots/mrjawesome-slash-commands-ts',
		tags: ['Discord Bot'],
		title: 'Slash Command Package (TS)'
	},
	{
		description: 'A bot using MongoDB and TypeScript.',
		href: './discord-bots/mongodb-ts',
		tags: ['Discord Bot'],
		title: 'MongoDB (TS)'
	},
	{
		description: 'A bot using PostgreSQL and TypeScript.',
		href: './discord-bots/postgres-ts',
		tags: ['Discord Bot'],
		title: 'PostgreSQL (TS)'
	},
	{
		description: 'A bot using Prisma ORM and TypeScript.',
		href: './discord-bots/prisma-ts',
		tags: ['Discord Bot'],
		title: 'Prisma (TS)'
	},
	{
		description: 'A chatbot using @robojs/ai and TypeScript.',
		href: './discord-bots/ai-chatbot-ts',
		tags: ['Discord Bot'],
		title: 'AI Chatbot (TS)'
	},
	{
		description: 'Track bot usage over time. A TypeScript bot.',
		href: './discord-bots/analytics-ts',
		tags: ['Discord Bot'],
		title: 'Analytics (TS)'
	},
	{
		description: "Bake 'n take orders with this Discord bot!",
		href: './discord-bots/bake-n-take-js',
		tags: ['Discord Bot'],
		title: "Bake n' Take (JS)"
	},
	{
		description: "Bake 'n take orders with this Discord bot!",
		href: './discord-bots/bake-n-take-ts',
		tags: ['Discord Bot'],
		title: "Bake n' Take (TS)"
	},
	{
		description: 'Starter template containerized with Docker.',
		href: './discord-bots/docker-ts',
		tags: ['Discord Bot'],
		title: 'Docker (TS)'
	},
	{
		description: 'An economy bot using Robo.js.',
		href: './discord-bots/economy-ts',
		tags: ['Discord Bot'],
		title: 'Economy (TS)'
	},
	{
		description: 'A user-installable AI companion.',
		href: './discord-bots/purrth-vader-ts',
		tags: ['Discord Bot'],
		title: 'Purrth Vader (TS)'
	},
	{
		description: 'A tag bot using TagScript and TypeScript.',
		href: './discord-bots/tagbot',
		tags: ['Discord Bot'],
		title: 'TagBot (TS)'
	},
	{
		description: 'A basic JavaScript plugin for Robo.js.',
		href: './plugins/starter-js',
		tags: ['Plugin'],
		title: 'Starter (JS)'
	},
	{
		description: 'A basic JavaScript web app using Robo.js.',
		href: './web-apps/react-js',
		tags: ['Web App'],
		title: 'React (JS)'
	},
	{
		description: 'A basic TypeScript web app using Robo.js.',
		href: './web-apps/react-ts',
		tags: ['Web App'],
		title: 'React (TS)'
	},
	{
		description: 'Svelte web app using JavaScript.',
		href: './web-apps/svelte-js',
		tags: ['Web App'],
		title: 'Svelte (JS)'
	},
	{
		description: 'Svelte web app using TypeScript.',
		href: './web-apps/svelte-ts',
		tags: ['Web App'],
		title: 'Svelte (TS)'
	},
	{
		description: 'How to contribute to Robo.js',
		href: 'https://github.com/Wave-Play/robo.js/blob/main/CONTRIBUTING.md',
		tags: ['General'],
		title: 'Contributing'
	}
]
