import React, { forwardRef, useEffect, useState } from 'react'
import styles from '../../pages/templates.module.css'
import { Template, Templates } from '@site/src/data/templates'
import { useTemplateFilters } from '@site/src/hooks/useTemplateFilters'
import { TemplateGridItem } from './TemplateGridItem'
import { VirtuosoGrid } from 'react-virtuoso'

const gridComponents = {
	List: forwardRef(({ style, children, ...props }: any, ref) => (
		<div
			ref={ref}
			{...props}
			style={{
				display: 'flex',
				flexWrap: 'wrap',
				gap: 'var(--templates-container-gap)',
				...style
			}}
		>
			{children}
		</div>
	)),
	Item: ({ children, ...props }: any) => (
		<div
			{...props}
			style={{
				width: 'var(--template-item-width)'
			}}
		>
			{children}
		</div>
	)
} as any

export const TemplateGrid = () => {
	const { filter, searchQuery } = useTemplateFilters()
	const [templates, setTemplates] = useState<Template[]>(Templates)

	useEffect(() => {
		let templates = Templates

		if (filter.value !== 'all-templates') {
			templates = Templates.filter((template) => {
				return filter.tags.some((tag) => template.tags.includes(tag))
			})
		}
		if (searchQuery) {
			const query = searchQuery.toLowerCase().trim()
			templates = templates.filter((template) => {
				const title = template.title.toLowerCase().trim()
				const description = template.description.toLowerCase().trim()
				const author = template.author?.toLowerCase().trim()

				return title.includes(query) || description.includes(query) || author?.includes(query)
			})
		}

		setTemplates(templates)
	}, [filter, searchQuery])

	return (
		<VirtuosoGrid
			key={templates.length}
			className={styles.grid}
			components={gridComponents}
			useWindowScroll
			totalCount={templates.length}
			itemContent={(index) => <TemplateGridItem key={templates[index].href} template={templates[index]} />}
		/>
	)
}
