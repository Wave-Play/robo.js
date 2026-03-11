export interface Template {
	author: string
	description: string
	href: string
	image?: string
	tags: string[]
	title: string
	language: 'TypeScript' | 'JavaScript'
	type: 'activity' | 'bot' | 'web' | 'plugin'
}

const ImageBase = 'https://robojs.dev/templates/'

export const templates: Template[] = [
	// Discord Activities
	{
		author: 'WavePlay',
		description: 'A basic JavaScript template using React.',
		href: '/docs/templates/discord-activities/react-js',
		tags: ['Discord Activity', 'React'],
		title: 'Discord Activity Starter',
		language: 'JavaScript',
		type: 'activity'
	},
	{
		author: 'WavePlay',
		description: 'A basic TypeScript template using React.',
		href: '/docs/templates/discord-activities/react-ts',
		tags: ['Discord Activity', 'React'],
		title: 'Discord Activity Starter',
		language: 'TypeScript',
		type: 'activity'
	},
	{
		author: 'WavePlay',
		description: 'A basic Unity template for Discord Activities.',
		href: '/docs/templates/discord-activities/unity',
		image: ImageBase + 'unity.png',
		tags: ['Discord Activity', 'Unity'],
		title: 'Unity',
		language: 'TypeScript',
		type: 'activity'
	},
	{
		author: 'WavePlay',
		description: 'A simplified TypeScript template using Colyseus.',
		href: '/docs/templates/discord-activities/react-colyseus-ts',
		image: ImageBase + 'colyseus.png',
		tags: ['Discord Activity', 'Colyseus', 'Multiplayer'],
		title: 'Multiplayer Colyseus',
		language: 'TypeScript',
		type: 'activity'
	},
	{
		author: 'WavePlay',
		description: 'A music player proxying external audio using React.',
		href: '/docs/templates/discord-activities/react-music-proxy-ts',
		tags: ['Discord Activity', 'Music'],
		title: 'Music Player Proxy',
		language: 'TypeScript',
		type: 'activity'
	},
	{
		author: 'Arnav K',
		description: 'A 2D game made with KAPLAY and TypeScript.',
		href: '/docs/templates/discord-activities/2d-game',
		image: ImageBase + '2d-game.png',
		tags: ['Discord Activity', 'Game', 'KAPLAY'],
		title: '2D Game',
		language: 'TypeScript',
		type: 'activity'
	},
	{
		author: 'Sideways-Sky',
		description: 'Game powered by the Godot Engine and TypeScript.',
		href: '/docs/templates/discord-activities/godot',
		image: ImageBase + 'godot.png',
		tags: ['Discord Activity', 'Game', 'Godot'],
		title: 'Godot',
		language: 'TypeScript',
		type: 'activity'
	},
	{
		author: 'WavePlay',
		description: 'Starter Discord Activity set up with Firebase Firestore.',
		href: '/docs/templates/discord-activities/react-firebase-ts',
		image: ImageBase + 'firebase.png',
		tags: ['Discord Activity', 'Firebase'],
		title: 'Discord Activity w/ Firebase',
		language: 'TypeScript',
		type: 'activity'
	},
	{
		author: 'waru',
		description: 'A basic TypeScript template using Tailwind CSS.',
		href: '/docs/templates/discord-activities/react-tailwind-ts',
		image: ImageBase + 'tailwind.png',
		tags: ['Discord Activity', 'Tailwind'],
		title: 'TailwindCSS',
		language: 'TypeScript',
		type: 'activity'
	},
	{
		author: 'waru',
		description: 'A basic TypeScript template using Tailwind and shadcn.',
		href: '/docs/templates/discord-activities/react-tailwind-shadcn-ts',
		image: ImageBase + 'shadcn.png',
		tags: ['Discord Activity', 'Tailwind', 'shadcn'],
		title: 'TailwindCSS + shadcn/ui',
		language: 'TypeScript',
		type: 'activity'
	},
	{
		author: 'WavePlay',
		description: 'A basic TypeScript template using tRPC and React.',
		href: '/docs/templates/discord-activities/react-trpc-ts',
		image: ImageBase + 'trpc.png',
		tags: ['Discord Activity', 'tRPC'],
		title: 'tRPC',
		language: 'TypeScript',
		type: 'activity'
	},
	{
		author: 'WavePlay',
		description: 'Control a video player with friends using React.',
		href: '/docs/templates/discord-activities/react-multiplayer-video-ts',
		tags: ['Discord Activity', 'Multiplayer', 'Video'],
		title: 'Multiplayer Video',
		language: 'TypeScript',
		type: 'activity'
	},
	{
		author: 'WavePlay',
		description: 'A basic JavaScript template without any UI libraries.',
		href: '/docs/templates/discord-activities/vanilla-js',
		image: ImageBase + 'html5.png',
		tags: ['Discord Activity', 'Vanilla'],
		title: 'Vanilla Starter',
		language: 'JavaScript',
		type: 'activity'
	},
	{
		author: 'WavePlay',
		description: 'A basic TypeScript template without any UI libraries.',
		href: '/docs/templates/discord-activities/vanilla-ts',
		image: ImageBase + 'html5.png',
		tags: ['Discord Activity', 'Vanilla'],
		title: 'Vanilla Starter',
		language: 'TypeScript',
		type: 'activity'
	},

	// Discord Bots
	{
		author: 'WavePlay',
		description: 'A basic JavaScript bot using Robo.js.',
		href: '/docs/templates/discord-bots/starter-js',
		tags: ['Discord Bot'],
		title: 'Discord Bot Starter',
		language: 'JavaScript',
		type: 'bot'
	},
	{
		author: 'WavePlay',
		description: 'A basic TypeScript bot using Robo.js.',
		href: '/docs/templates/discord-bots/starter-ts',
		tags: ['Discord Bot'],
		title: 'Discord Bot Starter',
		language: 'TypeScript',
		type: 'bot'
	},
	{
		author: 'MrJAwesome',
		description: 'An all-in-one toolkit for developers.',
		href: '/docs/templates/discord-bots/mrjawesome-dev-toolkit-js',
		image: ImageBase + 'mrjawesome.png',
		tags: ['Discord Bot', 'MrJAwesome', 'Toolkit'],
		title: 'Dev Toolkit',
		language: 'JavaScript',
		type: 'bot'
	},
	{
		author: 'MrJAwesome',
		description: 'An all-in-one toolkit for developers.',
		href: '/docs/templates/discord-bots/mrjawesome-dev-toolkit-ts',
		image: ImageBase + 'mrjawesome.png',
		tags: ['Discord Bot', 'MrJAwesome', 'Toolkit'],
		title: 'Dev Toolkit',
		language: 'TypeScript',
		type: 'bot'
	},
	{
		author: 'MrJAwesome',
		description: 'Quickstart for creating slash commands.',
		href: '/docs/templates/discord-bots/mrjawesome-slash-commands-js',
		image: ImageBase + 'mrjawesome.png',
		tags: ['Discord Bot', 'MrJAwesome', 'Commands'],
		title: 'Slash Command Package',
		language: 'JavaScript',
		type: 'bot'
	},
	{
		author: 'MrJAwesome',
		description: 'Quickstart for creating slash commands.',
		href: '/docs/templates/discord-bots/mrjawesome-slash-commands-ts',
		image: ImageBase + 'mrjawesome.png',
		tags: ['Discord Bot', 'MrJAwesome', 'Commands'],
		title: 'Slash Command Package',
		language: 'TypeScript',
		type: 'bot'
	},
	{
		author: 'WavePlay',
		description: "Bake 'n take orders with this Discord bot!",
		href: '/docs/templates/discord-bots/bake-n-take-js',
		image: ImageBase + 'bake-n-take.png',
		tags: ['Discord Bot', 'Fun'],
		title: "Bake n' Take",
		language: 'JavaScript',
		type: 'bot'
	},
	{
		author: 'WavePlay',
		description: "Bake 'n take orders with this Discord bot!",
		href: '/docs/templates/discord-bots/bake-n-take-ts',
		image: ImageBase + 'bake-n-take.png',
		tags: ['Discord Bot', 'Fun'],
		title: "Bake n' Take",
		language: 'TypeScript',
		type: 'bot'
	},
	{
		author: 'WavePlay',
		description: 'A bot using MongoDB and TypeScript.',
		href: '/docs/templates/discord-bots/mongodb-ts',
		image: ImageBase + 'mongodb.png',
		tags: ['Discord Bot', 'MongoDB', 'Database'],
		title: 'MongoDB',
		language: 'TypeScript',
		type: 'bot'
	},
	{
		author: 'waru',
		description: 'A bot using PostgreSQL and TypeScript.',
		href: '/docs/templates/discord-bots/postgres-ts',
		image: ImageBase + 'postgres.png',
		tags: ['Discord Bot', 'PostgreSQL', 'Database'],
		title: 'PostgreSQL',
		language: 'TypeScript',
		type: 'bot'
	},
	{
		author: 'waru',
		description: 'A bot using Prisma ORM and TypeScript.',
		href: '/docs/templates/discord-bots/prisma-ts',
		image: ImageBase + 'prisma.png',
		tags: ['Discord Bot', 'Prisma', 'Database'],
		title: 'Prisma',
		language: 'TypeScript',
		type: 'bot'
	},
	{
		author: 'WavePlay',
		description: 'A chatbot using @robojs/ai and TypeScript.',
		href: '/docs/templates/discord-bots/ai-chatbot-ts',
		tags: ['Discord Bot', 'AI'],
		title: 'AI Chatbot',
		language: 'TypeScript',
		type: 'bot'
	},
	{
		author: 'WavePlay',
		description: 'Track bot usage over time. A TypeScript bot.',
		href: '/docs/templates/discord-bots/analytics-ts',
		image: ImageBase + 'analytics.png',
		tags: ['Discord Bot', 'Analytics'],
		title: 'Analytics',
		language: 'TypeScript',
		type: 'bot'
	},
	{
		author: 'WavePlay',
		description: 'Starter template containerized with Docker.',
		href: '/docs/templates/discord-bots/docker-ts',
		image: ImageBase + 'docker.png',
		tags: ['Discord Bot', 'Docker'],
		title: 'Docker',
		language: 'TypeScript',
		type: 'bot'
	},
	{
		author: 'Arnav K',
		description: 'An economy bot using Robo.js.',
		href: '/docs/templates/discord-bots/economy-ts',
		tags: ['Discord Bot', 'Economy'],
		title: 'Economy',
		language: 'TypeScript',
		type: 'bot'
	},
	{
		author: 'WavePlay',
		description: 'A user-installable AI companion.',
		href: '/docs/templates/discord-bots/purrth-vader-ts',
		tags: ['Discord Bot', 'AI', 'User App'],
		title: 'Purrth Vader',
		language: 'TypeScript',
		type: 'bot'
	},
	{
		author: 'Arnav K',
		description: 'A tag bot using TagScript and TypeScript.',
		href: '/docs/templates/discord-bots/tagbot',
		tags: ['Discord Bot', 'TagScript'],
		title: 'TagBot',
		language: 'TypeScript',
		type: 'bot'
	},

	// Web Apps
	{
		author: 'WavePlay',
		description: 'React + @robojs/auth starter with a session-aware dashboard.',
		href: '/docs/templates/web-apps/discord-auth-ts',
		image: ImageBase + 'react.png',
		tags: ['Web App', 'React', 'Auth'],
		title: 'Discord Auth Starter',
		language: 'TypeScript',
		type: 'web'
	},
	{
		author: 'WavePlay',
		description: 'A basic JavaScript web app using Robo.js.',
		href: '/docs/templates/web-apps/react-js',
		image: ImageBase + 'react.png',
		tags: ['Web App', 'React'],
		title: 'React Starter',
		language: 'JavaScript',
		type: 'web'
	},
	{
		author: 'WavePlay',
		description: 'A basic TypeScript web app using Next.js and Robo.js.',
		href: '/docs/templates/web-apps/next-ts',
		image: ImageBase + 'react.png',
		tags: ['Web App', 'Next.js'],
		title: 'Next Starter',
		language: 'TypeScript',
		type: 'web'
	},
	{
		author: 'WavePlay',
		description: 'Next.js + @robojs/auth starter with Prisma and authentication.',
		href: '/docs/templates/web-apps/next-auth-ts',
		image: ImageBase + 'react.png',
		tags: ['Web App', 'Next.js', 'Auth', 'Prisma'],
		title: 'Next.js + Auth',
		language: 'TypeScript',
		type: 'web'
	},
	{
		author: 'WavePlay',
		description: 'A basic TypeScript web app using Robo.js.',
		href: '/docs/templates/web-apps/react-ts',
		image: ImageBase + 'react.png',
		tags: ['Web App', 'React'],
		title: 'React Starter',
		language: 'TypeScript',
		type: 'web'
	},
	{
		author: 'Matej Bošnjak',
		description: 'Svelte web app using JavaScript.',
		href: '/docs/templates/web-apps/svelte-js',
		image: ImageBase + 'svelte.png',
		tags: ['Web App', 'Svelte'],
		title: 'Svelte Starter',
		language: 'JavaScript',
		type: 'web'
	},
	{
		author: 'Matej Bošnjak',
		description: 'Svelte web app using TypeScript.',
		href: '/docs/templates/web-apps/svelte-ts',
		image: ImageBase + 'svelte.png',
		tags: ['Web App', 'Svelte'],
		title: 'Svelte Starter',
		language: 'TypeScript',
		type: 'web'
	},

	// Plugins
	{
		author: 'WavePlay',
		description: 'A basic JavaScript plugin for Robo.js.',
		href: '/docs/templates/plugins/starter-js',
		tags: ['Plugin'],
		title: 'Plugin Starter',
		language: 'JavaScript',
		type: 'plugin'
	}
]

export const typeLabels: Record<string, string> = {
	activity: 'Discord Activity',
	bot: 'Discord Bot',
	web: 'Web App',
	plugin: 'Plugin'
}

export const typeColors: Record<string, string> = {
	activity: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
	bot: 'bg-[#5865F2]/10 text-[#5865F2] border-[#5865F2]/20',
	web: 'bg-green-500/10 text-green-500 border-green-500/20',
	plugin: 'bg-orange-500/10 text-orange-500 border-orange-500/20'
}
