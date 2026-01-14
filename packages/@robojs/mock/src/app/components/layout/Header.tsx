import { useRef, useEffect, useMemo } from 'react'
import type { StageChannel, StageGuild, StageMessage, StageUser } from '../../types/stage'
import MagnifyingGlass from '../icons/magnifying_glass'
import ThreadIcon from '../icons/thread'
import NotificationIcon from '../icons/notification'
import PinIcon from '../icons/pin'
import ChannelIcon from '../icons/channel'
import VoiceChannelIcon from '../icons/voice_channel'
import ForumIcon from '../icons/forum'
import { ThreadList } from '../threads/ThreadList'
import { NotificationDropdown } from '../notifications/NotificationDropdown'
import { PinnedMessagesDropdown } from '../pinned/PinnedMessagesDropdown'
import styles from './Header.module.css'

interface HeaderProps {
	channel: StageChannel | null
	guild?: StageGuild | null
	currentUser?: StageUser | null
	onToggleMembers: () => void
	showMembers: boolean
	onToggleThreads: () => void
	showThreads: boolean
	onToggleNotifications: () => void
	showNotifications: boolean
	onTogglePinnedMessages: () => void
	showPinnedMessages: boolean
	onMobileMenuToggle?: () => void
	isMobileSidebarOpen?: boolean
	threads?: StageChannel[]
	threadMessages?: Record<string, StageMessage[]>
	users?: StageUser[]
	onCreateThread?: () => void
	onThreadSelect?: (threadId: string) => void
}

