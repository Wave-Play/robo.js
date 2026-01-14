import { useRef, useEffect, useMemo, useState, useCallback, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useSession } from '../../hooks/useSession'
import { usePlaybackMessages, useIsPlaybackMode, usePlayback, usePlaybackTypingUsers } from '../../stores/playbackStore'
import { useContextMenu } from '../../hooks/useContextMenu'
import { Message } from './Message'
import { MessageInput } from './MessageInput'
import { TypingIndicator } from './TypingIndicator'
import { ThinkingIndicator } from './ThinkingIndicator'
import { PendingMessage } from './PendingMessage'
import { ContextMenu } from '../context/ContextMenu'
import { ForumChannelView } from './ForumChannelView'
import { VoiceChannelView } from './VoiceChannelView'
import ThreadIcon from '../icons/thread'
import type { StageMessage, StageUser, StageApplicationCommand } from '../../types/stage'
import styles from './MessageArea.module.css'

interface MessageAreaProps {
	channelId: string | null
}

interface MessageGroup {
	message: StageMessage
	isFirstInGroup: boolean
	isHighlighted: boolean
	showDateDivider?: string // Date string to show divider, undefined if no divider
}

interface VirtualizedListProps {
	messages: StageMessage[]
	isPlaybackMode: boolean
	channelName: string
	channelTopic?: string
	footer?: ReactNode
	onDismissEphemeral?: (messageId: string) => void
	onButtonClick: (messageId: string, customId: string) => Promise<void>
	onSelectOption: (messageId: string, customId: string, values: string[]) => Promise<void>
	onAddReaction: (messageId: string, emoji: string) => Promise<void>
	onRemoveReaction: (messageId: string, emoji: string) => Promise<void>
	onMessageContextMenu: (e: React.MouseEvent, message: StageMessage) => void
	onUserContextMenu: (e: React.MouseEvent, user: StageUser) => void
}

/**
 * Virtualized message list component - extracted so it can be keyed for proper reset
 */
