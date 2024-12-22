import React, { useEffect, useRef } from 'react'
import styles from '../../pages/templates.module.css'
import { useTemplateFilters } from '@site/src/hooks/useTemplateFilters'
import { mdiMagnify } from '@mdi/js'
import Icon from '@mdi/react'

export const TemplateSearch = () => {
	const { setSearchQuery } = useTemplateFilters()
	const searchRef = useRef<HTMLInputElement>(null)

	// Apply search from URL if available
	useEffect(() => {
		const url = new URL(window.location.href)
		const search = url.searchParams.get('search')

		if (search) {
			setSearchQuery(search)
			searchRef.current?.focus()
			searchRef.current?.setAttribute('value', search)
			searchRef.current?.setSelectionRange(search.length, search.length)
		}
	}, [])

	const onSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
		setSearchQuery(e.target.value)

		// Update URL query
		const url = new URL(window.location.href)
		if (!e.target.value?.trim()) {
			url.searchParams.delete('search')
		} else {
			url.searchParams.set('search', e.target.value)
		}
		window.history.pushState({}, '', url.toString())
	}

	return (
		<div className={styles.searchContainer}>
			<Icon className={styles.searchIcon} path={mdiMagnify} size={'20px'} color="rgb(142, 141, 145)" />
			<input ref={searchRef} className={styles.searchInput} onChange={onSearch} placeholder="Search..." type="text" />
		</div>
	)
}
