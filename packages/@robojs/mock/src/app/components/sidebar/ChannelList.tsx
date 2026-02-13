import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { StageChannel, StageGuild, StageMember, StageVoiceState, StageUser } from '../../types/stage'
import { CreateCategoryModal } from './CreateCategoryModal'
import { CreateChannelModal } from './CreateChannelModal'
import { VoiceChannel } from './VoiceChannel'
import { VoiceControlDock } from './VoiceControlDock'
import { ServerMenu } from './ServerMenu'
import { useDropdownPosition, DropdownContainer, ListItem } from '../base'
import styles from './ChannelList.module.css'
import { FixedTooltip } from '../common/FixedTooltip'
import CogwheelIcon from '../icons/cogwheel'
import InviteIcon from '../icons/invite'
import CreateIcon from '../icons/create'
import ChannelIcon from '../icons/channel'
import VoiceChannelIcon from '../icons/voice_channel'
import ForumIcon from '../icons/forum'
import ThreadIcon from '../icons/thread'
import ChannelLockIcon from '../icons/channel_lock'

interface ChannelListProps {
	guild: StageGuild | undefined
	channels: StageChannel[]
	selectedId: string | null
	onSelect: (id: string | null) => void
	unreadChannelIds?: Set<string>
	voiceStates?: StageVoiceState[]
	users?: StageUser[]
	members?: StageMember[]
	currentUser?: StageUser | null
	availableUsers?: StageUser[]
	onJoinVoice?: (channelId: string, guildId: string) => void
	onLeaveVoice?: (guildId: string) => void
	onUpdateVoiceState?: (guildId: string, updates: { selfMute?: boolean; selfDeaf?: boolean }) => void
	currentUserId?: string
	isPlaybackMode?: boolean
	onCreateChannel?: (options: { name: string; type: number; parentId?: string | null; isPrivate?: boolean }) => Promise<StageChannel | null> | StageChannel | null
	onOpenVoicePanel?: (channelId: string) => void
	activity?: { isOpen: boolean; channelId: string | null; name: string | null; description: string | null; iconColor: string | null }
	currentUserSpeaking?: boolean
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
	voiceStates = [],
	users = [],
	members = [],
	currentUser,
	availableUsers = [],
	onJoinVoice,
	onLeaveVoice,
	onUpdateVoiceState,
	currentUserId,
	isPlaybackMode = false,
	onCreateChannel,
	onOpenVoicePanel,
	activity,
	currentUserSpeaking = false
}: ChannelListProps) {
	const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
	const [showArchivedThreads, setShowArchivedThreads] = useState(false)
	const [showServerMenu, setShowServerMenu] = useState(false)
	const [createModalState, setCreateModalState] = useState<{ parentId: string | null; defaultType: number } | null>(null)
	const [showCategoryModal, setShowCategoryModal] = useState(false)
	const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
	const headerRef = useRef<HTMLDivElement>(null)
	const containerRef = useRef<HTMLDivElement>(null)
	const [sidebarWidth, setSidebarWidth] = useState(() => {
		const saved = localStorage.getItem('stage_sidebar_width')
		return saved ? Number(saved) : 302
	})
	const isResizing = useRef(false)

	const handleResizeStart = useCallback((e: React.MouseEvent) => {
		e.preventDefault()
		isResizing.current = true
		const startX = e.clientX
		const startWidth = sidebarWidth

		const onMouseMove = (e: MouseEvent) => {
			const newWidth = Math.max(191, Math.min(359, startWidth + (e.clientX - startX)))
			setSidebarWidth(newWidth)
			document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px')
		}

		const onMouseUp = () => {
			isResizing.current = false
			document.removeEventListener('mousemove', onMouseMove)
			document.removeEventListener('mouseup', onMouseUp)
			document.body.style.cursor = ''
			document.body.style.userSelect = ''
			const el = document.documentElement
			const finalWidth = parseInt(el.style.getPropertyValue('--sidebar-width')) || sidebarWidth
			localStorage.setItem('stage_sidebar_width', String(finalWidth))
		}

		document.body.style.cursor = 'col-resize'
		document.body.style.userSelect = 'none'
		document.addEventListener('mousemove', onMouseMove)
		document.addEventListener('mouseup', onMouseUp)
	}, [sidebarWidth])

	useEffect(() => {
		document.documentElement.style.setProperty('--sidebar-width', sidebarWidth + 'px')
	}, [])

	// Handle click outside to close server menu
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (showServerMenu && headerRef.current && !headerRef.current.contains(event.target as Node)) {
				setShowServerMenu(false)
			}
		}

		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [showServerMenu])

	const handleChannelListContextMenu = (event: React.MouseEvent) => {
		// Only show context menu when right-clicking on empty space (not on a channel/category)
		const target = event.target as HTMLElement
		if (target.closest('button, a, [role="menuitem"]')) {
			return
		}

		event.preventDefault()
		setContextMenu({ x: event.clientX, y: event.clientY })
	}

	const openCreateChannelModal = (parentId: string | null, defaultType: number = ChannelType.GUILD_TEXT) => {
		setShowServerMenu(false)
		setCreateModalState({ parentId, defaultType })
	}

	const handleCreateChannel = async (payload: { name: string; type: number; isPrivate: boolean }) => {
		if (!onCreateChannel) return
		const created = await onCreateChannel({
			name: payload.name,
			type: payload.type,
			parentId: createModalState?.parentId ?? null,
			isPrivate: payload.isPrivate
		})

		if (created) {
			onSelect(created.id)
		}
		setCreateModalState(null)
	}

	// Separate threads from regular channels
	const isThread = (type: number) =>
		type === ChannelType.ANNOUNCEMENT_THREAD ||
		type === ChannelType.PUBLIC_THREAD ||
		type === ChannelType.PRIVATE_THREAD

	const regularChannels = channels.filter((c) => !isThread(c.type))
	const threads = channels.filter((c) => isThread(c.type))

	// Group regular channels by category
	const categories = regularChannels.filter((c) => c.type === ChannelType.GUILD_CATEGORY)
	const uncategorizedChannels = regularChannels.filter((c) => c.type !== ChannelType.GUILD_CATEGORY && !c.parent_id)

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
		return regularChannels.filter((c) => c.parent_id === categoryId && c.type !== ChannelType.GUILD_CATEGORY)
	}

	const isVoiceChannel = (type: number) => type === ChannelType.GUILD_VOICE || type === ChannelType.GUILD_STAGE_VOICE

	// Render a channel item - uses VoiceChannel for voice channels
	const renderChannelItem = (channel: StageChannel) => {
		if (isVoiceChannel(channel.type)) {
			return (
				<VoiceChannel
					key={channel.id}
					channel={channel}
					voiceStates={voiceStates}
					users={users}
					members={members}
					currentUserId={currentUserId}
					currentUserSpeaking={currentUserSpeaking}
					onJoin={() => onJoinVoice?.(channel.id, channel.guild_id!)}
					onLeave={() => onLeaveVoice?.(channel.guild_id!)}
					onOpenPanel={() => onOpenVoicePanel?.(channel.id)}
					onSelect={() => onSelect(channel.id)}
				/>
			)
		}

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
				onCreateChannel={() =>
					openCreateChannelModal(
						channel.parent_id ?? null,
						channel.type === ChannelType.GUILD_FORUM
							? ChannelType.GUILD_FORUM
							: ChannelType.GUILD_TEXT
					)
				}
				activity={activity}
			/>
		)
	}

	return (
		<div ref={containerRef} className={styles.container}>
			<div className={styles.resizeHandle} onMouseDown={handleResizeStart} />
			{/* Server header */}
			<div className={styles.headerWrapper} ref={headerRef}>
				<div className={styles.header} onClick={() => setShowServerMenu(!showServerMenu)}>
					<span className={styles.serverName}>{guild?.name ?? 'Select a server'}</span>
					<ChevronDown className={styles.headerIcon} />
				</div>
				{showServerMenu && (
					<ServerMenu
						onClose={() => setShowServerMenu(false)}
						onCreateChannel={() => openCreateChannelModal(null, ChannelType.GUILD_TEXT)}
						onCreateCategory={() => {
						setShowServerMenu(false)
						setShowCategoryModal(true)
					}}
						onInviteToServer={() => console.log('Invite to Server')}
					/>
				)}
			</div>

			{/* Channel list */}
			<nav className={styles.channels} aria-label="Channels" onContextMenu={handleChannelListContextMenu}>
				{/* Uncategorized channels */}
				{uncategorizedChannels.map((channel) => renderChannelItem(channel))}
				{/* Categories with their channels */}
				{categories.map((category) => {
					const categoryChannels = getChannelsInCategory(category.id)
					const isCollapsed = collapsedCategories.has(category.id)

					return (
						<div key={category.id} className={styles.category}>
							<div className={styles.categoryRow}>
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
								<button
									className={styles.categoryAddButton}
									type="button"
									aria-label={`Create channel in ${category.name}`}
									onClick={() => openCreateChannelModal(category.id, ChannelType.GUILD_TEXT)}
								>
									<svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor">
										<polygon points="15 10 10 10 10 15 8 15 8 10 3 10 3 8 8 8 8 3 10 3 10 8 15 8" />
									</svg>
								</button>
							</div>

							{!isCollapsed ? (
								<div className={styles.categoryChannels}>
									{categoryChannels.map((channel) => renderChannelItem(channel))}
								</div>
							) : (
								categoryChannels.some((c) => c.id === selectedId) && (
									<div className={styles.categoryChannels}>
										{categoryChannels.filter((c) => c.id === selectedId).map((channel) => renderChannelItem(channel))}
									</div>
								)
							)}
						</div>
					)
				})}
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
			{contextMenu && (
				<ChannelListContextMenu
					position={contextMenu}
					onClose={() => setContextMenu(null)}
					onCreateChannel={() => {
						setContextMenu(null)
						openCreateChannelModal(null, ChannelType.GUILD_TEXT)
					}}
					onCreateCategory={() => {
						setContextMenu(null)
						setShowCategoryModal(true)
					}}
				/>
			)}
			<div className={styles.userArea}>
				<VoiceControlDock
					currentUser={currentUser ?? null}
					availableUsers={availableUsers}
					channels={channels}
					voiceStates={voiceStates}
					currentUserId={currentUserId}
					onLeaveVoice={onLeaveVoice}
					onUpdateVoiceState={onUpdateVoiceState}
					isPlaybackMode={isPlaybackMode}
				/>
			</div>

			{createModalState && onCreateChannel && (
				<CreateChannelModal
					guildName={guild?.name}
					defaultType={createModalState.defaultType}
					onClose={() => setCreateModalState(null)}
					onSubmit={handleCreateChannel}
				/>
			)}
			{showCategoryModal && onCreateChannel && (
				<CreateCategoryModal
					onClose={() => setShowCategoryModal(false)}
					onSubmit={async (payload) => {
						const created = await onCreateChannel({
							name: payload.name,
							type: ChannelType.GUILD_CATEGORY,
							parentId: null,
							isPrivate: payload.isPrivate
						})
						if (created) {
							onSelect(created.id)
						}
						setShowCategoryModal(false)
					}}
				/>
			)}
		</div>
	)
}

