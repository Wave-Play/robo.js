import React, { useEffect } from 'react'
import styles from '../../pages/templates.module.css'
import { Filters } from '@site/src/data/templates'
import { useTemplateFilters } from '@site/src/hooks/useTemplateFilters'
import { mdiMagnify } from '@mdi/js'
import Icon from '@mdi/react'
import { TemplateFiltersItem } from './TemplateFiltersItem'
import type { TemplateFilter } from '@site/src/data/templates'

export const TemplateFilters = () => {
	const { filter: selectedFilter, setFilter, setSearchQuery } = useTemplateFilters()

	// Apply filter from URL if available
	useEffect(() => {
		const url = new URL(window.location.href)
		const filter = url.searchParams.get('filter')
		const found = Filters.find((f) => f.value === filter)

		if (found) {
			setFilter(found)
		}
	}, [])

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
					<TemplateFiltersItem
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
