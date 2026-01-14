import { useState, useEffect, useMemo } from 'react'
import { DropdownContainer, ListItem, ListItemHeader, ListItemSeparator } from '../base'
import type { StageMember, StageRole } from '../../types/stage'
import styles from './MentionAutocomplete.module.css'

export interface MentionItem {
	type: 'user' | 'role' | 'everyone' | 'here'
	id?: string
	name: string
	color?: string
}

interface MentionAutocompleteProps {
	search: string
	members: StageMember[]
	roles: StageRole[]
	onSelect: (mention: MentionItem) => void
	onClose: () => void
}

const MAX_RESULTS = 10

export function MentionAutocomplete({ search, members, roles, onSelect, onClose }: MentionAutocompleteProps) {
	const [highlightedIndex, setHighlightedIndex] = useState(0)

	// Build flat list of all items for keyboard navigation
	const allItems = useMemo(() => {
		const items: MentionItem[] = []
		const searchLower = search.toLowerCase()

		// Special mentions (@everyone, @here)
		if ('everyone'.includes(searchLower)) {
			items.push({ type: 'everyone', name: 'everyone' })
		}
		if ('here'.includes(searchLower)) {
			items.push({ type: 'here', name: 'here' })
		}

		// Filter and add roles (exclude @everyone since it's in Special section)
		const filteredRoles = roles
			.filter((role) => role.name !== '@everyone' && role.name.toLowerCase().includes(searchLower))
			.slice(0, MAX_RESULTS)
		for (const role of filteredRoles) {
			items.push({
				type: 'role',
				id: role.id,
				name: role.name,
				color: role.color ? `#${role.color.toString(16).padStart(6, '0')}` : undefined
			})
		}

		// Filter and add members
		const filteredMembers = members
			.filter(
				(member) =>
					member.nick?.toLowerCase().includes(searchLower) ||
					member.user?.username?.toLowerCase().includes(searchLower)
			)
			.slice(0, MAX_RESULTS)
		for (const member of filteredMembers) {
			items.push({
				type: 'user',
				id: member.user?.id,
				name: member.nick || member.user?.username || 'Unknown User'
			})
		}

		return items
	}, [search, members, roles])

	// Reset highlighted index when search changes
	useEffect(() => {
		setHighlightedIndex(0)
	}, [search])

	// Keyboard navigation
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'ArrowDown') {
				e.preventDefault()
				setHighlightedIndex((i) => Math.min(i + 1, allItems.length - 1))
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault()
				setHighlightedIndex((i) => Math.max(i - 1, 0))
			}
			if (e.key === 'Enter' || e.key === 'Tab') {
				e.preventDefault()
				const item = allItems[highlightedIndex]
				if (item) {
					onSelect(item)
				}
			}
			if (e.key === 'Escape') {
				e.preventDefault()
				onClose()
			}
		}

		document.addEventListener('keydown', handler)
		return () => document.removeEventListener('keydown', handler)
	}, [allItems, highlightedIndex, onSelect, onClose])

	// Separate items by type for rendering with headers
	const specialItems = allItems.filter((i) => i.type === 'everyone' || i.type === 'here')
	const roleItems = allItems.filter((i) => i.type === 'role')
	const memberItems = allItems.filter((i) => i.type === 'user')

	// Calculate flat index offset for each section
	const getGlobalIndex = (sectionItems: MentionItem[], localIndex: number): number => {
		if (sectionItems === specialItems) return localIndex
		if (sectionItems === roleItems) return specialItems.length + localIndex
		return specialItems.length + roleItems.length + localIndex
	}

	if (allItems.length === 0) {
		return (
			<DropdownContainer className={styles.container} role="listbox" placement="top-start">
				<div className={styles.empty}>No matches found</div>
			</DropdownContainer>
		)
	}

	return (
		<DropdownContainer className={styles.container} maxHeight={300} role="listbox" placement="top-start">
			{specialItems.length > 0 && (
				<>
					<ListItemHeader className={styles.header}>Special</ListItemHeader>
					<div className={styles.list}>
						{specialItems.map((item, index) => (
							<ListItem
								key={item.type}
								label={`@${item.name}`}
								isHighlighted={getGlobalIndex(specialItems, index) === highlightedIndex}
								onClick={() => onSelect(item)}
								onMouseEnter={() => setHighlightedIndex(getGlobalIndex(specialItems, index))}
								icon={<AtIcon className={styles.specialIcon} />}
							/>
						))}
					</div>
				</>
			)}

			{roleItems.length > 0 && (
				<>
					{specialItems.length > 0 && <ListItemSeparator />}
					<ListItemHeader className={styles.header}>Roles</ListItemHeader>
					<div className={styles.list}>
						{roleItems.map((item, index) => (
							<ListItem
								key={item.id}
								label={`@${item.name}`}
								isHighlighted={getGlobalIndex(roleItems, index) === highlightedIndex}
								onClick={() => onSelect(item)}
								onMouseEnter={() => setHighlightedIndex(getGlobalIndex(roleItems, index))}
								icon={<RoleIcon color={item.color} />}
							/>
						))}
					</div>
				</>
			)}

			{memberItems.length > 0 && (
				<>
					{(specialItems.length > 0 || roleItems.length > 0) && <ListItemSeparator />}
					<ListItemHeader className={styles.header}>Members</ListItemHeader>
					<div className={styles.list}>
						{memberItems.map((item, index) => (
							<ListItem
								key={item.id}
								label={`@${item.name}`}
								isHighlighted={getGlobalIndex(memberItems, index) === highlightedIndex}
								onClick={() => onSelect(item)}
								onMouseEnter={() => setHighlightedIndex(getGlobalIndex(memberItems, index))}
								icon={<UserIcon />}
							/>
						))}
					</div>
				</>
			)}
		</DropdownContainer>
	)
}

function AtIcon({ className }: { className?: string }) {
	return (
		<div className={`${styles.iconWrapper} ${className || ''}`}>
			<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
				<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10h5v-2h-5c-4.34 0-8-3.66-8-8s3.66-8 8-8 8 3.66 8 8v1.43c0 .79-.71 1.57-1.5 1.57s-1.5-.78-1.5-1.57V12c0-2.76-2.24-5-5-5s-5 2.24-5 5 2.24 5 5 5c1.38 0 2.64-.56 3.54-1.47.65.89 1.77 1.47 2.96 1.47 1.97 0 3.5-1.6 3.5-3.57V12c0-5.52-4.48-10-10-10zm0 13c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z" />
			</svg>
		</div>
	)
}

function RoleIcon({ color }: { color?: string }) {
	return (
		<div className={styles.iconWrapper} style={{ backgroundColor: color || 'var(--interactive-default)' }}>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="white">
				<path d="M14 8c0-2.21-1.79-4-4-4S6 5.79 6 8s1.79 4 4 4 4-1.79 4-4zm3 2v2h6v-2h-6zM2 18v2h16v-2c0-2.66-5.33-4-8-4s-8 1.34-8 4z" />
			</svg>
		</div>
	)
}

function UserIcon() {
	return (
		<div className={styles.iconWrapper}>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
				<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
			</svg>
		</div>
	)
}
