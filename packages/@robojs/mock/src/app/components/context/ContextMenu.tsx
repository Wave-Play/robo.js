import { useEffect } from 'react'
import type { StageApplicationCommand, StageMessage, StageUser } from '../../types/stage'
import { useDropdownPosition, DropdownContainer, ListItem, ListItemSeparator, ListItemHeader } from '../base'
import PinIcon from '../icons/pin'
import styles from './ContextMenu.module.css'

interface ContextMenuProps {
	type: 'user' | 'message'
	targetId: string
	targetData: StageMessage | StageUser
	position: { x: number; y: number }
	commands: StageApplicationCommand[]
	onClose: () => void
	onCommandClick: (command: StageApplicationCommand) => Promise<void>
	// Standard Discord actions
	onReply?: (message: StageMessage) => void
	onPinMessage?: (messageId: string, channelId: string, isPinned: boolean) => Promise<void>
	onMessageUser?: (userId: string) => Promise<void>
}

export function ContextMenu({
	type,
	targetId,
	targetData,
	position,
	commands,
	onClose,
	onCommandClick,
	onReply,
	onPinMessage,
	onMessageUser
}: ContextMenuProps) {
	const { dropdownRef, adjustedPosition, isPositioned } = useDropdownPosition({ position })

	// Filter commands by type (2 = USER, 3 = MESSAGE)
	const contextCommands = commands.filter((cmd) => (type === 'user' ? cmd.type === 2 : cmd.type === 3))

	// Close on click outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				onClose()
			}
		}

		// Delay to prevent immediate close from the same click
		const timer = setTimeout(() => {
			document.addEventListener('mousedown', handleClickOutside)
		}, 0)

		return () => {
			clearTimeout(timer)
			document.removeEventListener('mousedown', handleClickOutside)
		}
	}, [onClose, dropdownRef])

	// Close on Escape
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onClose()
			}
		}

		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [onClose])

	const handleCommandClick = async (command: StageApplicationCommand) => {
		onClose()
		await onCommandClick(command)
	}

	const handleCopyId = () => {
		navigator.clipboard.writeText(targetId)
		onClose()
	}

	const handleCopyText = () => {
		if (type === 'message') {
			const message = targetData as StageMessage
			navigator.clipboard.writeText(message.content)
		}
		onClose()
	}

	const handleReply = () => {
		if (type === 'message' && onReply) {
			onReply(targetData as StageMessage)
		}
		onClose()
	}

	const handlePinMessage = async () => {
		if (type === 'message' && onPinMessage) {
			const message = targetData as StageMessage
			await onPinMessage(message.id, message.channel_id, message.pinned || false)
		}
		onClose()
	}

	const handleMessageUser = async () => {
		if (type === 'user' && onMessageUser) {
			await onMessageUser(targetId)
		}
		onClose()
	}

	// Get pin status for messages
	const isPinned = type === 'message' ? (targetData as StageMessage).pinned : false

	return (
		<DropdownContainer
			ref={dropdownRef}
			position="fixed"
			coordinates={adjustedPosition}
			isPositioned={isPositioned}
			role="menu"
			className={styles.menu}
		>
			{/* App commands section */}
			{contextCommands.length > 0 && (
				<>
					<ListItemHeader className={styles.menuHeader}>Apps</ListItemHeader>
					{contextCommands.map((cmd) => (
						<ListItem
							key={cmd.id}
							label={cmd.name}
							icon={<CommandIcon />}
							className={styles.menuItem}
							onClick={() => handleCommandClick(cmd)}
							role="menuitem"
						/>
					))}
					<ListItemSeparator className={styles.menuSeparator} />
				</>
			)}

			{/* Standard Discord actions */}
			{type === 'message' && (
				<>
					{onReply && <ListItem label="Reply" icon={<ReplyIcon />} className={styles.menuItem} onClick={handleReply} role="menuitem" />}
					{onPinMessage && (
						<ListItem
							label={isPinned ? 'Unpin Message' : 'Pin Message'}
							icon={<PinIcon width={16} height={16} />}
							className={styles.menuItem}
							onClick={handlePinMessage}
							role="menuitem"
						/>
					)}
					<ListItemSeparator className={styles.menuSeparator} />
					<ListItem label="Copy Text" icon={<CopyIcon />} className={styles.menuItem} onClick={handleCopyText} role="menuitem" />
					<ListItem label="Copy Message ID" icon={<IdIcon />} className={styles.menuItem} onClick={handleCopyId} role="menuitem" />
				</>
			)}

			{type === 'user' && (
				<>
					{onMessageUser && (
						<ListItem label="Message" icon={<MessageIcon />} className={styles.menuItem} onClick={handleMessageUser} role="menuitem" />
					)}
					<ListItemSeparator className={styles.menuSeparator} />
					<ListItem label="Copy User ID" icon={<IdIcon />} className={styles.menuItem} onClick={handleCopyId} role="menuitem" />
				</>
			)}
		</DropdownContainer>
	)
}

// Simple icons
function CommandIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
			<path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zm0 9h7v7h-7v-7zm-9 0h7v7H4v-7z" opacity="0.6" />
		</svg>
	)
}

function CopyIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
			<path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
		</svg>
	)
}

function IdIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
			<path d="M14.5 3H9.5C6.46 3 4 5.46 4 8.5V15.5C4 18.54 6.46 21 9.5 21H14.5C17.54 21 20 18.54 20 15.5V8.5C20 5.46 17.54 3 14.5 3ZM8 8H10V16H8V8ZM16 16H12V14H16V16ZM16 12H12V10H16V12Z" />
		</svg>
	)
}

function ReplyIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
			<path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" />
		</svg>
	)
}

function MessageIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
			<path d="M4.79805 3C3.80445 3 2.99805 3.8055 2.99805 4.8V15.6C2.99805 16.5936 3.80445 17.4 4.79805 17.4H7.49805V21L11.098 17.4H19.198C20.1925 17.4 20.998 16.5936 20.998 15.6V4.8C20.998 3.8055 20.1925 3 19.198 3H4.79805Z" />
		</svg>
	)
}
