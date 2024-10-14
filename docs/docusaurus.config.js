// @ts-check

// eslint-disable-next-line @typescript-eslint/no-var-requires
// import React from 'react'
// import Footer from './src/components/Footer';
const { themes } = require('prism-react-renderer')
const lightCodeTheme = themes.github
const darkCodeTheme = themes.dracula

/** @type {import('@docusaurus/types').Config} */
const config = {
	title: 'Robo.js',
	tagline: 'Robo.js',
	favicon: 'img/favicon.ico',

	// Set the production url of your site here
	url: 'https://docs.roboplay.dev',
	// Set the /<baseUrl>/ pathname under which your site is served
	// For GitHub pages deployment, it is often '/<projectName>/'
	baseUrl: '/',

	// GitHub pages deployment config.
	// If you aren't using GitHub pages, you don't need these.
	organizationName: 'Wave-Play', // Usually your GitHub org/user name.
	projectName: 'Robo.js', // Usually your repo name.

	onBrokenLinks: 'warn',
	onBrokenMarkdownLinks: 'warn',

	// Even if you don't use internalization, you can use this field to set useful
	// metadata like html lang. For example, if your site is Chinese, you may want
	// to replace "en" with "zh-Hans".
	i18n: {
		defaultLocale: 'en',
		locales: ['en']
	},

	plugins: [
		[
			'@docusaurus/plugin-client-redirects',
			{
				redirects: [
					{
						from: '/docs/getting-started',
						to: '/getting-started'
					},
					{
						from: '/docs/advanced/linting',
						to: '/robojs/linting'
					},
					{
						from: '/docs/advanced/typescript',
						to: '/robojs/typescript'
					},
					{
						from: '/discord-activities',
						to: '/discord-activities/getting-started'
					},
					{
						from: '/discord-activities/overview',
						to: '/discord-activities/getting-started'
					},
					{
						from: '/docs/basics/commands',
						to: '/discord-bots/commands'
					},
					{
						from: '/docs/basics/context-menu',
						to: '/discord-bots/context-menu'
					},
					{
						from: '/docs/advanced/debugging',
						to: '/discord-bots/debug'
					},
					{
						from: '/docs/basics/events',
						to: '/discord-bots/events'
					},
					{
						from: '/docs/adding-to-server',
						to: '/discord-bots/invite'
					},
					{
						from: '/docs/basics/middleware',
						to: '/discord-bots/middleware'
					},
					{
						from: '/docs/migrating',
						to: '/discord-bots/migrate'
					},
					{
						from: '/docs/basics/overview',
						to: '/discord-bots/getting-started'
					},
					{
						from: '/discord-bots',
						to: '/discord-bots/getting-started'
					},
					{
						from: '/discord-bots/overview',
						to: '/discord-bots/getting-started'
					},
					{
						from: '/docs/basics/sage',
						to: '/discord-bots/sage'
					},
					{
						from: '/docs/basics/secrets',
						to: '/discord-bots/secrets'
					},
					{
						from: '/docs/hosting',
						to: '/hosting/roboplay'
					},
					{
						from: '/docs/advanced/command-line',
						to: '/cli/robo'
					},
					{
						from: '/docs/advanced/logger',
						to: '/robojs/logger'
					},
					{
						from: '/docs/basics/flashcore',
						to: '/robojs/flashcore'
					},
					{
						from: '/docs/advanced/configuration',
						to: '/robojs/config'
					},
					{
						from: '/docs/advanced/how-it-works',
						to: '/robojs/internals'
					},
					{
						from: '/docs/advanced/modules',
						to: '/robojs/modules'
					},
					{
						from: '/docs/advanced/plugins',
						to: '/plugins/overview'
					},
					{
						from: '/docs/advanced/portal',
						to: '/robojs/portal'
					},
					{
						from: '/docs/basics/states',
						to: '/robojs/state'
					},
					{
						from: '/robojs/cli',
						to: '/cli/overview'
					},
					{
						from: '/robojs/plugins',
						to: '/plugins/overview'
					}
				]
			}
		],
		[
			'docusaurus-plugin-remote-content',
			{
				name: 'plugin-docs',
				sourceBaseUrl: 'https://raw.githubusercontent.com/Wave-Play/robo.js/main/',
				outDir: 'docs',
				documents: [
					// Plugins
					'packages/plugin-ai/README.md',
					'packages/plugin-ai-voice/README.md',
					'packages/@robojs/analytics/README.md',
					'packages/plugin-api/README.md',
					'packages/plugin-better-stack/README.md',
					'packages/plugin-devtools/README.md',
					'packages/plugin-maintenance/README.md',
					'packages/plugin-modtools/README.md',
					'packages/@robojs/patch/README.md',
					'packages/plugin-sync/README.md',
					'packages/@robojs/trpc/README.md',

					// Templates
					'templates/discord-activities/react-colyseus-ts/README.md',
					'templates/discord-activities/react-js/README.md',
					'templates/discord-activities/react-multiplayer-video-ts/README.md',
					'templates/discord-activities/react-music-proxy-ts/README.md',
					'templates/discord-activities/react-tailwind-shadcn-ts/README.md',
					'templates/discord-activities/react-tailwind-ts/README.md',
					'templates/discord-activities/react-trpc-ts/README.md',
					'templates/discord-activities/react-ts/README.md',
					'templates/discord-activities/unity/README.md',
					'templates/discord-activities/vanilla-js/README.md',
					'templates/discord-activities/vanilla-ts/README.md',
					'templates/discord-bots/ai-chatbot-ts/README.md',
					'templates/discord-bots/analytics-ts/README.md',
					'templates/discord-bots/economy-ts/README.md',
					'templates/discord-bots/mongodb-ts/README.md',
					'templates/discord-bots/postgres-ts/README.md',
					'templates/discord-bots/prisma-ts/README.md',
					'templates/discord-bots/purrth-vader-ts/README.md',
					'templates/discord-bots/starter-js/README.md',
					'templates/discord-bots/starter-ts/README.md',
					'templates/plugins/starter-js/README.md',
					'templates/web-apps/react-js/README.md',
					'templates/web-apps/react-ts/README.md'
				],
				modifyContent: (filename, content) => {
					/*if (['CONTRIBUTING.md'].includes(filename)) {
						// Return up to the "## Contributors" section
						let newContent = content.split('## Contributors')[0]

						// Remove all <!-- --> comments
						newContent = newContent.replace(/<!--[\s\S]*?-->/g, '')

						console.log(`Modified content:`, newContent)
						return newContent
					}*/

					if (filename.includes('packages/plugin-')) {
						// Normalize filename
						let newFilename = 'plugins/' + filename.split('packages/plugin-')[1].replace('/README.md', '.mdx')

						// Some plugins need renamed
						if (newFilename === 'plugins/api.mdx') {
							newFilename = 'plugins/server.mdx'
						} else if (newFilename === 'plugins/devtools.mdx') {
							newFilename = 'plugins/dev.mdx'
						} else if (newFilename === 'plugins/modtools.mdx') {
							newFilename = 'plugins/moderation.mdx'
						}

						// Remove content above # pluginName
						const pluginName = newFilename.replace('plugins/', '@robojs/').replace('.mdx', '')
						const token = `# ${pluginName}`
						let newContent = content

						if (content.includes(token)) {
							newContent = token + content.split(token)[1]
						}

						// Remove emojis from headings
						newContent = removeEmojisFromHeadings(newContent)

						// Convert markdown links to Card components
						newContent = convertLinksToCards(newContent)

						// Replace bash code blocks with Terminal components
						newContent = replaceBashCodeBlocks(newContent)

						// Add copy disclaimer at the end of the content
						const head = `import { Card } from '@site/src/components/shared/Card'\nimport { CardContainer } from '@site/src/components/shared/CardContainer'\nimport { Terminal } from '@site/src/components/shared/Terminal'\n\n`
						const linkUrl = 'https://github.com/Wave-Play/robo.js/tree/main/' + filename.replace('/README.md', '')
						const link = `\n\n## More on GitHub\n\n<CardContainer><Card href="${linkUrl}" title="🔗 GitHub Repository" description="Explore source code on GitHub."/></CardContainer>\n`
						newContent = head + newContent + link

						return {
							content: newContent,
							filename: newFilename
						}
					} else if (filename.includes('packages/@robojs/')) {
						// Normalize filename
						let newFilename = 'plugins/' + filename.replace('packages/@robojs/', '').replace('/README.md', '.mdx')

						// Remove content above # pluginName
						const pluginName = newFilename.replace('plugins/', '').replace('.mdx', '')
						const token = `# @robojs/${pluginName}`
						let newContent = content

						if (content.includes(token)) {
							newContent = token + content.split(token)[1]
						}

						// Remove emojis from headings
						newContent = removeEmojisFromHeadings(newContent)

						// Convert markdown links to Card components
						newContent = convertLinksToCards(newContent)

						// Replace bash code blocks with Terminal components
						newContent = replaceBashCodeBlocks(newContent)

						// Add copy disclaimer at the end of the content
						const head = `import { Card } from '@site/src/components/shared/Card'\nimport { CardContainer } from '@site/src/components/shared/CardContainer'\nimport { Terminal } from '@site/src/components/shared/Terminal'\n\n`
						const linkUrl = 'https://github.com/Wave-Play/robo.js/tree/main/' + filename.replace('/README.md', '')
						const link = `\n\n## More on GitHub\n\n<CardContainer><Card href="${linkUrl}" title="🔗 GitHub Repository" description="Explore source code on GitHub."/></CardContainer>\n`
						newContent = head + newContent + link

						return {
							content: newContent,
							filename: newFilename
						}
					} else if (filename.includes('templates/')) {
						// Normalize filename
						let newFilename = 'templates/' + filename.split('templates/')[1].replace('/README.md', '.mdx')

						// Remove everything above first heading
						const token = '#'
						let newContent = content

						if (content.includes(token)) {
							newContent = content.substring(content.indexOf(token) + 1)
							newContent = token + newContent.substring(newContent.indexOf('-') + 1)
						}

						// Remove emojis from headings
						newContent = removeEmojisFromHeadings(newContent)

						// Also remove table of contents altogether (keep before and after)
						if (newContent.includes('## Table of Contents')) {
							const before = newContent.substring(0, newContent.indexOf('## Table of Contents'))
							const after = newContent.substring(newContent.indexOf('## Table of Contents') + 1)
							newContent = before + after.substring(after.indexOf('##'))
						}

						// Remove Quick Links
						newContent = newContent.replace('##  Quick Links', '')

						// Convert markdown links to Card components
						newContent = convertLinksToCards(newContent)

						// Replace bash code blocks with Terminal components
						newContent = replaceBashCodeBlocks(newContent)

						// Add copy disclaimer at the end of the content
						const head = `import { Card } from '@site/src/components/shared/Card'\nimport { CardContainer } from '@site/src/components/shared/CardContainer'\nimport { Terminal } from '@site/src/components/shared/Terminal'\n\n`
						const linkUrl = 'https://github.com/Wave-Play/robo.js/tree/main/' + filename.replace('/README.md', '')
						const link = `\n\n## Learn More\n\n<CardContainer><Card href="/templates/overview" title="📦 Explore Templates" description="Discover more templates for a quick start."/><Card href="${linkUrl}" title="🔗 GitHub Repository" description="Explore source code on GitHub."/></CardContainer>\n`
						newContent = head + newContent + link

						return {
							content: newContent,
							filename: newFilename
						}
					}

					return undefined
				}
			}
		]
	],

	presets: [
		[
			'classic',
			/** @type {import('@docusaurus/preset-classic').Options} */
			({
				docs: {
					editUrl: 'https://github.com/Wave-Play/robo.js/edit/main/docs/',
					routeBasePath: '/',
					showLastUpdateAuthor: true,
					showLastUpdateTime: true,
					sidebarPath: require.resolve('./sidebars.js')
				},
				theme: {
					customCss: require.resolve('./src/css/custom.css')
				}
			})
		]
	],

	scripts: [
		{
			src: 'https://plausible.io/js/script.js',
			defer: true,
			'data-domain': 'docs.roboplay.dev'
		}
	],

	markdown: {
		parseFrontMatter: async (params) => {
			const result = await params.defaultParseFrontMatter(params)
			const path = params.filePath.replace(process.cwd(), '')

			// Dynamically generate social card image for docs
			if (path.startsWith('/docs')) {
				const cleanPath = path.replace('/docs', '').replace('.mdx', '').replace('.md', '')
				result.frontMatter.image = 'https://preview.robojs.dev?path=' + cleanPath
			}

			return result
		}
	},

	themeConfig:
		/** @type {import('@docusaurus/preset-classic').ThemeConfig} */
		({
			// Replace with your project's social card
			image: 'img/logo.png',
			colorMode: {
				defaultMode: 'dark'
			},
			announcementBar: {
				id: 'hacktoberfest-2024',
				content:
					'<a href="https://roboplay.dev/hacktoberfest">✨🎃 <strong>Hacktoberfest 2024 - Build stuff, win free swag</strong> 🎃✨</a>',
				backgroundColor: 'rgb(0, 49, 0)',
				isCloseable: false,
				textColor: 'rgb(230, 246, 230)'
			},
			navbar: {
				title: 'Robo.js',
				logo: {
					alt: 'Sage Logo',
					src: 'img/logo.png'
				},
				items: [
					{
						type: 'docSidebar',
						sidebarId: 'tutorialSidebar',
						position: 'left',
						label: 'Docs'
					},
					{ to: '/hosting/overview', label: 'Hosting', position: 'left' },
					{ to: '/playground', label: 'Playground', position: 'left' },
					{ to: '/plugins/directory', label: 'Plugins', position: 'left' },
					{ to: '/templates/overview', label: 'Templates', position: 'left' },
					{
						href: 'https://dev.to/waveplay',
						label: 'Tutorials',
						position: 'left'
					},
					/*{
						href: 'https://roboplay.dev/hacktoberfest',
						label: '✨🎃 Hacktoberfest 🎃✨',
						position: 'left'
					},*/
					{
						href: 'https://roboplay.dev/discord',
						position: 'right',
						className: 'header-discord-link',
						'aria-label': 'Discord'
					},
					{
						href: 'https://github.com/Wave-Play/robo.js',
						position: 'right',
						className: 'header-github-link',
						'aria-label': 'GitHub'
					}
				]
			},
			// footer: {
			// 	logo: {
			// 		alt: 'Sage Logo',
			// 		src: '/img/logo.png',
			// 		width: 55,
			// 		height: 55
			// 	},
			// 	copyright: `MIT © ${new Date().getFullYear()} <strong>Robo.js</strong> By <strong>WavePlay</strong>`
			// },
			prism: {
				theme: lightCodeTheme,
				darkTheme: darkCodeTheme
			}
		})
}