interface ChannelItemProps {
	channel: StageChannel
	isSelected: boolean
	isUnread?: boolean
	onClick: () => void
}

function ChannelItem({ channel, isSelected, isUnread, onClick }: ChannelItemProps) {
	const Icon = getChannelIcon(channel.type)
	const hasUnread = isUnread && !isSelected
	const isVoice = channel.type === ChannelType.GUILD_VOICE || channel.type === ChannelType.GUILD_STAGE_VOICE
	const isPrivateChannel = Boolean(channel.is_private)
	const displayName = channel.name.trim()

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
			className={`${styles.channel} ${isSelected ? styles.selected : ''} ${hasUnread ? styles.unread : ''}`}
			onClick={onClick}
			aria-current={isSelected ? 'page' : undefined}
			aria-label={`${displayName}${hasUnread ? ' (unread messages)' : ''}`}
		>
			<Icon className={styles.channelIcon} aria-hidden="true" />
			<span className={styles.channelName}>{displayName}</span>
			{isPrivateChannel && <ChannelLockIcon className={styles.channelLock} width={14} height={14} />}
		</button>
	)
}

function getChannelIcon(type: number) {
	switch (type) {
		case ChannelType.GUILD_VOICE:
		case ChannelType.GUILD_STAGE_VOICE:
			return VoiceChannelIcon
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
			return ChannelIcon
	}
}

