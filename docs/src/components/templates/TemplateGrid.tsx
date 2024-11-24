import React, { useEffect, useState } from 'react'
import { ExaShape } from '../shared/ExaShape'
import styles from '../../pages/templates.module.css'
import { Template, Templates } from '@site/src/data/templates'
import Icon from '@mdi/react'
import {
	mdiHelp,
	mdiLanguageJavascript,
	mdiLanguageTypescript,
	mdiPowerPlug,
	mdiRobot,
	mdiShapePlus,
	mdiWeb
} from '@mdi/js'
import { useTemplateFilters } from '@site/src/hooks/useTemplateFilters'

export const TemplateGrid = () => {
	const { filter, searchQuery } = useTemplateFilters()
	const [templates, setTemplates] = useState<Template[]>(Templates)

	useEffect(() => {
		let templates = Templates

		if (filter.value !== 'all-templates') {
			templates = Templates.filter((template) => template.tags.includes(filter.value))
		}
		if (searchQuery) {
			const query = searchQuery.toLowerCase().trim()
			templates = templates.filter((template) => {
				const title = template.title.toLowerCase().trim()
				const description = template.description.toLowerCase().trim()

				return title.includes(query) || description.includes(query)
			})
		}

		setTemplates(templates)
	}, [filter, searchQuery])

	return (
		<div className={styles.grid}>
			{templates.map((template) => (
				<TemplateGridItem key={template.href} template={template} />
			))}
		</div>
	)
}

interface TemplateGridItemProps {
	template: Template
}

const TemplateGridItem = (props: TemplateGridItemProps) => {
	const { template } = props

	return (
		<div className={styles.templateItem}>
			<ExaShape defaultHeight={360} defaultWidth={432}>
				<div className={styles.template}>
					<ExaShape
						defaultHeight={243}
						highlight={false}
						innerColor="rgba(255, 255, 255, .04)"
						outerColor="transparent"
					>
						<div className={styles.templateImage} />
					</ExaShape>
					<h3 className={styles.templateTitle}>{template.title}</h3>
					<p className={styles.templateDescription}>{template.description}</p>
					<div className={styles.templateFooter}>
						{template.tags.map((tag) => getTagIcon(tag))}
						{template.author && (
							<span className={styles.templateAuthor}>
								By <strong>{template.author}</strong>
							</span>
						)}
					</div>
				</div>
			</ExaShape>
		</div>
	)
}

function getTagIcon(tag: string) {
	switch (tag) {
		case 'Discord Activity':
			return <Icon path={mdiShapePlus} color={'#25C2A0'} size={'20px'} />
		case 'Discord Bot':
			return <Icon path={mdiRobot} color={'#5865F2'} size={'20px'} />
		case 'JavaScript':
			return <Icon path={mdiLanguageJavascript} color={'#F7DF1E'} size={'20px'} />
		case 'Plugin':
			return <Icon path={mdiPowerPlug} size={'20px'} />
		case 'TypeScript':
			return <Icon path={mdiLanguageTypescript} color={'#3178C6'} size={'20px'} />
		case 'Web App':
			return <Icon path={mdiWeb} color={'#00BCD4'} size={'20px'} />
		default:
			return <Icon path={mdiHelp} size={'20px'} />
	}
}