function VirtualizedMessageList({
	messages,
	isPlaybackMode,
	channelName,
	channelTopic,
	footer,
	onDismissEphemeral,
	onButtonClick,
	onSelectOption,
	onAddReaction,
	onRemoveReaction,
	onMessageContextMenu,
	onUserContextMenu
}: VirtualizedListProps) {
	const containerRef = useRef<HTMLDivElement>(null)
	const prevMessageCountRef = useRef(0)
	const [isAtBottom, setIsAtBottom] = useState(true)

	// Track if user is at bottom of scroll container
	const handleScroll = useCallback(() => {
		if (!containerRef.current) return
		const { scrollTop, scrollHeight, clientHeight } = containerRef.current
		// Consider "at bottom" if within 50px of the bottom
		const atBottom = scrollHeight - scrollTop - clientHeight < 50
		setIsAtBottom(atBottom)
	}, [])

	// Group consecutive messages from same author
	const groupedMessages = useMemo(() => groupMessages(messages), [messages])
	const messageLookup = useMemo(() => {
		const lookup = new Map<string, StageMessage>()
		messages.forEach((message) => {
			lookup.set(message.id, message)
		})
		return lookup
	}, [messages])

	// Virtual scrolling for performance
	const virtualizer = useVirtualizer({
		count: groupedMessages.length,
		getScrollElement: () => containerRef.current,
		// Use message ID as key to prevent stale cache
		getItemKey: (index) => groupedMessages[index]?.message.id ?? `idx-${index}`,
		estimateSize: (index) => {
			const group = groupedMessages[index]
			const message = group.message
			// Estimate: header (if first in group) + content lines + embeds + attachments + components
			const hasHeader = group.isFirstInGroup

			// Check if this is a V2 message (flags & 32768)
			const isV2 = ((message.flags ?? 0) & 32768) !== 0

			// V2 messages have empty content - estimate based on components instead
			let contentHeight = 0
			if (isV2) {
				// V2: estimate height from components
				contentHeight = estimateV2ComponentsHeight(message.components)
			} else {
				// V1: estimate from content text, accounting for code blocks
				const content = message.content || ''

				// Count code blocks and their lines
				const codeBlockMatches = content.match(/```[\s\S]*?```/g) || []
				let codeBlockHeight = 0
				let remainingContent = content

				for (const block of codeBlockMatches) {
					// Count lines in code block + padding
					const codeLines = (block.match(/\n/g) || []).length + 1
					codeBlockHeight += codeLines * 18 + 24
					remainingContent = remainingContent.replace(block, '')
				}

				// Count remaining text lines (actual newlines + character wrap)
				const textLines = remainingContent.split('\n')
				let textHeight = 0
				for (const line of textLines) {
					textHeight += Math.max(1, Math.ceil(line.length / 70)) * 19
				}

				contentHeight = codeBlockHeight + textHeight
			}

			// Better embed height estimation (V1 only - V2 doesn't have embeds)
			let embedHeight = 0
			if (!isV2 && message.embeds?.length) {
				for (const embed of message.embeds as Array<{ image?: unknown; fields?: unknown[] }>) {
					// Base embed: padding + author + title + description
					embedHeight += 104
					// Fields add height
					if (embed.fields?.length) {
						embedHeight += Math.ceil(embed.fields.length / 3) * 42
					}
					// Image adds significant height
					if (embed.image) {
						embedHeight += 280
					}
				}
			}

			// Better attachment height estimation
			let attachmentHeight = 0
			if (message.attachments?.length) {
				for (const att of message.attachments as Array<{ content_type?: string; height?: number }>) {
					if (att.content_type?.startsWith('image/')) {
						// Image: constrained to max 300px height + margin
						attachmentHeight += Math.min(att.height || 200, 300) + 8
					} else if (att.content_type?.startsWith('video/')) {
						attachmentHeight += 300
					} else {
						// File attachment card
						attachmentHeight += 64
					}
				}
			}

			// V1 component height estimation (buttons, selects)
			let v1ComponentHeight = 0
			if (!isV2 && message.components?.length) {
				// Each action row is about 40px (button/select height + gap)
				v1ComponentHeight = message.components.length * 40
			}

			// Date divider adds ~40px (16px margin + 24px content)
			const dateDividerHeight = group.showDateDivider ? 40 : 0

			const rawMessage = message as StageMessage & { referenced_message?: StageMessage; referencedMessage?: StageMessage }
			const replyHeight = (message.message_reference || rawMessage.referenced_message || rawMessage.referencedMessage) ? 18 : 0

			return dateDividerHeight + (hasHeader ? 44 : 0) + replyHeight + contentHeight + embedHeight + attachmentHeight + v1ComponentHeight + 8
		},
		overscan: 10
	})
	const virtualItems = virtualizer.getVirtualItems()
	const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
	const paddingBottom =
		virtualItems.length > 0
			? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
			: 0

	// Auto-scroll to bottom on new messages
	useEffect(() => {
		if (messages.length > prevMessageCountRef.current && containerRef.current) {
			// In live mode, always scroll. In playback mode, only scroll if already at bottom
			if (!isPlaybackMode || isAtBottom) {
				containerRef.current.scrollTop = containerRef.current.scrollHeight
			}
		}
		prevMessageCountRef.current = messages.length
	}, [messages.length, isPlaybackMode, isAtBottom])

	// Scroll to appropriate position on mount
	useEffect(() => {
		if (containerRef.current) {
			if (isPlaybackMode) {
				// Start playback from the top
				containerRef.current.scrollTop = 0
				setIsAtBottom(false)
			} else {
				// Live mode - start at bottom
				containerRef.current.scrollTop = containerRef.current.scrollHeight
				setIsAtBottom(true)
			}
		}
	}, []) // Only on mount

	return (
		<div className={styles.messages} ref={containerRef} onScroll={handleScroll}>
			{messages.length === 0 ? (
				isPlaybackMode ? (
					// Show empty state during playback mode instead of welcome
					<div className={styles.empty}>
						<div className={styles.emptyIcon}>
							<svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor">
								<path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm0 14A6 6 0 1 1 8 2a6 6 0 0 1 0 12zm.5-9H7v5l4.25 2.5.75-1.23-3.5-2.08V5z" />
							</svg>
						</div>
						<h3 className={styles.emptyTitle}>Playback Starting...</h3>
						<p className={styles.emptyDescription}>Messages will appear as the playback progresses.</p>
					</div>
				) : (
					<div className={styles.welcome}>
						<div className={styles.welcomeIcon}>
							<span className={styles.hash}>#</span>
						</div>
						<h2 className={styles.welcomeTitle}>Welcome to #{channelName}!</h2>
						<p className={styles.welcomeDescription}>
							{channelTopic || `This is the start of the #${channelName} channel.`}
						</p>
						<div className={styles.welcomeCards}>
							<div className={styles.welcomeCard}>
								<div className={styles.welcomeCardIcon}>
									<InviteIcon />
								</div>
								<span className={styles.welcomeCardText}>Invite your friends</span>
								<CheckIcon className={styles.welcomeCardCheck} />
							</div>
							<div className={styles.welcomeCard}>
								<div className={styles.welcomeCardIcon}>
									<MessageIcon />
								</div>
								<span className={styles.welcomeCardText}>Send your first message</span>
								<CheckIcon className={styles.welcomeCardCheck} />
							</div>
							<div className={styles.welcomeCard}>
								<div className={styles.welcomeCardIcon}>
									<AppIcon />
								</div>
								<span className={styles.welcomeCardText}>Add your first app</span>
								<ChevronIcon className={styles.welcomeCardChevron} />
							</div>
						</div>
					</div>
				)
			) : (
				<div
					className={styles.virtualContainer}
					style={{
						paddingTop,
						paddingBottom
					}}
				>
					{virtualItems.map((virtualItem) => {
						const group = groupedMessages[virtualItem.index]
						const referencedMessageId = group.message.message_reference?.message_id
						const replyMessage = referencedMessageId ? messageLookup.get(referencedMessageId) : undefined
						return (
							<div key={group.message.id}>
								{group.showDateDivider && (
									<div className={styles.dateDivider}>
										<span className={styles.dateDividerText}>{group.showDateDivider}</span>
									</div>
								)}
								<Message
									message={group.message}
									replyMessage={replyMessage}
									isFirstInGroup={group.isFirstInGroup}
										isHighlighted={group.isHighlighted}
										onButtonClick={onButtonClick}
										onSelectOption={onSelectOption}
										onAddReaction={onAddReaction}
										onRemoveReaction={onRemoveReaction}
										onDismissEphemeral={onDismissEphemeral}
										onContextMenu={onMessageContextMenu}
										onUserContextMenu={onUserContextMenu}
									/>
								</div>
							)
						})}
				</div>
			)}
			{footer}
		</div>
	)
}