function AnnouncementIcon({ className }: { className?: string }) {
	return (
		<svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
			<path d="M3.9 8.26H2V15.2941H3.9V8.26ZM19.1 4V5.12659L4.85 8.26447V18.1176C4.85 18.5496 5.1464 18.9252 5.5701 19.0315L9.3701 19.9727C9.4461 19.9906 9.524 20 9.6 20C9.89545 20 10.1776 19.8635 10.36 19.6235L12.7065 16.5765L19.1 18.3471V19.4588C19.1 19.7573 19.3431 20 19.6421 20H21.4579C21.7569 20 22 19.7573 22 19.4588V4.00002H19.1V4Z" />
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

// Thread item component
interface ThreadItemProps {
	thread: StageChannel
	isSelected: boolean
	onClick: () => void
}

function ThreadItem({ thread, isSelected, onClick }: ThreadItemProps) {
	const isPrivate = thread.type === ChannelType.PRIVATE_THREAD
	const isArchived = thread.thread_metadata?.archived
	const displayName = thread.name.trim()

	return (
		<button
			className={`${styles.thread} ${isSelected ? styles.selected : ''} ${isArchived ? styles.archived : ''}`}
			onClick={onClick}
		>
			{isPrivate ? (
				<ChannelLockIcon className={styles.threadIcon} width={14} height={14} />
			) : (
				<ThreadIcon className={styles.threadIcon} width={14} height={14} />
			)}
			<span className={styles.threadName}>{displayName}</span>
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
	selectedThreadId: string | null
	onClick: () => void
	onThreadSelect: (id: string | null) => void
	onCreateChannel?: () => void
	activity?: { isOpen: boolean; channelId: string | null; name: string | null; description: string | null; iconColor: string | null }
}

function ChannelItemWithThreads({
	channel,
	threads,
	isSelected,
	isUnread,
	selectedThreadId,
	onClick,
	onThreadSelect,
	onCreateChannel,
	activity
}: ChannelItemWithThreadsProps) {
	const hasActivity = activity?.isOpen && activity.channelId === channel.id
	const [showPopover, setShowPopover] = useState(false)
	const rowRef = useRef<HTMLDivElement>(null)
	const popoverRef = useRef<HTMLDivElement>(null)
	const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
	const [popoverTop, setPopoverTop] = useState(0)
	const [popoverLeft, setPopoverLeft] = useState(0)
	const Icon = getChannelIcon(channel.type)

	const handleMouseEnter = () => {
		if (!hasActivity) return
		if (hideTimeout.current) {
			clearTimeout(hideTimeout.current)
			hideTimeout.current = null
		}
		setShowPopover(true)
	}

	const handleMouseLeave = () => {
		hideTimeout.current = setTimeout(() => setShowPopover(false), 100)
	}

	useLayoutEffect(() => {
		if (!showPopover || !rowRef.current) return
		const rect = rowRef.current.getBoundingClientRect()
		const margin = 24
		setPopoverLeft(rect.right + margin)
		// Clamp vertically
		const popoverHeight = popoverRef.current?.offsetHeight || 200
		const maxTop = window.innerHeight - popoverHeight - margin
		setPopoverTop(Math.max(margin, Math.min(rect.top, maxTop)))
	}, [showPopover])

	return (
		<>
			<div
				ref={rowRef}
				className={`${styles.channelRow} ${isSelected ? styles.channelRowSelected : ''} ${hasActivity ? styles.channelRowActivity : ''}`}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
			>
				<ChannelItem channel={channel} isSelected={isSelected} isUnread={isUnread} onClick={onClick} />
				{hasActivity ? (
					<div className={styles.activityBadge}>
						<div className={styles.activityBadgeIcon} style={{ background: activity.iconColor || '#3a3a4a' }}>
							{activity.name?.[0] || '?'}
						</div>
					</div>
				) : (
					<div className={styles.channelActions}>
						<FixedTooltip label="Invite to Channel">
							<button type="button" aria-label="Invite to Channel">
								<InviteIcon width={16} height={16} />
							</button>
						</FixedTooltip>
						<FixedTooltip label="Edit Channel">
							<button type="button" aria-label="Edit Channel">
								<CogwheelIcon width={16} height={16} />
							</button>
						</FixedTooltip>
					</div>
				)}
			</div>

			{showPopover && hasActivity && (
				<div
					ref={popoverRef}
					className={styles.activityPopover}
					style={{ top: popoverTop, left: popoverLeft }}
					onMouseEnter={handleMouseEnter}
					onMouseLeave={handleMouseLeave}
				>
					<div className={styles.activityPopoverHeader}>
						<Icon className={styles.activityPopoverChannelIcon} />
						<span className={styles.activityPopoverChannelName}>{channel.name}</span>
					</div>
					<div className={styles.activityPopoverDivider} />
					<div className={styles.activityPopoverBody}>
						<div className={styles.activityPopoverIcon} style={{ background: activity.iconColor || '#3a3a4a' }}>
							{activity.name?.[0] || '?'}
						</div>
						<div className={styles.activityPopoverInfo}>
							<div className={styles.activityPopoverName}>{activity.name}</div>
							{activity.description && (
								<div className={styles.activityPopoverDescription}>{activity.description}</div>
							)}
							<div className={styles.activityPopoverDiscordLogo}>
								<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
									<circle cx="12" cy="12" r="12" fill="#5865F2" />
									<path d="M16.1 8.3a10.2 10.2 0 0 0-2.5-.8l-.3.7a9.4 9.4 0 0 0-2.6 0l-.3-.7c-.9.2-1.7.4-2.5.8A10.8 10.8 0 0 0 6 15.6a10.3 10.3 0 0 0 3.2 1.6c.3-.3.5-.7.7-1.1a6 6 0 0 1-1-.5l.2-.2c1.7.8 3.6.8 5.4 0l.2.2c-.3.2-.7.4-1.1.5.2.4.4.8.7 1.1a10.3 10.3 0 0 0 3.2-1.6 10.8 10.8 0 0 0-1.9-7.3Zm-6.5 5.8c-.6 0-1.2-.6-1.2-1.3 0-.7.5-1.3 1.2-1.3.6 0 1.2.6 1.1 1.3 0 .7-.5 1.3-1.1 1.3Zm4.8 0c-.7 0-1.2-.6-1.2-1.3 0-.7.5-1.3 1.2-1.3.6 0 1.2.6 1.1 1.3 0 .7-.5 1.3-1.1 1.3Z" fill="#fff" />
								</svg>
							</div>
						</div>
					</div>
					<div className={styles.activityPopoverFooter}>
						<button className={styles.activityPopoverJoinedButton} type="button">Joined</button>
					</div>
				</div>
			)}

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

// Context menu for right-clicking empty space in the channel list
interface ChannelListContextMenuProps {
	position: { x: number; y: number }
	onClose: () => void
	onCreateChannel: () => void
	onCreateCategory: () => void
}

function ChannelListContextMenu({ position, onClose, onCreateChannel, onCreateCategory }: ChannelListContextMenuProps) {
	const { dropdownRef, adjustedPosition, isPositioned } = useDropdownPosition({ position })

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				onClose()
			}
		}

		const timer = setTimeout(() => {
			document.addEventListener('mousedown', handleClickOutside)
		}, 0)

		return () => {
			clearTimeout(timer)
			document.removeEventListener('mousedown', handleClickOutside)
		}
	}, [onClose, dropdownRef])

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onClose()
			}
		}

		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [onClose])

	return (
		<DropdownContainer
			ref={dropdownRef}
			position="fixed"
			coordinates={adjustedPosition}
			isPositioned={isPositioned}
			role="menu"
			className={styles.contextMenu}
		>
			<ListItem
				label="Create Channel"
				className={styles.contextMenuItem}
				onClick={onCreateChannel}
				role="menuitem"
			/>
			<ListItem
				label="Create Category"
				className={styles.contextMenuItem}
				onClick={onCreateCategory}
				role="menuitem"
			/>
		</DropdownContainer>
	)
}
