import { useEffect, useRef, useState } from 'react'
import type { StageChannel, StageGuild, StageMember, StageVoiceState, StageUser } from '../../types/stage'
import { CreateChannelModal } from './CreateChannelModal'
import { VoiceChannel } from './VoiceChannel'
import { VoiceControlDock } from './VoiceControlDock'
import { ServerMenu } from './ServerMenu'
import styles from './ChannelList.module.css'
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
	onOpenVoicePanel
}: ChannelListProps) {
	const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
	const [showArchivedThreads, setShowArchivedThreads] = useState(false)
	const [showServerMenu, setShowServerMenu] = useState(false)
	const [createModalState, setCreateModalState] = useState<{ parentId: string | null; defaultType: number } | null>(null)
	const headerRef = useRef<HTMLDivElement>(null)

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
					onJoin={() => onJoinVoice?.(channel.id, channel.guild_id!)}
					onLeave={() => onLeaveVoice?.(channel.guild_id!)}
					onOpenPanel={() => onOpenVoicePanel?.(channel.id)}
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
			/>
		)
	}

	return (
		<div className={styles.container}>
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
						onCreateCategory={() => console.log('Create Category')}
						onInviteToServer={() => console.log('Invite to Server')}
					/>
				)}
			</div>

			{/* Channel list */}
			<nav className={styles.channels} aria-label="Channels">
				{/* Uncategorized channels */}
				{uncategorizedChannels.map((channel) => renderChannelItem(channel))}
				{/* Categories with their channels */}
				{categories.map((category) => {
					const categoryChannels = getChannelsInCategory(category.id)
					const isCollapsed = collapsedCategories.has(category.id)

					return (
						<div key={category.id} className={styles.category}>
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
}

function ChannelItemWithThreads({
	channel,
	threads,
	isSelected,
	isUnread,
	selectedThreadId,
	onClick,
	onThreadSelect,
	onCreateChannel
}: ChannelItemWithThreadsProps) {
	return (
		<>
			<div className={`${styles.channelRow} ${isSelected ? styles.channelRowSelected : ''}`}>
				<ChannelItem channel={channel} isSelected={isSelected} isUnread={isUnread} onClick={onClick} />
				<div className={styles.channelActions}>
					<button
						type="button"
						aria-label="Create channel"
						onClick={onCreateChannel}
						disabled={!onCreateChannel}
					>
						<CreateIcon width={16} height={16} />
					</button>
					<button type="button" aria-label="Create invite">
						<InviteIcon width={16} height={16} />
					</button>
					<button type="button" aria-label="Edit channel settings">
						<CogwheelIcon width={16} height={16} />
					</button>
				</div>
			</div>

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