export function MessageArea({ channelId }: MessageAreaProps) {
	const {
		guildChannels,
		guildVoiceStates,
		users,
		botUser,
		messages,
		channelMessages,
		channelTypingUsers,
		channelPendingInteractions,
		channelPendingMessages,
		members,
		selectedGuildId,
		selectedChannel,
		clickButton,
		selectOption,
		addReaction,
		removeReaction,
		retryMessage,
		cancelMessage,
		commands,
		invokeContextCommand,
		setReplyingTo,
		pinMessage,
		unpinMessage,
		openDM,
		joinVoice,
		leaveVoice
	} = useSession()
	const { menu: contextMenu, showMenu: showContextMenu, hideMenu: hideContextMenu } = useContextMenu()
	const isPlaybackMode = useIsPlaybackMode()
	const playbackMessages = usePlaybackMessages(channelId)
	const playbackTypingUsers = usePlaybackTypingUsers(channelId)
	const playbackState = usePlayback()
	const [dismissedEphemeralIds, setDismissedEphemeralIds] = useState<string[]>([])

	// Use playback messages when in playback mode, otherwise use session messages
	const displayMessages = isPlaybackMode && playbackMessages !== null ? playbackMessages : channelMessages

	// Use playback typing users when in playback mode, otherwise use session typing users
	const displayTypingUsers = isPlaybackMode && playbackTypingUsers !== null ? playbackTypingUsers : channelTypingUsers
	const voiceUsers = botUser && !users.some((user) => user.id === botUser.id) ? [...users, botUser] : users
	const guildMembers = selectedGuildId
		? members.filter((member) => member.guild_id === selectedGuildId)
		: members
	const visibleMessages = dismissedEphemeralIds.length
		? displayMessages.filter((message) => !dismissedEphemeralIds.includes(message.id))
		: displayMessages

	const handleDismissEphemeral = useCallback((messageId: string) => {
		setDismissedEphemeralIds((prev) => (prev.includes(messageId) ? prev : [...prev, messageId]))
	}, [])

	useEffect(() => {
		setDismissedEphemeralIds([])
	}, [channelId])

	// Context menu handlers
	const handleMessageContextMenu = useCallback(
		(e: React.MouseEvent, message: StageMessage) => {
			e.preventDefault()
			showContextMenu('message', message.id, message, { x: e.clientX, y: e.clientY })
		},
		[showContextMenu]
	)

	const handleUserContextMenu = useCallback(
		(e: React.MouseEvent, user: StageUser) => {
			e.preventDefault()
			e.stopPropagation()
			showContextMenu('user', user.id, user, { x: e.clientX, y: e.clientY })
		},
		[showContextMenu]
	)

	const handleContextCommandClick = useCallback(
		async (command: StageApplicationCommand) => {
			if (!contextMenu) return

			const commandType = command.type as 2 | 3
			await invokeContextCommand(command.name, commandType, contextMenu.targetId, contextMenu.targetData)
		},
		[contextMenu, invokeContextCommand]
	)

	// Handle reply action from context menu
	const handleReply = useCallback(
		(message: StageMessage) => {
			setReplyingTo(message)
		},
		[setReplyingTo]
	)

	// Handle pin/unpin action from context menu
	const handlePinMessage = useCallback(
		async (messageId: string, messageChannelId: string, isPinned: boolean) => {
			if (isPinned) {
				await unpinMessage(messageChannelId, messageId)
			} else {
				await pinMessage(messageChannelId, messageId)
			}
		},
		[pinMessage, unpinMessage]
	)

	// Handle message user action from context menu
	const handleMessageUser = useCallback(
		async (userId: string) => {
			await openDM(userId)
		},
		[openDM]
	)

	if (!channelId || !selectedChannel) {
		return (
			<div className={styles.container}>
				<div className={styles.empty}>
					<div className={styles.emptyIcon}>
						<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
							<path d="M5.88657 21C5.57547 21 5.3399 20.7189 5.39427 20.4126L6.00001 17H2.59511C2.28449 17 2.04905 16.7198 2.10259 16.4138L2.27759 15.4138C2.31946 15.1746 2.52722 15 2.77011 15H6.35001L7.41001 9H4.00511C3.69449 9 3.45905 8.71977 3.51259 8.41381L3.68759 7.41381C3.72946 7.17456 3.93722 7 4.18011 7H7.76001L8.39677 3.41262C8.43914 3.17391 8.64664 3 8.88907 3H9.87344C10.1845 3 10.4201 3.28107 10.3657 3.58738L9.76001 7H15.76L16.3968 3.41262C16.4391 3.17391 16.6466 3 16.8891 3H17.8734C18.1845 3 18.4201 3.28107 18.3657 3.58738L17.76 7H21.1649C21.4755 7 21.711 7.28023 21.6574 7.58619L21.4824 8.58619C21.4406 8.82544 21.2328 9 20.9899 9H17.41L16.35 15H19.7549C20.0655 15 20.301 15.2802 20.2474 15.5862L20.0724 16.5862C20.0306 16.8254 19.8228 17 19.5799 17H16L15.3632 20.5874C15.3209 20.8261 15.1134 21 14.8709 21H13.8866C13.5755 21 13.3399 20.7189 13.3943 20.4126L14 17H8.00001L7.36325 20.5874C7.32088 20.8261 7.11337 21 6.87094 21H5.88657ZM9.41045 9L8.35045 15H14.3504L15.4104 9H9.41045Z" />
						</svg>
					</div>
					<h3 className={styles.emptyTitle}>Select a channel</h3>
					<p className={styles.emptyDescription}>Choose a channel from the sidebar to start viewing messages</p>
				</div>
			</div>
		)
	}

	const isThreadChannel =
		selectedChannel.type === 10 ||
		selectedChannel.type === 11 ||
		selectedChannel.type === 12
	const isForumChannel = selectedChannel.type === 15 || selectedChannel.type === 16
	const isVoiceChannel = selectedChannel.type === 2 || selectedChannel.type === 13
	const threadParent = isThreadChannel
		? guildChannels.find((channel) => channel.id === selectedChannel.parent_id)
		: null
	const forumThreads = isForumChannel
		? guildChannels.filter((channel) => channel.parent_id === selectedChannel.id && (
			channel.type === 10 ||
			channel.type === 11 ||
			channel.type === 12
		))
		: []

	if (isForumChannel) {
		return (
			<div className={styles.container}>
				<ForumChannelView channel={selectedChannel} threads={forumThreads} messages={messages} />
			</div>
		)
	}

	if (isVoiceChannel) {
		return (
			<div className={styles.container}>
				<VoiceChannelView
					channel={selectedChannel}
					voiceStates={guildVoiceStates}
					users={voiceUsers}
					members={guildMembers}
					currentUserId={botUser?.id}
					onJoin={async () => { await joinVoice(selectedChannel.id, selectedChannel.guild_id) }}
					onLeave={async () => { await leaveVoice(selectedChannel.guild_id) }}
				/>
			</div>
		)
	}

	return (
		<div className={styles.container}>
			{/* Playback mode banner */}
			{isPlaybackMode && (
				<div className={styles.playbackBanner}>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
						<path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm0 14A6 6 0 1 1 8 2a6 6 0 0 1 0 12zm.5-9H7v5l4.25 2.5.75-1.23-3.5-2.08V5z" />
					</svg>
					<span>
						Playback Mode — Viewing {displayMessages.length} message{displayMessages.length !== 1 ? 's' : ''} at{' '}
						{formatPlaybackTime(playbackState.currentTime)}
					</span>
				</div>
			)}

			{isThreadChannel && (
				<div className={styles.threadHeader}>
					<div className={styles.threadHeaderInfo}>
						<div className={styles.threadIcon}>
							<ThreadIcon width={20} height={20} />
						</div>
						<div>
							<div className={styles.threadTitle}>{selectedChannel.name}</div>
							<div className={styles.threadSubtitle}>
								{threadParent ? `Thread in #${threadParent.name}` : 'Thread'}
							</div>
						</div>
					</div>
					<div className={styles.threadActions}>
						{selectedChannel.thread_metadata?.archived && <span className={styles.threadBadge}>Archived</span>}
						{selectedChannel.thread_metadata?.locked && <span className={styles.threadBadge}>Locked</span>}
						<button type="button" className={styles.threadButton}>Members</button>
						<button type="button" className={styles.threadButton}>Notifications</button>
					</div>
				</div>
			)}

			{/* Virtualized message list - keyed to force reset on channel/mode change */}
			<VirtualizedMessageList
				key={`${channelId}-${isPlaybackMode}`}
				messages={visibleMessages}
				isPlaybackMode={isPlaybackMode}
				channelName={selectedChannel.name}
				channelTopic={selectedChannel.topic ?? undefined}
				onButtonClick={async (messageId, customId) => { await clickButton(messageId, customId) }}
				onSelectOption={async (messageId, customId, values) => { await selectOption(messageId, customId, values) }}
				onAddReaction={async (messageId, emoji) => { await addReaction(messageId, emoji) }}
				onRemoveReaction={async (messageId, emoji) => { await removeReaction(messageId, emoji) }}
				onDismissEphemeral={handleDismissEphemeral}
				onMessageContextMenu={handleMessageContextMenu}
				onUserContextMenu={handleUserContextMenu}
				footer={
					<>
						{channelPendingMessages.map((pending) => (
							<PendingMessage key={pending.id} message={pending} onRetry={retryMessage} onCancel={cancelMessage} />
						))}
						{channelPendingInteractions.map((pending) => (
							<ThinkingIndicator
								key={pending.id}
								botName={pending.botName}
								botAvatar={pending.botAvatar}
								botId={pending.botId}
							/>
						))}
						<TypingIndicator typingUsers={displayTypingUsers} />
					</>
				}
			/>

			{/* Message input */}
			<MessageInput channelId={selectedChannel.id} channelName={selectedChannel.name} />

			{/* Context menu */}
			{contextMenu && (
				<ContextMenu
					type={contextMenu.type}
					targetId={contextMenu.targetId}
					targetData={contextMenu.targetData}
					position={contextMenu.position}
					commands={commands}
					onClose={hideContextMenu}
					onCommandClick={handleContextCommandClick}
					onReply={handleReply}
					onPinMessage={handlePinMessage}
					onMessageUser={handleMessageUser}
				/>
			)}
		</div>
	)
}

