<<<<<<< HEAD
import { useState, useEffect, useCallback } from 'react'
import type { StageChannel, StageGuild, StageVoiceState, StageUser } from '../../types/stage'
=======
import { useState } from 'react'
import type { StageChannel, StageGuild, StageMember, StageVoiceState, StageUser } from '../../types/stage'
>>>>>>> 29e5f5ec (fix: adjusted mock ui's small issues)
import { VoiceChannel } from './VoiceChannel'
import { UserArea } from './UserArea'
import styles from './ChannelList.module.css'
import CogwheelIcon from '../icons/cogwheel'
import InviteIcon from '../icons/invite'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent, DragOverlay, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useSessionDispatch, useSession } from '../../stores/sessionStore'

const COLLAPSED_CATEGORIES_KEY = 'stage_collapsed_categories'

interface ChannelListProps {
	guild: StageGuild | undefined
	channels: StageChannel[]
	selectedId: string | null
	onSelect: (id: string | null) => void
	unreadChannelIds?: Set<string>
	mentionCounts?: Record<string, number>
	voiceStates?: StageVoiceState[]
	users?: StageUser[]
	members?: StageMember[]
	currentUser?: StageUser | null
	availableUsers?: StageUser[]
	onJoinVoice?: (channelId: string, guildId: string) => void
	onLeaveVoice?: (guildId: string) => void
	currentUserId?: string
}

// Detect API prefix from current URL
function getApiPrefix() {
	const pathname = window.location.pathname
	const stageIndex = pathname.indexOf('/stage')
	return stageIndex !== -1 ? pathname.slice(0, stageIndex) : ''
}

// Discord channel types
const ChannelType = {
	GUILD_TEXT: 0,
	DM: 1,
	GUILD_VOICE: 2,
	GROUP_DM: 3,
	GUILD_CATEGORY: 4,
	GUILD_ANNOUNCEMENT: 5,
	GUILD_STORE: 6,
	ANNOUNCEMENT_THREAD: 10,
	PUBLIC_THREAD: 11,
	PRIVATE_THREAD: 12,
	GUILD_STAGE_VOICE: 13,
	GUILD_DIRECTORY: 14,
	GUILD_FORUM: 15,
	GUILD_MEDIA: 16
} as const

