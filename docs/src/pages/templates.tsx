import React from 'react'
import Footer from '../components/Footer'
import Layout from '@theme/Layout'
import styles from './templates.module.css'
import { TemplateFilters } from '../components/templates/TemplateFilters'
import { TemplateGrid } from '../components/templates/TemplateGrid'
import { TemplateNew } from '../components/templates/TemplateNew'
import { Media } from '../components/shared/Breakpoints'
import { TemplateFiltersMobile } from '../components/templates/TemplateFiltersMobile'
import Head from '@docusaurus/Head'

const OgImage = 'https://robojs.dev/templates/og-image.png?c=2'

export default function TemplatesPage() {
	return (
		<Layout title={`Built with Robo.js`} description="Explore pre-built examples from WavePlay and our community. Kickstart your Discord Apps in seconds with the perfect template.">
			<Head>
				<meta property="og:image" content={OgImage} />
				<meta property="og:image:width" content="1200" />
				<meta property="og:image:height" content="600" />
				<meta property="twitter:image" content={OgImage} />
			</Head>
			<main className={styles.root}>
				<div className={styles.container}>
					<h1 className={styles.title}>
						Built with
						<br />
						Robo.js
					</h1>
					<p className={styles.subtitle}>
						Start with pre-built examples from <strong className="waveplay">WavePlay</strong> and our community.
					</p>
					<div className={styles.templatesContainer}>
						<Media lessThan="lg">
							<TemplateFiltersMobile />
						</Media>
						<Media greaterThanOrEqual="lg">
							<TemplateFilters />
						</Media>
						<TemplateGrid />
					</div>
					<TemplateNew />
					<Footer />
				</div>
			</main>
		</Layout>
	)
}
