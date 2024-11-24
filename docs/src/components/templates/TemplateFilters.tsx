import React from 'react'
import styles from '../../pages/templates.module.css'
import { Filters } from '@site/src/data/templates'
import { useTemplateFilters } from '@site/src/hooks/useTemplateFilters'
import { mdiMagnify } from '@mdi/js'
import Icon from '@mdi/react'
import type { TemplateFilter } from '@site/src/data/templates'

export const TemplateFilters = () => {
	const { filter: selectedFilter, setFilter, setSearchQuery } = useTemplateFilters()

	const onClickFilter = (filter: TemplateFilter) => {
		setFilter(filter)
	}

	return (
		<div className={styles.filterBar}>
			<h3 className={styles.filterTitle}>Filter Templates</h3>
			<div className={styles.searchContainer}>
				<Icon className={styles.searchIcon} path={mdiMagnify} size={'20px'} color="rgb(142, 141, 145)" />
				<input
					className={styles.searchInput}
					onChange={(e) => setSearchQuery(e.target.value)}
					placeholder="Search..."
					type="text"
				/>
			</div>
			<div className={styles.filterOptions}>
				{Filters.map((filter) => (
					<TemplateFilterItem
						key={filter.value}
						filter={filter}
						onClick={onClickFilter}
						selected={selectedFilter.value === filter.value}
					/>
				))}
			</div>
		</div>
	)
}

interface TemplateFilterItemProps {
	filter: TemplateFilter
	onClick?: (filter: TemplateFilter) => void
	selected?: boolean
}

const TemplateFilterItem = (props: TemplateFilterItemProps) => {
	const { filter, onClick, selected } = props

	return (
		<button
			key={filter.value}
			className={styles.filterOption + (selected ? ' ' + styles.filterOptionSelected : '')}
			onClick={() => onClick?.(filter)}
		>
			<Icon path={filter.icon} size={1} color={selected ? '#00BFA5' : 'rgb(142, 141, 145)'} />
			<span className={styles.filterOptionLabel + (selected ? ' ' + styles.filterOptionLabelSelected : '')}>
				{filter.name}
			</span>
		</button>
	)
}
