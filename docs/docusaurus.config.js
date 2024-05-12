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
						to: '/create-robo/linting'
					},
					{
						from: '/docs/advanced/typescript',
						to: '/create-robo/typescript'
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
						to: '/discord-bots/overview'
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
						to: '/robojs/cli'
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
						to: '/robojs/plugins'
					},
					{
						from: '/docs/advanced/portal',
						to: '/robojs/portal'
					},
					{
						from: '/docs/basics/sage',
						to: '/robojs/sage'
					},
					{
						from: '/docs/basics/states',
						to: '/robojs/state'
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
					'packages/plugin-ai/README.md',
					'packages/plugin-ai-voice/README.md',
					'packages/plugin-api/README.md',
					'packages/plugin-better-stack/README.md',
					'packages/plugin-devtools/README.md',
					'packages/plugin-maintenance/README.md',
					'packages/plugin-modtools/README.md',
					'packages/plugin-sync/README.md'
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

						// Add copy disclaimer at the end of the content
						const head = `import { Card } from '@site/src/components/shared/Card'\nimport { CardRow } from '@site/src/components/shared/CardRow'\n\n`
						const link = `\n\n---\n\n## More on GitHub\n\n<CardRow><Card href="https://dev.to/waveplay/how-to-build-a-discord-activity-easily-with-robojs-5bng" title="🔗 GitHub Repository" description="Explore source code on GitHub."/></CardRow>`
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
					routeBasePath: '/',
					sidebarPath: require.resolve('./sidebars.js')
					// Please change this to your repo.
					// Remove this to remove the "edit this page" links.
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

	themeConfig:
		/** @type {import('@docusaurus/preset-classic').ThemeConfig} */
		({
			// Replace with your project's social card
			image: 'img/logo.png',
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
					{ to: '/plugins', label: 'Plugins', position: 'left' },
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