/**
 * Group consecutive messages from the same author within 5 minutes
 * Also detects date changes and marks where date dividers should appear
 */
function groupMessages(messages: StageMessage[]): MessageGroup[] {
	let lastDateStr: string | null = null

	return messages.map((message, index) => {
		const prevMessage = messages[index - 1]
		const messageDate = new Date(message.timestamp)
		const currentDateStr = messageDate.toDateString()

		// Check if we need a date divider
		let showDateDivider: string | undefined
		if (lastDateStr !== currentDateStr) {
			showDateDivider = formatDateDivider(messageDate)
			lastDateStr = currentDateStr
		}

		const isFirstInGroup =
			!prevMessage ||
			prevMessage.author.id !== message.author.id ||
			messageDate.getTime() - new Date(prevMessage.timestamp).getTime() > 5 * 60 * 1000 ||
			showDateDivider !== undefined // New date always starts a new group

		return {
			message,
			isFirstInGroup,
			isHighlighted: false, // Set when interaction response (can be extended later)
			showDateDivider
		}
	})
}

/**
 * Format date for the divider (e.g., "December 9, 2025")
 */
function formatDateDivider(date: Date): string {
	return date.toLocaleDateString('en-US', {
		month: 'long',
		day: 'numeric',
		year: 'numeric'
	})
}