export function Header({
	channel,
	guild,
	currentUser,
	onToggleMembers,
	showMembers,
	onToggleThreads,
	showThreads,
	onToggleNotifications,
	showNotifications,
	onTogglePinnedMessages,
	showPinnedMessages,
	onMobileMenuToggle,
	isMobileSidebarOpen,
	threads,
	threadMessages,
	users,
	onCreateThread,
	onThreadSelect
}: HeaderProps) {
	const notificationsRef = useRef<HTMLDivElement>(null)
	const pinnedRef = useRef<HTMLDivElement>(null)
	const threadsRef = useRef<HTMLDivElement>(null)
	const ChannelIcon = channel ? getChannelIcon(channel.type) : null

	// Generate dynamic search placeholder
	const searchPlaceholder = useMemo(() => {
		// For group DMs (channel type 3)
		if (channel?.type === ChannelType.GROUP_DM && currentUser) {
			// Get recipient names from the channel
			const recipients = channel.recipients || []
			if (recipients.length > 0) {
				const firstRecipient = recipients[0]
				return `Search ${currentUser.username}, ${firstRecipient.username}`
			}
			return `Search ${currentUser.username}`
		}

		// For DMs (channel type 1)
		if (channel?.type === ChannelType.DM && currentUser) {
			const recipients = channel.recipients || []
			if (recipients.length > 0) {
				return `Search ${recipients[0].username}`
			}
			return `Search ${currentUser.username}`
		}

		// For server channels - use guild name
		if (guild?.name) {
			return `Search ${guild.name}`
		}

		// Default fallback
		return 'Search'
	}, [channel, guild, currentUser])

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (showThreads && threadsRef.current && !threadsRef.current.contains(event.target as Node)) {
				onToggleThreads()
			}
			if (showNotifications && notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
				onToggleNotifications()
			}
			if (showPinnedMessages && pinnedRef.current && !pinnedRef.current.contains(event.target as Node)) {
				onTogglePinnedMessages()
			}
		}

		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [
		showThreads,
		showNotifications,
		showPinnedMessages,
		onToggleThreads,
		onToggleNotifications,
		onTogglePinnedMessages
	])

	return (
		<header className={styles.header}>
			{/* Mobile hamburger menu */}
			{onMobileMenuToggle && (
				<button
					className={`${styles.mobileMenuButton} ${isMobileSidebarOpen ? styles.active : ''}`}
					onClick={onMobileMenuToggle}
					aria-label={isMobileSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
					aria-expanded={isMobileSidebarOpen}
				>
					<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
						{isMobileSidebarOpen ? (
							<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
						) : (
							<path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
						)}
					</svg>
				</button>
			)}

			<div className={styles.channelInfo}>
				{channel ? (
					<>
						{ChannelIcon ? <ChannelIcon className={styles.channelIcon} /> : <span className={styles.hash}>#</span>}
						<h2 className={styles.channelName}>{channel.name}</h2>
						{channel.topic && (
							<>
								<div className={styles.divider} />
								<span className={styles.topic}>{channel.topic}</span>
							</>
						)}
					</>
				) : (
					<span className={styles.placeholder}>Select a channel</span>
				)}
			</div>

			<div className={styles.actions}>
				<div className={styles.iconGroup}>
					<div className={styles.dropdownWrapper} ref={threadsRef}>
						<button
							className={`${styles.iconButton} ${showThreads ? styles.active : ''}`}
							onClick={onToggleThreads}
							title="Toggle threads"
							aria-label={showThreads ? 'Hide Threads' : 'Show Threads'}
							aria-pressed={showThreads}
						>
							<ThreadIcon width={24} height={24} />
						</button>
						{showThreads && (
							<ThreadList
								threads={threads}
								messages={threadMessages}
								users={users}
								onClose={onToggleThreads}
								onCreateThread={onCreateThread}
								onThreadSelect={onThreadSelect}
							/>
						)}
					</div>
					<div className={styles.dropdownWrapper} ref={notificationsRef}>
						<button
							className={`${styles.iconButton} ${showNotifications ? styles.active : ''}`}
							onClick={onToggleNotifications}
							title="Notifications"
							aria-label={showNotifications ? 'Hide notifications' : 'Show notifications'}
							aria-pressed={showNotifications}
						>
							<NotificationIcon width={24} height={24} />
						</button>
						{showNotifications && <NotificationDropdown onClose={onToggleNotifications} />}
					</div>
					<div className={styles.dropdownWrapper} ref={pinnedRef}>
						<button
							className={`${styles.iconButton} ${showPinnedMessages ? styles.active : ''}`}
							onClick={onTogglePinnedMessages}
							title="Pinned messages"
							aria-label={showPinnedMessages ? 'Hide pinned messages' : 'Show pinned messages'}
							aria-pressed={showPinnedMessages}
						>
							<PinIcon width={24} height={24} />
						</button>
						{showPinnedMessages && <PinnedMessagesDropdown onClose={onTogglePinnedMessages} />}
					</div>
					<button
						className={`${styles.iconButton} ${showMembers ? styles.active : ''}`}
						onClick={onToggleMembers}
						title="Toggle member list"
						aria-label={showMembers ? 'Hide member list' : 'Show member list'}
						aria-pressed={showMembers}
					>
						<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
							<path d="M14 8.00598C14 10.211 12.206 12.006 10 12.006C7.795 12.006 6 10.211 6 8.00598C6 5.80098 7.794 4.00598 10 4.00598C12.206 4.00598 14 5.80098 14 8.00598ZM2 19.006C2 15.473 5.29 13.006 10 13.006C14.711 13.006 18 15.473 18 19.006V20.006H2V19.006ZM20 20.006H22V19.006C22 16.4919 20.2085 14.4617 17.4491 13.4466C19.0315 14.5771 20 16.5103 20 19.006V20.006ZM14 3.99902C15.5 4.5 17 6 16.9999 8.00598C17 10 15.5 11.5 14 11.999C14.6254 11.0792 15 9.93913 15 8.00598C15 6.07283 14.6254 4.91882 14 3.99902Z" />
						</svg>
					</button>
				</div>
				<div className={styles.inputContainer}>
					<input className={styles.headerInput} placeholder={searchPlaceholder}></input>
					<div className={styles.headerInputIcon}>
						<MagnifyingGlass width={15} height={15} fill="#aaaab0" />
					</div>
				</div>
			</div>
		</header>
	)
}

const ChannelType = {
	GUILD_TEXT: 0,
	DM: 1,
	GUILD_VOICE: 2,
	GROUP_DM: 3,
	GUILD_CATEGORY: 4,
	GUILD_ANNOUNCEMENT: 5,
	ANNOUNCEMENT_THREAD: 10,
	PUBLIC_THREAD: 11,
	PRIVATE_THREAD: 12,
	GUILD_STAGE_VOICE: 13,
	GUILD_FORUM: 15,
	GUILD_MEDIA: 16
} as const

function getChannelIcon(type: number) {
	switch (type) {
		case ChannelType.GUILD_VOICE:
		case ChannelType.GUILD_STAGE_VOICE:
			return VoiceChannelIcon
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