export function ChannelList({
	guild,
	channels,
	selectedId,
	onSelect,
	unreadChannelIds,
	mentionCounts = {},
	voiceStates = [],
	users = [],
	members = [],
	currentUser,
	availableUsers = [],
	onJoinVoice,
	onLeaveVoice,
	currentUserId
}: ChannelListProps) {
	const dispatch = useSessionDispatch()
	const { sessionId } = useSession()
	const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => {
		try {
			const stored = localStorage.getItem(COLLAPSED_CATEGORIES_KEY)
			return stored ? new Set(JSON.parse(stored)) : new Set()
		} catch {
			return new Set()
		}
	})
	const [showArchivedThreads, setShowArchivedThreads] = useState(false)
	const [activeId, setActiveId] = useState<string | null>(null)

	// DnD sensors - require 8px movement to start drag
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 8 }
		})
	)

	// Persist collapsed categories to localStorage
	useEffect(() => {
		localStorage.setItem(COLLAPSED_CATEGORIES_KEY, JSON.stringify([...collapsedCategories]))
	}, [collapsedCategories])

	// Separate threads from regular channels
	const isThread = (type: number) =>
		type === ChannelType.ANNOUNCEMENT_THREAD ||
		type === ChannelType.PUBLIC_THREAD ||
		type === ChannelType.PRIVATE_THREAD

	const regularChannels = channels.filter((c) => !isThread(c.type))
	const threads = channels.filter((c) => isThread(c.type))

	// Group regular channels by category (sorted by position)
	const categories = regularChannels
		.filter((c) => c.type === ChannelType.GUILD_CATEGORY)
		.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
	const uncategorizedChannels = regularChannels
		.filter((c) => c.type !== ChannelType.GUILD_CATEGORY && !c.parent_id)
		.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

	// Group threads by parent channel
	const getThreadsForChannel = (channelId: string, includeArchived = false) => {
		return threads.filter((t) => {
			if (t.parent_id !== channelId) return false
			if (!includeArchived && t.thread_metadata?.archived) return false
			return true
		})
	}

	const archivedThreads = threads.filter((t) => t.thread_metadata?.archived)

	const toggleCategory = (categoryId: string) => {
		setCollapsedCategories((prev) => {
			const next = new Set(prev)
			if (next.has(categoryId)) {
				next.delete(categoryId)
			} else {
				next.add(categoryId)
			}
			return next
		})
	}

	const getChannelsInCategory = (categoryId: string) => {
		return regularChannels
			.filter((c) => c.parent_id === categoryId && c.type !== ChannelType.GUILD_CATEGORY)
			.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
	}

	const isVoiceChannel = (type: number) => type === ChannelType.GUILD_VOICE || type === ChannelType.GUILD_STAGE_VOICE

	// Persist channel order to backend API
	const persistChannelOrder = useCallback(
		async (guildId: string, updates: Array<{ id: string; position: number; parent_id?: string | null }>) => {
			if (!sessionId) return

			const apiPrefix = getApiPrefix()
			try {
				const response = await fetch(`${apiPrefix}/api/v10/guilds/${guildId}/channels`, {
					method: 'PATCH',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bot mock:${sessionId}`
					},
					body: JSON.stringify(
						updates.map((u) => ({
							id: u.id,
							position: u.position,
							parent_id: u.parent_id
						}))
					)
				})
				if (!response.ok) {
					console.error('[ChannelList] Failed to persist channel order:', response.status)
				}
			} catch (error) {
				console.error('[ChannelList] Failed to persist channel order:', error)
			}
		},
		[sessionId]
	)

	// Drag handlers
	const handleDragStart = useCallback((event: DragStartEvent) => {
		setActiveId(event.active.id as string)
	}, [])

	const handleDragEnd = useCallback(
		async (event: DragEndEvent) => {
			const { active, over } = event
			setActiveId(null)

			if (!over || active.id === over.id || !guild) return

			const activeChannel = regularChannels.find((c) => c.id === active.id)
			const overChannel = regularChannels.find((c) => c.id === over.id)

			if (!activeChannel || !overChannel) return

			// Determine the context (uncategorized or within a category)
			const activeParent = activeChannel.parent_id
			const overParent = overChannel.parent_id

			// Get the relevant channel list
			let channelList: StageChannel[]
			if (!activeParent && !overParent) {
				// Both uncategorized
				channelList = uncategorizedChannels
			} else if (activeParent === overParent) {
				// Same category
				channelList = getChannelsInCategory(activeParent!)
			} else if (!activeParent && overChannel.type === ChannelType.GUILD_CATEGORY) {
				// Moving into a category - uncategorized to category header
				channelList = uncategorizedChannels
			} else if (overChannel.type === ChannelType.GUILD_CATEGORY) {
				// Dragging onto a category header - reorder categories
				channelList = categories
			} else {
				// Cross-category move
				const targetChannels = overParent
					? getChannelsInCategory(overParent)
					: uncategorizedChannels

				// Calculate new position
				const overIndex = targetChannels.findIndex((c) => c.id === over.id)
				const newPosition = targetChannels[overIndex]?.position ?? 0

				// Build updates - move channel to new parent and position
				const updates: Array<{ id: string; position: number; parent_id?: string | null }> = [
					{ id: activeChannel.id, position: newPosition, parent_id: overParent ?? null }
				]

				// Shift other channels in target category
				targetChannels.forEach((c, idx) => {
					if (c.id !== activeChannel.id) {
						const pos = idx >= overIndex ? c.position! + 1 : c.position!
						updates.push({ id: c.id, position: pos })
					}
				})

				// Optimistic update, then persist to backend
				dispatch({ type: 'REORDER_CHANNELS', payload: { guildId: guild.id, updates } })
				persistChannelOrder(guild.id, updates)
				return
			}

			// Find indices
			const oldIndex = channelList.findIndex((c) => c.id === active.id)
			const newIndex = channelList.findIndex((c) => c.id === over.id)

			if (oldIndex === -1 || newIndex === -1) return

			// Reorder and calculate new positions
			const reordered = arrayMove(channelList, oldIndex, newIndex)
			const updates = reordered.map((channel, index) => ({
				id: channel.id,
				position: index
			}))

			// Optimistic update, then persist to backend
			dispatch({ type: 'REORDER_CHANNELS', payload: { guildId: guild.id, updates } })
			persistChannelOrder(guild.id, updates)
		},
		[regularChannels, uncategorizedChannels, categories, getChannelsInCategory, guild, dispatch, persistChannelOrder]
	)

	const activeChannel = activeId ? regularChannels.find((c) => c.id === activeId) : null

	// Render a channel item - uses VoiceChannel for voice channels
	const renderChannelItem = (channel: StageChannel, isDragOverlay = false) => {
		if (isVoiceChannel(channel.type)) {
			const voiceContent = (
				<VoiceChannel
					key={channel.id}
					channel={channel}
					voiceStates={voiceStates}
					users={users}
					members={members}
					currentUserId={currentUserId}
					onJoin={() => onJoinVoice?.(channel.id, channel.guild_id!)}
					onLeave={() => onLeaveVoice?.(channel.guild_id!)}
				/>
			)
			if (isDragOverlay) return voiceContent
			return (
				<SortableChannelWrapper key={channel.id} id={channel.id}>
					{voiceContent}
				</SortableChannelWrapper>
			)
		}

<<<<<<< HEAD
		const channelContent = (
			<div style={{ position: 'relative' }}>
				<div className={styles.channelIconsExtra}>
					<button>
						<CogwheelIcon width={20} height={20} />
					</button>
					<button>
						<InviteIcon width={20} height={20} />
					</button>
				</div>
				<ChannelItemWithThreads
					channel={channel}
					threads={getThreadsForChannel(channel.id)}
					isSelected={selectedId === channel.id}
					isUnread={unreadChannelIds?.has(channel.id)}
					mentionCount={mentionCounts[channel.id]}
					selectedThreadId={selectedId}
					onClick={() => onSelect(channel.id)}
					onThreadSelect={onSelect}
				/>
			</div>
=======
		return (
			<ChannelItemWithThreads
				key={channel.id}
				channel={channel}
				threads={getThreadsForChannel(channel.id)}
				isSelected={selectedId === channel.id}
				isUnread={unreadChannelIds?.has(channel.id)}
				selectedThreadId={selectedId}
				onClick={() => onSelect(channel.id)}
				onThreadSelect={onSelect}
			/>
>>>>>>> 29e5f5ec (fix: adjusted mock ui's small issues)
		)
		if (isDragOverlay) return channelContent
		return (
			<SortableChannelWrapper key={channel.id} id={channel.id}>
				{channelContent}
			</SortableChannelWrapper>
		)
	}

	// Collect all sortable IDs
	const allSortableIds = [
		...uncategorizedChannels.map((c) => c.id),
		...categories.flatMap((cat) => [cat.id, ...getChannelsInCategory(cat.id).map((c) => c.id)])
	]

	return (
		<div className={styles.container}>
			{/* Server header */}

			<div className={styles.header}>
				<span className={styles.serverName}>{guild?.name ?? 'Select a server'}</span>
				<ChevronDown className={styles.headerIcon} />
			</div>

			{/* Channel list with drag-and-drop */}
			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragStart={handleDragStart}
				onDragEnd={handleDragEnd}
			>
				<nav className={styles.channels} aria-label="Channels">
					<SortableContext items={allSortableIds} strategy={verticalListSortingStrategy}>
						{/* Uncategorized channels */}
						{uncategorizedChannels.map((channel) => renderChannelItem(channel))}
						{/* Categories with their channels */}
						{categories.map((category) => {
							const categoryChannels = getChannelsInCategory(category.id)
							const isCollapsed = collapsedCategories.has(category.id)

							return (
								<SortableChannelWrapper key={category.id} id={category.id}>
									<div className={styles.category}>
										<button
											className={styles.categoryHeader}
											onClick={() => toggleCategory(category.id)}
											aria-expanded={!isCollapsed}
											aria-label={`${category.name} category, ${isCollapsed ? 'collapsed' : 'expanded'}`}
										>
											<svg
												className={`${styles.collapseIcon} ${isCollapsed ? styles.collapsed : ''}`}
												width="12"
												height="12"
												viewBox="0 0 12 12"
												aria-hidden="true"
											>
												<path fill="currentColor" d="M2 4l4 4 4-4H2z" />
											</svg>
											<span className={styles.categoryName}>{category.name.toUpperCase()}</span>
										</button>

										{!isCollapsed && (
											<div className={styles.categoryChannels}>
												{categoryChannels.map((channel) => renderChannelItem(channel))}
											</div>
										)}
									</div>
								</SortableChannelWrapper>
							)
						})}
					</SortableContext>
					{/* Archived threads section */}
					{archivedThreads.length > 0 && (
						<div className={styles.category}>
							<button className={styles.categoryHeader} onClick={() => setShowArchivedThreads(!showArchivedThreads)}>
								<svg
									className={`${styles.collapseIcon} ${!showArchivedThreads ? styles.collapsed : ''}`}
									width="12"
									height="12"
									viewBox="0 0 12 12"
								>
									<path fill="currentColor" d="M2 4l4 4 4-4H2z" />
								</svg>
								<span className={styles.categoryName}>ARCHIVED THREADS</span>
							</button>

							{showArchivedThreads && (
								<div className={styles.categoryChannels}>
									{archivedThreads.map((thread) => (
										<ThreadItem
											key={thread.id}
											thread={thread}
											isSelected={selectedId === thread.id}
											onClick={() => onSelect(thread.id)}
										/>
									))}
								</div>
							)}
						</div>
					)}
					{/* Empty state */}
					{channels.length === 0 && guild && (
						<div className={styles.empty}>
							<p>No channels</p>
						</div>
					)}
				</nav>

<<<<<<< HEAD
				{/* Drag overlay for visual feedback */}
				<DragOverlay>
					{activeChannel ? (
						<div className={styles.dragOverlay}>
							{renderChannelItem(activeChannel, true)}
						</div>
					) : null}
				</DragOverlay>
			</DndContext>

			{/* Current user area at bottom */}
			<UserArea />
=======
						{showArchivedThreads && (
							<div className={styles.categoryChannels}>
								{archivedThreads.map((thread) => (
									<ThreadItem
										key={thread.id}
										thread={thread}
										isSelected={selectedId === thread.id}
										onClick={() => onSelect(thread.id)}
									/>
								))}
							</div>
						)}
					</div>
				)}
				{/* Empty state */}
				{channels.length === 0 && guild && (
					<div className={styles.empty}>
						<p>No channels</p>
					</div>
				)}
			</nav>
			<div className={styles.userArea}>
				<UserArea user={currentUser ?? null} availableUsers={availableUsers} />
			</div>
>>>>>>> 29e5f5ec (fix: adjusted mock ui's small issues)
		</div>
	)
}

interface ChannelItemProps {
	channel: StageChannel
	isSelected: boolean
	isUnread?: boolean
	mentionCount?: number
	onClick: () => void
}

function ChannelItem({ channel, isSelected, isUnread, mentionCount, onClick }: ChannelItemProps) {
	const Icon = getChannelIcon(channel.type)
	const hasUnread = isUnread && !isSelected
	const hasMentions = mentionCount && mentionCount > 0 && !isSelected
	const isVoice = channel.type === ChannelType.GUILD_VOICE || channel.type === ChannelType.GUILD_STAGE_VOICE

	// Voice channels have a different appearance - show empty state
	if (isVoice) {
		return (
			<div className={styles.voiceChannel}>
				<button className={styles.voiceChannelHeader} aria-label={`Voice channel: ${channel.name}`}>
					<Icon className={styles.channelIcon} aria-hidden="true" />
					<span className={styles.channelName}>{channel.name}</span>
				</button>
			</div>
		)
	}

	return (
		<button
			className={`${styles.channel} ${isSelected ? styles.selected : ''} ${hasUnread || hasMentions ? styles.unread : ''}`}
			onClick={onClick}
			aria-current={isSelected ? 'page' : undefined}
			aria-label={`${channel.name}${hasMentions ? ` (${mentionCount} mentions)` : hasUnread ? ' (unread messages)' : ''}`}
		>
			<Icon className={styles.channelIcon} aria-hidden="true" />
			<span className={styles.channelName}>{channel.name}</span>
			{hasMentions && <span className={styles.mentionBadge}>{mentionCount}</span>}
		</button>
	)
}

function getChannelIcon(type: number) {
	switch (type) {
		case ChannelType.GUILD_VOICE:
		case ChannelType.GUILD_STAGE_VOICE:
			return VoiceIcon
		case ChannelType.GUILD_ANNOUNCEMENT:
			return AnnouncementIcon
		case ChannelType.GUILD_FORUM:
		case ChannelType.GUILD_MEDIA:
			return ForumIcon
		case ChannelType.PUBLIC_THREAD:
		case ChannelType.PRIVATE_THREAD:
		case ChannelType.ANNOUNCEMENT_THREAD:
			return ThreadIcon
		default:
			return TextIcon
	}
}

function TextIcon({ className }: { className?: string }) {
	return (
		<svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
			<path d="M5.88657 21C5.57547 21 5.3399 20.7189 5.39427 20.4126L6.00001 17H2.59511C2.28449 17 2.04905 16.7198 2.10259 16.4138L2.27759 15.4138C2.31946 15.1746 2.52722 15 2.77011 15H6.35001L7.41001 9H4.00511C3.69449 9 3.45905 8.71977 3.51259 8.41381L3.68759 7.41381C3.72946 7.17456 3.93722 7 4.18011 7H7.76001L8.39677 3.41262C8.43914 3.17391 8.64664 3 8.88907 3H9.87344C10.1845 3 10.4201 3.28107 10.3657 3.58738L9.76001 7H15.76L16.3968 3.41262C16.4391 3.17391 16.6466 3 16.8891 3H17.8734C18.1845 3 18.4201 3.28107 18.3657 3.58738L17.76 7H21.1649C21.4755 7 21.711 7.28023 21.6574 7.58619L21.4824 8.58619C21.4406 8.82544 21.2328 9 20.9899 9H17.41L16.35 15H19.7549C20.0655 15 20.301 15.2802 20.2474 15.5862L20.0724 16.5862C20.0306 16.8254 19.8228 17 19.5799 17H16L15.3632 20.5874C15.3209 20.8261 15.1134 21 14.8709 21H13.8866C13.5755 21 13.3399 20.7189 13.3943 20.4126L14 17H8.00001L7.36325 20.5874C7.32088 20.8261 7.11337 21 6.87094 21H5.88657ZM9.41045 9L8.35045 15H14.3504L15.4104 9H9.41045Z" />
		</svg>
	)
}

function VoiceIcon({ className }: { className?: string }) {
	return (
		<svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
			<path d="M12 3C10.34 3 9 4.37 9 6.07V12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12V6.07C15 4.37 13.66 3 12 3ZM5.5 11C5.5 14.53 8.36 17.38 11.75 17.89V21H12.25V17.89C15.64 17.38 18.5 14.53 18.5 11H17C17 14.03 14.54 16.5 11.88 16.5C9.21 16.5 7 14.03 7 11H5.5Z" />
		</svg>
	)
}

function AnnouncementIcon({ className }: { className?: string }) {
	return (
		<svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
			<path d="M3.9 8.26H2V15.2941H3.9V8.26ZM19.1 4V5.12659L4.85 8.26447V18.1176C4.85 18.5496 5.1464 18.9252 5.5701 19.0315L9.3701 19.9727C9.4461 19.9906 9.524 20 9.6 20C9.89545 20 10.1776 19.8635 10.36 19.6235L12.7065 16.5765L19.1 18.3471V19.4588C19.1 19.7573 19.3431 20 19.6421 20H21.4579C21.7569 20 22 19.7573 22 19.4588V4.00002H19.1V4Z" />
		</svg>
	)
}

function ForumIcon({ className }: { className?: string }) {
	return (
		<svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
			<path d="M18.91 12.98C18.91 11.23 17.64 9.78 16 9.36V8C16 6.9 15.1 6 14 6H10C8.9 6 8 6.9 8 8V9.36C6.36 9.78 5.09 11.23 5.09 12.98C5.09 14.96 6.69 16.55 8.65 16.55H15.35C17.31 16.55 18.91 14.96 18.91 12.98ZM10 8H14V9.17H10V8ZM15.35 14.55H8.65C7.79 14.55 7.09 13.85 7.09 12.98C7.09 12.12 7.79 11.42 8.65 11.42H15.35C16.21 11.42 16.91 12.12 16.91 12.98C16.91 13.85 16.21 14.55 15.35 14.55Z" />
		</svg>
	)
}

function ThreadIcon({ className }: { className?: string }) {
	return (
		<svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
			<path d="M5.43309 21C5.35842 21 5.30189 20.9325 5.31494 20.859L5.99991 17H2.14274C2.06819 17 2.01168 16.9327 2.02453 16.8593L2.33253 15.0993C2.34232 15.0419 2.39234 15 2.45074 15H6.34991L7.40991 9H3.55274C3.47819 9 3.42168 8.93274 3.43453 8.85931L3.74253 7.09931C3.75232 7.04189 3.80234 7 3.86074 7H7.75991L8.45667 3.14103C8.46646 3.08361 8.51648 3.04172 8.57488 3.04172H10.3349C10.4095 3.04172 10.466 3.10917 10.4532 3.18269L9.75991 7H15.7599L16.4567 3.14103C16.4665 3.08361 16.5165 3.04172 16.5749 3.04172H18.3349C18.4095 3.04172 18.466 3.10917 18.4532 3.18269L17.7599 7H21.6171C21.6916 7 21.7482 7.06726 21.7353 7.14069L21.4273 8.90069C21.4175 8.95811 21.3675 9 21.3091 9H17.4099L17.0495 11.03H15.05L15.4104 9H9.41035L8.35035 15H10.35L10.0895 16.97H8.00001L7.30326 20.829C7.29346 20.8864 7.24344 20.9283 7.18505 20.9283H5.43309V21Z" />
		</svg>
	)
}

function ChevronDown({ className }: { className?: string }) {
	return (
		<svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
			<path d="M5.3 9.3a1 1 0 0 1 1.4 0l5.3 5.29 5.3-5.3a1 1 0 1 1 1.4 1.42l-6 6a1 1 0 0 1-1.4 0l-6-6a1 1 0 0 1 0-1.42z" />
		</svg>
	)
}

function LockIcon({ className }: { className?: string }) {
	return (
		<svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
			<path d="M17 11V7a5 5 0 0 0-10 0v4H5v11h14V11h-2zm-3-4a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
		</svg>
	)
}

// Thread item component
interface ThreadItemProps {
	thread: StageChannel
	isSelected: boolean
	onClick: () => void
}

function ThreadItem({ thread, isSelected, onClick }: ThreadItemProps) {
	const isPrivate = thread.type === ChannelType.PRIVATE_THREAD
	const isArchived = thread.thread_metadata?.archived

	return (
		<button
			className={`${styles.thread} ${isSelected ? styles.selected : ''} ${isArchived ? styles.archived : ''}`}
			onClick={onClick}
		>
			{isPrivate ? <LockIcon className={styles.threadIcon} /> : <ThreadIcon className={styles.threadIcon} />}
			<span className={styles.threadName}>{thread.name}</span>
			{thread.message_count !== undefined && thread.message_count > 0 && (
				<span className={styles.threadCount}>{thread.message_count}</span>
			)}
		</button>
	)
}

// Channel with threads wrapper
interface ChannelItemWithThreadsProps {
	channel: StageChannel
	threads: StageChannel[]
	isSelected: boolean
	isUnread?: boolean
	mentionCount?: number
	selectedThreadId: string | null
	onClick: () => void
	onThreadSelect: (id: string | null) => void
}

function ChannelItemWithThreads({
	channel,
	threads,
	isSelected,
	isUnread,
	mentionCount,
	selectedThreadId,
	onClick,
	onThreadSelect
}: ChannelItemWithThreadsProps) {
	return (
		<>
<<<<<<< HEAD
			<ChannelItem channel={channel} isSelected={isSelected} isUnread={isUnread} mentionCount={mentionCount} onClick={onClick} />
=======
			<div className={styles.channelRow}>
				<ChannelItem channel={channel} isSelected={isSelected} isUnread={isUnread} onClick={onClick} />
				<div className={styles.channelActions}>
					<button type="button" aria-label="Edit channel settings">
						<CogwheelIcon width={20} height={20} />
					</button>
					<button type="button" aria-label="Create invite">
						<InviteIcon width={20} height={20} />
					</button>
				</div>
			</div>
>>>>>>> 29e5f5ec (fix: adjusted mock ui's small issues)

			{threads.length > 0 && (
				<div className={styles.threadList}>
					{threads.map((thread) => (
						<ThreadItem
							key={thread.id}
							thread={thread}
							isSelected={selectedThreadId === thread.id}
							onClick={() => onThreadSelect(thread.id)}
						/>
					))}
				</div>
			)}
		</>
	)
}

// Sortable wrapper for drag-and-drop
interface SortableChannelWrapperProps {
	id: string
	children: React.ReactNode
}

function SortableChannelWrapper({ id, children }: SortableChannelWrapperProps) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

	const style: React.CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
		cursor: isDragging ? 'grabbing' : 'grab'
	}

	return (
		<div ref={setNodeRef} style={style} {...attributes} {...listeners}>
			{children}
		</div>
	)
}