/**
 * Format playback time as MM:SS
 */
function formatPlaybackTime(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000)
	const minutes = Math.floor(totalSeconds / 60)
	const seconds = totalSeconds % 60
	return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/**
 * Estimate height of V2 components for virtualization
 * Based on actual CSS measurements:
 * - Container gap: 8px between components
 * - Container margin-top: 4px
 */
function estimateV2ComponentsHeight(components: unknown[] | undefined): number {
	if (!components?.length) return 22 // Minimum height

	let totalHeight = 4 // margin-top from container

	for (let i = 0; i < components.length; i++) {
		const comp = components[i] as {
			type?: number
			content?: string
			components?: unknown[]
			items?: unknown[]
			accessory?: { type?: number }
			spacing?: string
			divider?: boolean
		}
		const type = comp.type

		// Add gap between components (8px)
		if (i > 0) {
			totalHeight += 8
		}

		switch (type) {
			case 1: // ActionRow (buttons/selects)
				totalHeight += 40
				break

			case 9: { // Section (text + optional accessory)
				// Section uses grid layout with text column and optional thumbnail/button
				// Estimate text height from nested TextDisplay components
				let textHeight = 0
				if (comp.components?.length) {
					const maxLineLength = comp.accessory?.type === 11 ? 52 : 60
					for (const textComp of comp.components) {
						const tc = textComp as { content?: string }
						textHeight += estimateTextHeight(tc.content || '', maxLineLength)
					}
					// Add gaps between text components (4px)
					textHeight += (comp.components.length - 1) * 4
				}
				// Accessory is typically 80px thumbnail or ~32px button
				const accessoryHeight = comp.accessory?.type === 11 ? 80 : 32
				// Section height is max of text content vs accessory
				totalHeight += Math.max(textHeight, accessoryHeight)
				break
			}

			case 10: // TextDisplay (markdown text block)
				totalHeight += estimateTextHeight(comp.content || '')
				break

			case 12: { // MediaGallery
				// Based on CSS: max-width 520px
				// - Single image: max-height 300px
				// - Double (2 images): aspect-ratio 1:1, ~258px each
				// - Grid (3+ images): 2 columns, aspect-ratio 1:1, ~258px per row + 4px gap
				const itemCount = comp.items?.length || 1
				if (itemCount === 1) {
					totalHeight += 300
				} else if (itemCount === 2) {
					totalHeight += 258 // Side by side, aspect ratio 1:1
				} else {
					// Multiple rows: 2 columns, ceiling of items/2 rows
					const rows = Math.ceil(itemCount / 2)
					totalHeight += rows * 258 + (rows - 1) * 4 // 4px gap between rows
				}
				break
			}

			case 13: // File (icon + info + download button)
				// 40px icon height + 24px padding = 64px + 1px border
				totalHeight += 68
				break

			case 14: // Separator
				// Small spacing: 8px margin top/bottom = 17px total
				// Large spacing: 16px margin top/bottom = 33px total
				totalHeight += comp.spacing === 'large' ? 33 : 17
				break

			case 17: // Container (styled wrapper with nested components)
				// Container: 24px padding (12 top + 12 bottom) + 8px gaps between children
				totalHeight += 24 + estimateV2ComponentsHeight(comp.components)
				break

			default:
				totalHeight += 40
		}
	}

	return Math.max(totalHeight, 44) // Minimum 44px
}

