/* eslint-disable @typescript-eslint/no-var-requires */
import React from 'react'
import clsx from 'clsx'
import styles from './styles.module.css'
import easy from '@site/static/img/undraw_docusaurus_mountain.svg'
import focus from '@site/static/img/undraw_docusaurus_tree.svg';
import powered from '@site/static/img/undraw_docusaurus_react.svg'
const FeatureList = [
	{
		title: 'Easy to Use',
		Svg: easy
	},
	{
		title: 'Focus on What Matters',
		Svg: focus
	},
	{
		title: 'Powered by Discord.JS',
		Svg: powered
	}
]

function Feature({ Svg, title }) {
	return (
		<div className={clsx('col col--4')}>
			<div className="text--center">
				<Svg className={styles.featureSvg} role="img" />
			</div>
			<div className="text--center padding-horiz--md">
				<h3>{title}</h3>
			</div>
		</div>
	)
}

export default function HomepageFeatures() {
	return (
		<section className={styles.features}>
			<div className="container">
				<div className="row">
					{FeatureList.map((props, idx) => (
						<Feature key={idx} {...props} />
					))}
				</div>
			</div>
		</section>
	)
}
