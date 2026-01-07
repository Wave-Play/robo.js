import { useState } from 'react'
import { useDropdown, DropdownContainer, ListItem } from '../base'
import styles from './SelectMenu.module.css'

// Discord select menu component types
const ComponentType = {
	StringSelect: 3,
	UserSelect: 5,
	RoleSelect: 6,
	MentionableSelect: 7,
	ChannelSelect: 8
} as const

interface SelectEmoji {
	id?: string | null
	name?: string | null
	animated?: boolean
}

interface SelectOption {
	label: string
	value: string
	description?: string
	emoji?: SelectEmoji
	default?: boolean
}

interface SelectMenuComponentData {
	type: 3 | 5 | 6 | 7 | 8
	custom_id: string
	options?: SelectOption[]
	placeholder?: string
	min_values?: number
	max_values?: number
	disabled?: boolean
}

interface SelectMenuProps {
	select: SelectMenuComponentData
	onSelect: (values: string[]) => Promise<void>
}

function getEmojiUrl(emoji: SelectEmoji): string {
	if (!emoji.id) return ''
	const ext = emoji.animated ? 'gif' : 'png'
	return `https://cdn.discordapp.com/emojis/${emoji.id}.${ext}`
}

export function SelectMenu({ select, onSelect }: SelectMenuProps) {
	const { containerRef, isOpen, toggle, close } = useDropdown<HTMLDivElement>()
	const [selected, setSelected] = useState<string[]>(() => {
		// Initialize with default options
		return select.options?.filter((o) => o.default).map((o) => o.value) || []
	})
	const [isLoading, setIsLoading] = useState(false)

	const minValues = select.min_values ?? 1
	const maxValues = select.max_values ?? 1
	const isSingleSelect = maxValues === 1

	const handleSelect = async (value: string) => {
		if (select.disabled || isLoading) return

		let newSelected: string[]

		if (isSingleSelect) {
			newSelected = [value]
		} else {
			if (selected.includes(value)) {
				newSelected = selected.filter((v) => v !== value)
			} else if (selected.length < maxValues) {
				newSelected = [...selected, value]
			} else {
				return // Can't select more
			}
		}

		setSelected(newSelected)

		// Submit if single-select or reached min threshold
		if (isSingleSelect || newSelected.length >= minValues) {
			close()
			setIsLoading(true)
			try {
				await onSelect(newSelected)
			} finally {
				setIsLoading(false)
				// Reset selection after submission for single-select
				if (isSingleSelect) {
					setSelected([])
				}
			}
		}
	}

	// Get placeholder based on select type
	const getPlaceholder = (): string => {
		if (select.placeholder) return select.placeholder

		switch (select.type) {
			case ComponentType.UserSelect:
				return 'Select a user'
			case ComponentType.RoleSelect:
				return 'Select a role'
			case ComponentType.ChannelSelect:
				return 'Select a channel'
			case ComponentType.MentionableSelect:
				return 'Select a user or role'
			default:
				return 'Make a selection'
		}
	}

	// For entity selects without options, show placeholder
	const options = select.options || []
	const hasOptions = options.length > 0

	// Get display text for trigger
	const getDisplayText = (): string => {
		if (selected.length === 0) return getPlaceholder()

		const selectedOptions = options.filter((o) => selected.includes(o.value))
		return selectedOptions.map((o) => o.label).join(', ')
	}

	const triggerClasses = [
		styles.trigger,
		select.disabled ? styles.disabled : '',
		isOpen ? styles.open : '',
		isLoading ? styles.loading : ''
	]
		.filter(Boolean)
		.join(' ')

	const handleTriggerClick = () => {
		if (!select.disabled && !isLoading && hasOptions) {
			toggle()
		}
	}

	const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault()
			handleTriggerClick()
		}
	}

	return (
		<div className={styles.container} ref={containerRef}>
			<div
				className={triggerClasses}
				onClick={handleTriggerClick}
				role="button"
				tabIndex={select.disabled ? -1 : 0}
				aria-haspopup="listbox"
				aria-expanded={isOpen}
				onKeyDown={handleTriggerKeyDown}
			>
				<span className={selected.length > 0 ? styles.selectedText : styles.placeholder}>{getDisplayText()}</span>
				<ChevronIcon className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`} />
			</div>

			{isOpen && hasOptions && (
				<DropdownContainer maxHeight={300} className={styles.dropdown}>
					{options.map((option) => {
						const isOptionSelected = selected.includes(option.value)

						return (
							<ListItem
								key={option.value}
								label={option.label}
								description={option.description}
								isSelected={isOptionSelected}
								onClick={() => handleSelect(option.value)}
								icon={
									option.emoji && (
										<span className={styles.optionEmoji}>
											{option.emoji.id ? (
												<img src={getEmojiUrl(option.emoji)} alt="" className={styles.emojiImage} />
											) : (
												option.emoji.name
											)}
										</span>
									)
								}
								rightContent={isOptionSelected ? <CheckIcon /> : undefined}
							/>
						)
					})}
				</DropdownContainer>
			)}
		</div>
	)
}

// SVG Icons
function ChevronIcon({ className }: { className?: string }) {
	return (
		<svg className={className} viewBox="0 0 24 24" width="20" height="20">
			<path fill="currentColor" d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z" />
		</svg>
	)
}

function CheckIcon() {
	return (
		<svg viewBox="0 0 24 24" width="20" height="20" style={{ color: 'var(--brand-primary)' }}>
			<path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
		</svg>
	)
}

export { ComponentType }
export type { SelectMenuComponentData, SelectOption, SelectEmoji }
