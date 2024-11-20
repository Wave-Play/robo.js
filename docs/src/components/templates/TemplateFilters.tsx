import React, { useState } from 'react'
import styles from '../../pages/templates.module.css'
import { mdiDotsGrid, mdiPowerPlug, mdiRobot, mdiShapePlus, mdiWeb } from '@mdi/js'
import Icon from '@mdi/react'

interface Filter {
	icon: string
	name: string
	value: string
}

const Filters: Filter[] = [
	{
		icon: mdiDotsGrid,
		name: 'All Templates',
		value: 'all-templates'
	},
	{
		icon: mdiShapePlus,
		name: 'Discord Activities',
		value: 'discord-activities'
	},
	{
		icon: mdiRobot,
		name: 'Discord Bots',
		value: 'discord-bots'
	},
	{
		icon: mdiPowerPlug,
		name: 'Plugins',
		value: 'plugins'
	},
	{
		icon: mdiWeb,
		name: 'Web Apps',
		value: 'web-apps'
	}
]

export const TemplateFilters = () => {
	const [selectedFilter, setSelectedFilter] = useState<Filter | null>(null)

	const onClickFilter = (filter: Filter) => {
		setSelectedFilter(filter)
	}

	return (
		<div className={styles.filterBar}>
			<h3 className={styles.filterTitle}>Filter Templates</h3>
			<div className={styles.searchContainer}>
				<input className={styles.searchInput} type="text" placeholder="Search Templates" />
			</div>
			<div className={styles.filterOptions}>
				{Filters.map((filter) => (
					<TemplateFilterItem
						key={filter.value}
						filter={filter}
						onClick={onClickFilter}
						selected={selectedFilter === filter}
					/>
				))}
			</div>
		</div>
	)
}

interface TemplateFilterItemProps {
	filter: Filter
	onClick?: (filter: Filter) => void
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