module.exports = config

/**
 * Converts markdown links to Card components.
 */
function convertLinksToCards(markdown) {
	const linkRegex = /(?:\*\*➞\*\*|\-\s+)\[([^\]]+)\]\(([^)]+)\)/g
	const sections = markdown.split(/\n\s*\n/)

	return sections
		.map((section) => {
			let cards = []

			// Replace links in the section and collect them in the cards array
			const newSection = section.replace(linkRegex, (_, title, href) => {
				// Remove markdown bold from the title and split the emoji from the text
				const cleanTitle = title.replace(/\*\*(.*?)\*\*/, '$1')
				const [emoji, ...descriptionParts] = cleanTitle.split(':')
				const description = descriptionParts.join(':').trim()
				return `<Card href="${href}" title="${emoji.trim()}" description="${description}"/>`
			})

			// Aggregate cards into a CardContainer if any replacements were made
			if (newSection !== section) {
				cards.push(newSection)
				return `<CardContainer>${cards.join('')}</CardContainer>`
			}

			return section
		})
		.join('\n\n')
}

/**
 * Removes emojis from headings.
 */
function removeEmojisFromHeadings(markdownString) {
	const headerRegex = /^(##\s*[^#\n]*\n)/gm
	const emojiRegex =
		/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu

	return markdownString.replace(headerRegex, (header) => {
		return header.replace(emojiRegex, '')
	})
}

/**
 * Replaces bash code blocks with Terminal components.
 */
function replaceBashCodeBlocks(markdownString) {
	const codeBlockRegex = /```bash\s*([\s\S]*?)```/g

	const newMarkdown = markdownString.replace(codeBlockRegex, (_match, codeContent) => {
		let replacement = ''
		codeContent = codeContent.trim()

		if (codeContent.startsWith('npx create-robo')) {
			const newCode = codeContent.replace(/^npx create-robo\s*/, '')
			replacement = `<Terminal create>{\`${newCode}\`}</Terminal>`
		} else if (codeContent.startsWith('npx')) {
			const newCode = codeContent.replace(/^npx\s*/, '')
			replacement = `<Terminal execute>{\`${newCode}\`}</Terminal>`
		} else {
			replacement = `<Terminal>{\`${codeContent}\`}</Terminal>`
		}

		return replacement
	})

	return newMarkdown
}