/**
 * Estimate height of text content based on character count and line breaks
 * Uses 14px font size with 1.375 line-height (~19px per line)
 * Assumes ~70 chars per line at max content width
 */
function estimateTextHeight(content: string, maxLineLength = 70): number {
	if (!content) return 19 // Minimum one line

	// Split by actual newlines first
	const lines = content.split('\n')
	let totalLines = 0

	for (const line of lines) {
		// Check for headers (larger text)
		if (line.startsWith('# ')) {
			totalLines += 1.5 // Headers are taller
		} else if (line.startsWith('## ') || line.startsWith('### ')) {
			totalLines += 1.25
		} else if (line.length === 0) {
			totalLines += 0.5 // Empty lines are shorter
		} else {
			// Estimate wrapping at configured line length
			totalLines += Math.max(1, Math.ceil(line.length / maxLineLength))
		}
	}

	// 19px per line (14px * 1.375 line-height)
	return Math.ceil(totalLines * 19)
}

// Welcome card icon components
function InviteIcon() {
	return (
		<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
			<path d="M21 3a1 1 0 0 1 1 1v5.5a2.5 2.5 0 0 1-5 0V8h-3a4 4 0 0 0-4 4v3h1.5a2.5 2.5 0 0 1 0 5H6a4 4 0 0 1-4-4v-5a1 1 0 0 1 1-1h3V5a2 2 0 0 1 2-2h13z" />
		</svg>
	)
}

