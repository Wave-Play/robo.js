import { useState, useCallback, useMemo } from 'react'
import { useSession } from '../../hooks/useSession'
import { useIsPlaybackMode, usePlaybackChannels, usePlaybackMembers } from '../../stores/playbackStore'
import { ServerList } from '../sidebar/ServerList'
import { ChannelList } from '../sidebar/ChannelList'
import { Header } from './Header'
import { StatusBar } from './StatusBar'
import { MessageArea } from '../messages/MessageArea'
import { MemberList } from '../members/MemberList'
import { PlaybackControls } from '../playback/PlaybackControls'
import { DevToolsPanel } from '../devtools/DevToolsPanel'
import { ThreadPanel } from '../threads/ThreadPanel'
import styles from './AppShell.module.css'

export function StageAppShell() {
	const {
		guilds,
		guildChannels,
		guildMembers,
		guildRoles,
		guildVoiceStates,
		users,
		messages,
		selectedGuildId,
		selectedChannelId,
		showMembers,
		selectGuild,
		selectChannel,
		toggleMembers,
		selectedChannel,
		selectedGuild,
		botUser,
		currentUser,
		sessionId,
		joinVoice,
		leaveVoice,
		updateVoiceState
	} = useSession()

	// Mobile sidebar state
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

	// Threads panel state
	const [showThreads, setShowThreads] = useState(false)
	const [threadPanel, setThreadPanel] = useState<{
		mode: 'closed' | 'create' | 'view'
		parentId: string | null
		threadId: string | null
	}>({
		mode: 'closed',
		parentId: null,
		threadId: null
	})

	// Notifications dropdown state
	const [showNotifications, setShowNotifications] = useState(false)

	// Pinned messages dropdown state
	const [showPinnedMessages, setShowPinnedMessages] = useState(false)

	// Playback mode hooks
	const isPlaybackMode = useIsPlaybackMode()
	const playbackChannels = usePlaybackChannels(selectedGuildId)
	const playbackMembers = usePlaybackMembers(selectedGuildId)

	// Use playback data when in playback mode, otherwise use session data
	const displayChannels = isPlaybackMode && playbackChannels !== null ? playbackChannels : guildChannels
	const displayMembers = isPlaybackMode && playbackMembers !== null ? playbackMembers : guildMembers

	// Combine users with botUser for voice channel display (Phase 5P)
	const allUsers = useMemo(() => {
		if (!botUser) return users
		// Check if botUser is already in users
		const botInUsers = users.some((u) => u.id === botUser.id)
		return botInUsers ? users : [...users, botUser]
	}, [users, botUser])

	const handleMobileMenuToggle = useCallback(() => {
		setMobileSidebarOpen((prev) => !prev)
	}, [])

	// Wrap channel selection to close mobile sidebar
	const handleChannelSelect = useCallback(
		(channelId: string | null) => {
			if (channelId) {
				selectChannel(channelId)
			}
			setMobileSidebarOpen(false)
		},
		[selectChannel]
	)

	const handleToggleThreads = useCallback(() => {
		setShowThreads((prev) => {
			if (!prev) {
				setShowNotifications(false)
				setShowPinnedMessages(false)
			}
			return !prev
		})
	}, [])

	const handleOpenThreads = useCallback(() => {
		setShowThreads(true)
		setShowNotifications(false)
		setShowPinnedMessages(false)
	}, [])

	const handleToggleNotifications = useCallback(() => {
		setShowNotifications((prev) => {
			if (!prev) {
				setShowThreads(false)
				setShowPinnedMessages(false)
			}
			return !prev
		})
	}, [])

	const handleTogglePinnedMessages = useCallback(() => {
		setShowPinnedMessages((prev) => {
			if (!prev) {
				setShowThreads(false)
				setShowNotifications(false)
			}
			return !prev
		})
	}, [])

	const threadChannels = useMemo(() => {
		return guildChannels.filter((channel) => channel.type === 10 || channel.type === 11 || channel.type === 12)
	}, [guildChannels])

	const handleOpenThreadCreate = useCallback(() => {
		if (!selectedChannel) return
		setThreadPanel({
			mode: 'create',
			parentId: selectedChannel.id,
			threadId: null
		})
		setShowThreads(false)
	}, [selectedChannel])

	const handleThreadCreated = useCallback((threadId: string) => {
		setThreadPanel((prev) => ({
			mode: 'view',
			parentId: prev.parentId,
			threadId
		}))
		setShowThreads(false)
	}, [])

	const handleCloseThreadPanel = useCallback(() => {
		setThreadPanel({
			mode: 'closed',
			parentId: null,
			threadId: null
		})
	}, [])

	const handleThreadSelect = useCallback((threadId: string) => {
		const thread = guildChannels.find((channel) => channel.id === threadId)
		if (!thread) return
		setThreadPanel({
			mode: 'view',
			parentId: thread.parent_id ?? null,
			threadId
		})
		setShowThreads(false)
	}, [guildChannels])

	const handleThreadFullView = useCallback((threadId: string) => {
		selectChannel(threadId)
		setThreadPanel({
			mode: 'closed',
			parentId: null,
			threadId: null
		})
	}, [selectChannel])

	const guildName = () => {
		const filterGuilds = guilds.filter((guild) => guild.id === selectedGuildId)

		if (filterGuilds.length > 0) {
			return `${filterGuilds[0].icon ? filterGuilds[0].icon + ' | ' : ''}  ${filterGuilds[0].name}`
		} else {
			return 'unknown guild name'
		}
	}

	const shellClassName = `${styles.shell}${mobileSidebarOpen ? ` ${styles.sidebarOpen}` : ''}`

	return (
		<div className={shellClassName}>
			<div className={styles.topShell}>
				<span>{guildName()}</span>
			</div>
			<div className={styles.contentWrapper}>
				<div className={styles.serverList}>
					<ServerList guilds={guilds} selectedId={selectedGuildId} onSelect={selectGuild} sessionId={sessionId} />
				</div>
				<div className={styles.mainContent}>
					<ChannelList
						guild={selectedGuild ?? undefined}
						channels={displayChannels}
						selectedId={selectedChannelId}
						onSelect={handleChannelSelect}
						voiceStates={guildVoiceStates}
						users={allUsers}
						members={guildMembers}
						currentUser={currentUser}
						availableUsers={allUsers}
						onJoinVoice={joinVoice}
						onLeaveVoice={leaveVoice}
						onUpdateVoiceState={updateVoiceState}
						currentUserId={currentUser?.id}
						isPlaybackMode={isPlaybackMode}
					/>
					<div className={styles.main}>
						<Header
							channel={selectedChannel}
							onToggleMembers={toggleMembers}
							showMembers={showMembers}
							onToggleThreads={handleToggleThreads}
							showThreads={showThreads}
							onToggleNotifications={handleToggleNotifications}
							showNotifications={showNotifications}
							onTogglePinnedMessages={handleTogglePinnedMessages}
							showPinnedMessages={showPinnedMessages}
							onMobileMenuToggle={handleMobileMenuToggle}
							isMobileSidebarOpen={mobileSidebarOpen}
							threads={threadChannels}
							threadMessages={messages}
							users={users}
							onCreateThread={handleOpenThreadCreate}
							onThreadSelect={handleThreadSelect}
						/>

						<div className={styles.content}>
							<MessageArea
								channelId={selectedChannelId}
								onOpenThreads={handleOpenThreads}
								onOpenThread={handleThreadSelect}
							/>
							{threadPanel.mode !== 'closed' && (
								<ThreadPanel
									mode={threadPanel.mode === 'create' ? 'create' : 'view'}
									parentChannelId={threadPanel.parentId}
									threadId={threadPanel.threadId}
									onClose={handleCloseThreadPanel}
									onThreadCreated={handleThreadCreated}
									onOpenFullView={handleThreadFullView}
								/>
							)}

							{showMembers && threadPanel.mode === 'closed' && (
								<MemberList members={displayMembers} roles={guildRoles} />
							)}
						</div>
					</div>
				</div>
			</div>

			{/* Bottom bar with playback controls and status */}
			<div className={styles.bottomBar}>
				<PlaybackControls />
				<StatusBar />
			</div>

			{/* Developer Tools Panel */}
			<DevToolsPanel />
		</div>
	)
}


