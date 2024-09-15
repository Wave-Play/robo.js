import React from 'react'
import clsx from 'clsx'
import Link from '@docusaurus/Link'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'
import Layout from '@theme/Layout'
import HomepageFeatures from '@site/src/components/HomepageFeatures'
import Footer from '@site/src/components/Footer/index.js'

import styles from './index.module.css'

function HomepageHeader() {
	const { siteConfig } = useDocusaurusContext()
	return (
		<header className={clsx('hero hero--primary', styles.heroBanner)}>
			<div className="container">
				<h1 className="hero__title">{siteConfig.title}</h1>
				<p className="hero__subtitle">Unlock Bot Brilliance with Robo.js!</p>
				<div className={styles.buttons}>
					<div>
						<Link className="button button--secondary button--lg" to="/getting-started">
							Get Started
						</Link>
					</div>
					<div lassName={styles.ghbtn}>
						<iframe
							className={styles.indexCtasGitHubButton}
							src="https://ghbtns.com/github-btn.html?user=Wave-play&amp;repo=robo.js&amp;type=star&amp;count=true&amp;size=large"
							width={160}
							height={30}
							title="GitHub Stars"
						/>
					</div>
				</div>
			</div>
		</header>
	)
}

export default function Home() {
	const { siteConfig } = useDocusaurusContext()
	return (
		<Layout title={`Hello from ${siteConfig.title}`} description="Description will go into a meta tag in <head />">
			<HomepageHeader />
			<main>
				<HomepageFeatures />
			</main>
			<Footer className={'footer-home'} />
		</Layout>
	)
}