function MessageIcon() {
	return (
		<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
			<path d="M12 2C6.486 2 2 6.262 2 11.5c0 2.545 1.088 4.988 3.039 6.822.146.138.35.383.242.84-.107.455-.491 1.822-.783 2.662-.123.355.208.65.538.47 1.538-.841 2.49-1.352 2.913-1.521.423-.169.828-.169 1.089-.169h2.962c5.514 0 10-4.262 10-9.5S17.514 2 12 2z" />
		</svg>
	)
}

function AppIcon() {
	return (
		<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
			<path d="M6 7a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1H6zM4 8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8z" />
			<path d="M9 10a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm4 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm4 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0z" />
		</svg>
	)
}

function CheckIcon({ className }: { className?: string }) {
	return (
		<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className={className}>
			<path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm3.707-9.293a1 1 0 0 0-1.414-1.414L9 10.586 7.707 9.293a1 1 0 0 0-1.414 1.414l2 2a1 1 0 0 0 1.414 0l4-4z" clipRule="evenodd" />
		</svg>
	)
}

function ChevronIcon({ className }: { className?: string }) {
	return (
		<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className={className}>
			<path fillRule="evenodd" d="M7.293 14.707a1 1 0 0 1 0-1.414L10.586 10 7.293 6.707a1 1 0 0 1 1.414-1.414l4 4a1 1 0 0 1 0 1.414l-4 4a1 1 0 0 1-1.414 0z" clipRule="evenodd" />
		</svg>
	)
}
