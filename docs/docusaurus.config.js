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
						from: '/docs/hosting',
						to: '/docs/hosting/roboplay'
					}
				]
			}
		]
	],

	presets: [
		[
			'classic',
			/** @type {import('@docusaurus/preset-classic').Options} */
			({
				docs: {
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
						href: 'https://discord.gg/fASAKnJxUP',
						label: 'Discord Community',
						position: 'left'
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
