import React from 'react'
import Footer from '../components/Footer'
import Layout from '@theme/Layout'
import styles from './templates.module.css'
import { TemplateFilters } from '../components/templates/TemplateFilters'
import { TemplateGrid } from '../components/templates/TemplateGrid'

export default function TemplatesPage() {
	return (
		<Layout title={`Playground`} description="Try out Robo.js in your browser!">
			<main className={styles.root}>
				<div className={styles.container}>
					<h1 className={styles.title}>
						Built with
						<br />
						Robo.js
					</h1>
					<p>
						Start with pre-built examples from <strong>WavePlay</strong> and our community.
					</p>
					<div className={styles.row}>
						<TemplateFilters />
						<TemplateGrid />
					</div>
					<Footer />
				</div>
			</main>
		</Layout>
	)
}