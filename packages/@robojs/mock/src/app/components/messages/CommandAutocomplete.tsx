import { useState, useEffect, useCallback, useMemo } from 'react'
import { CommandOptionInput } from './CommandOptionInput'
import { useStageData } from '../../hooks/useStageData'
import { DropdownContainer, ListItem, ListItemHeader } from '../base'
import type { StageApplicationCommand } from '../../types/stage'
import styles from './CommandAutocomplete.module.css'

interface CommandAutocompleteProps {
	search: string
	commands: StageApplicationCommand[]
	onSelect: (command: StageApplicationCommand, options: Record<string, unknown>) => void
	onClose: () => void
}

export function CommandAutocomplete({ search, commands, onSelect, onClose: _onClose }: CommandAutocompleteProps) {
	void _onClose // Reserved for future use
	// useStageData already filters members/channels by selected guild
	const { members, channels } = useStageData()
	const [selectedCommand, setSelectedCommand] = useState<StageApplicationCommand | null>(null)
	const [optionValues, setOptionValues] = useState<Record<string, unknown>>({})
	const [highlightedIndex, setHighlightedIndex] = useState(0)
	const [focusedOptionIndex, setFocusedOptionIndex] = useState(0)

	// Flatten commands with subcommands into individual entries
	// e.g., command "nested" with subcommand "sub" becomes "nested sub"
	const flattenedCommands = useMemo(() => {
		const result: StageApplicationCommand[] = []

		for (const cmd of commands) {
			const subcommands = cmd.options?.filter((opt) => opt.type === 1) || []
			const subcommandGroups = cmd.options?.filter((opt) => opt.type === 2) || []

			if (subcommands.length === 0 && subcommandGroups.length === 0) {
				// Regular command without subcommands
				result.push(cmd)
			} else {
				// Expand subcommands into separate entries
				for (const sub of subcommands) {
					result.push({
						id: `${cmd.id}_${sub.name}`,
						name: `${cmd.name} ${sub.name}`,
						description: sub.description || cmd.description,
						type: cmd.type,
						options: sub.options
					})
				}

				// Expand subcommand groups
				for (const group of subcommandGroups) {
					const groupSubs = group.options?.filter((opt) => opt.type === 1) || []
					for (const sub of groupSubs) {
						result.push({
							id: `${cmd.id}_${group.name}_${sub.name}`,
							name: `${cmd.name} ${group.name} ${sub.name}`,
							description: sub.description || group.description || cmd.description,
							type: cmd.type,
							options: sub.options
						})
					}
				}
			}
		}

		return result
	}, [commands])

	// Filter commands by search
	const filteredCommands = useMemo(() => {
		const searchLower = search.toLowerCase()
		return flattenedCommands.filter(
			(cmd) => cmd.name.toLowerCase().includes(searchLower) || cmd.description.toLowerCase().includes(searchLower)
		)
	}, [flattenedCommands, search])

	// Reset highlighted index when search changes
	useEffect(() => {
		setHighlightedIndex(0)
	}, [search])

	// Get non-subcommand options for the form
	const commandOptions = useMemo(() => {
		if (!selectedCommand?.options) return []
		// Filter out subcommand and subcommand groups (types 1 and 2)
		return selectedCommand.options.filter((opt) => opt.type > 2)
	}, [selectedCommand])

	// Check if all required options are filled
	const canSubmit = useMemo(() => {
		if (!selectedCommand) return false
		const requiredOptions = commandOptions.filter((opt) => opt.required)
		return requiredOptions.every((opt) => {
			const value = optionValues[opt.name]
			return value !== undefined && value !== ''
		})
	}, [selectedCommand, commandOptions, optionValues])

	// Handle keyboard navigation
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (selectedCommand) {
				// In option form mode
				if (e.key === 'Escape') {
					e.preventDefault()
					setSelectedCommand(null)
					setOptionValues({})
					setFocusedOptionIndex(0)
				}
				if (e.key === 'Tab' && !e.shiftKey) {
					e.preventDefault()
					setFocusedOptionIndex((i) => Math.min(i + 1, commandOptions.length - 1))
				}
				if (e.key === 'Tab' && e.shiftKey) {
					e.preventDefault()
					setFocusedOptionIndex((i) => Math.max(i - 1, 0))
				}
				if (e.key === 'Enter' && canSubmit) {
					e.preventDefault()
					onSelect(selectedCommand, optionValues)
				}
				return
			}

			// In command list mode
			if (e.key === 'ArrowDown') {
				e.preventDefault()
				setHighlightedIndex((i) => Math.min(i + 1, filteredCommands.length - 1))
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault()
				setHighlightedIndex((i) => Math.max(i - 1, 0))
			}
			if (e.key === 'Enter') {
				e.preventDefault()
				const cmd = filteredCommands[highlightedIndex]
				if (cmd) {
					handleCommandClick(cmd)
				}
			}
			if (e.key === 'Tab') {
				e.preventDefault()
				const cmd = filteredCommands[highlightedIndex]
				if (cmd) {
					handleCommandClick(cmd)
				}
			}
		}

		document.addEventListener('keydown', handler)
		return () => document.removeEventListener('keydown', handler)
	}, [filteredCommands, highlightedIndex, selectedCommand, commandOptions, canSubmit, optionValues, onSelect])

	const handleCommandClick = useCallback(
		(cmd: StageApplicationCommand) => {
			// Check if command has options (excluding subcommands)
			const editableOptions = cmd.options?.filter((opt) => opt.type > 2) || []
			if (editableOptions.length > 0) {
				setSelectedCommand(cmd)
				setFocusedOptionIndex(0)
			} else {
				onSelect(cmd, {})
			}
		},
		[onSelect]
	)

	const handleOptionChange = useCallback((optionName: string, value: unknown) => {
		setOptionValues((prev) => ({ ...prev, [optionName]: value }))
	}, [])

	const handleSubmit = useCallback(() => {
		if (selectedCommand && canSubmit) {
			onSelect(selectedCommand, optionValues)
		}
	}, [selectedCommand, canSubmit, optionValues, onSelect])

	const handleBack = useCallback(() => {
		setSelectedCommand(null)
		setOptionValues({})
		setFocusedOptionIndex(0)
	}, [])

	// Render option form for selected command
	if (selectedCommand) {
		return (
			<DropdownContainer className={styles.container} role="dialog" placement="top-start">
				<div className={styles.commandHeader}>
					<button className={styles.backButton} onClick={handleBack} type="button">
						<BackIcon />
					</button>
					<div className={styles.slashIcon}>
						<SlashIcon />
					</div>
					<span className={styles.commandName}>{selectedCommand.name}</span>
					<span className={styles.commandDescription}>{selectedCommand.description}</span>
				</div>

				<div className={styles.options}>
					{commandOptions.map((option, index) => (
						<CommandOptionInput
							key={option.name}
							option={option}
							value={optionValues[option.name]}
							onChange={(value) => handleOptionChange(option.name, value)}
							isFocused={index === focusedOptionIndex}
							members={members}
							channels={channels}
						/>
					))}
				</div>

				<div className={styles.footer}>
					<button
						className={`${styles.submitButton} ${!canSubmit ? styles.disabled : ''}`}
						onClick={handleSubmit}
						disabled={!canSubmit}
						type="button"
					>
						Submit
					</button>
				</div>
			</DropdownContainer>
		)
	}

	// Render command list
	return (
		<DropdownContainer className={styles.container} maxHeight={400} role="listbox" placement="top-start">
			<ListItemHeader className={styles.header}>Commands</ListItemHeader>

			<div className={styles.commandList}>
				{filteredCommands.length === 0 ? (
					<div className={styles.empty}>No commands registered</div>
				) : (
					filteredCommands.map((cmd, index) => (
						<ListItem
							key={cmd.id}
							label={cmd.name}
							description={cmd.description}
							isHighlighted={index === highlightedIndex}
							onClick={() => handleCommandClick(cmd)}
							onMouseEnter={() => setHighlightedIndex(index)}
							icon={
								<div className={styles.commandIcon}>
									<SlashIcon />
								</div>
							}
						/>
					))
				)}
			</div>
		</DropdownContainer>
	)
}

function SlashIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
			<path d="M6 14l1.5-2.9L6 8h1.8l.9 1.8.9-1.8H11l-1.5 2.9L11 14H9.2l-.9-1.8-.9 1.8H6zM16.1 14h-2.1l3-6h2.1l-3 6z" />
		</svg>
	)
}

function BackIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
			<path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
		</svg>
	)
}
