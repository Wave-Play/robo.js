import { useState, useRef, useEffect } from 'react'
import type { StageChannel, StageGuild, StageMember, StageVoiceState, StageUser } from '../../types/stage'
import { VoiceChannel } from './VoiceChannel'
import { VoiceControlDock } from './VoiceControlDock'
import { ServerMenu } from './ServerMenu'
import styles from './ChannelList.module.css'
import CogwheelIcon from '../icons/cogwheel'
import InviteIcon from '../icons/invite'

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
	isPlaybackMode = false
}: ChannelListProps) {
	const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
	const [showArchivedThreads, setShowArchivedThreads] = useState(false)
	const [showServerMenu, setShowServerMenu] = useState(false)
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
						onCreateChannel={() => console.log('Create Channel')}
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
			aria-label={`${channel.name}${hasUnread ? ' (unread messages)' : ''}`}
		>
			<Icon className={styles.channelIcon} aria-hidden="true" />
			<span className={styles.channelName}>{channel.name}</span>
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
			<path d="M3 9v6h4l5 5V4L7 9H3z" />
			<path d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
			<path d="M14 8.03v8.05c1.48-.74 2.5-2.26 2.5-4.02s-1.02-3.29-2.5-4.03z" />
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
	selectedThreadId: string | null
	onClick: () => void
	onThreadSelect: (id: string | null) => void
}

function ChannelItemWithThreads({
	channel,
	threads,
	isSelected,
	isUnread,
	selectedThreadId,
	onClick,
	onThreadSelect
}: ChannelItemWithThreadsProps) {
	return (
		<>
			<div className={`${styles.channelRow} ${isSelected ? styles.channelRowSelected : ''}`}>
				<ChannelItem channel={channel} isSelected={isSelected} isUnread={isUnread} onClick={onClick} />
				<div className={styles.channelActions}>
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
