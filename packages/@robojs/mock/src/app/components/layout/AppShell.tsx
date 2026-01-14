import { useCallback, useMemo, useState } from 'react'
import { useSession } from '../../hooks/useSession'
import { useIsPlaybackMode, usePlaybackChannels, usePlaybackMembers } from '../../stores/playbackStore'
import { FriendsAppShell } from '../friends'
import { ServerList } from '../sidebar/ServerList'
import { ChannelList } from '../sidebar/ChannelList'
import { VoiceControlDock } from '../sidebar/VoiceControlDock'
import { Header } from './Header'
import { StatusBar } from './StatusBar'
import { MessageArea } from '../messages/MessageArea'
import { MemberList } from '../members/MemberList'
import { PlaybackControls } from '../playback/PlaybackControls'
import { DevToolsPanel } from '../devtools/DevToolsPanel'
import { LogsPanel } from '../logs/LogsPanel'
import styles from './AppShell.module.css'

export function AppShell() {
	const {
		guilds,
		guildChannels,
		guildMembers,
		guildRoles,
		guildVoiceStates,
		voiceStates,
		channels,
		users,
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

	// Home view toggle (Friends UI) via the top-left Home button in the server list.
	const [showHome, setShowHome] = useState(false)
	const [homeTitle, setHomeTitle] = useState('Friends')
	const [homeResetKey, setHomeResetKey] = useState(0)

	// Mobile sidebar state
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

	// Threads panel state
	const [showThreads, setShowThreads] = useState(false)

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
		const botInUsers = users.some((u) => u.id === botUser.id)
		return botInUsers ? users : [...users, botUser]
	}, [users, botUser])

	const handleMobileMenuToggle = useCallback(() => {
		setMobileSidebarOpen((prev) => !prev)
	}, [])

	// Wrap guild selection to exit Home view
	const handleGuildSelect = useCallback(
		(guildId: string | null) => {
			setShowHome(false)
			selectGuild(guildId)
		},
		[selectGuild]
	)

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

	const handleHomeClick = useCallback(() => {
		// Home button should always take you to Friends/Home (no toggle-off).
		// Users go back to the server UI by clicking a server.
		setShowHome(true)
		setHomeTitle('Friends')
		setHomeResetKey((k) => k + 1)
		selectGuild(null)
		selectChannel(null)
		// Close any open mobile sidebars/dropdowns when switching
		setMobileSidebarOpen(false)
		setShowThreads(false)
		setShowNotifications(false)
		setShowPinnedMessages(false)
	}, [selectGuild, selectChannel])

	const guildName = () => {
		const filterGuilds = guilds.filter((guild) => guild.id === selectedGuildId)
		if (filterGuilds.length > 0) {
			return `${filterGuilds[0].icon ? filterGuilds[0].icon + ' | ' : ''}  ${filterGuilds[0].name}`
		}
		return 'unknown guild name'
	}

	const topTitle = showHome ? homeTitle : guildName()

	const shellClassName = `${styles.shell}${mobileSidebarOpen ? ` ${styles.sidebarOpen}` : ''}`

	return (
		<div className={shellClassName}>
			<div className={styles.topShell}>
				<div className={styles.topTitle}>{topTitle}</div>
				<div className={styles.topIcons} aria-label="Top bar actions">
					<button className="icon-button" aria-label="Inbox" title="Inbox" type="button">
						<svg
							width="22"
							height="22"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.25"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
							<path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
						</svg>
					</button>
					<button className="icon-button" aria-label="Help" title="Help" type="button">
						<svg
							width="22"
							height="22"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.25"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<circle cx="12" cy="12" r="10" />
							<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
							<path d="M12 17h.01" />
						</svg>
					</button>
				</div>
			</div>

			{/* Body wrapper - main content + logs panel in a row */}
			<div className={styles.bodyWrapper}>
				{/* Main area - everything except logs panel */}
				<div className={styles.mainArea}>
					<div className={styles.contentWrapper}>
						<div className={styles.serverList}>
							<ServerList
								guilds={guilds}
								selectedId={selectedGuildId}
								onSelect={handleGuildSelect}
								sessionId={sessionId}
								onHomeClick={handleHomeClick}
								homeSelected={showHome}
							/>
						</div>

						<div className={styles.mainContent}>
							{showHome ? (
								<FriendsAppShell onTitleChange={setHomeTitle} resetKey={homeResetKey} />
							) : (
								<>
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
											guild={selectedGuild}
											currentUser={currentUser}
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
										/>

										<div className={styles.content}>
											<MessageArea channelId={selectedChannelId} />
											{showMembers && <MemberList members={displayMembers} roles={guildRoles} />}
										</div>
									</div>
								</>
							)}
							{showHome && (
								<div className={styles.voiceDockOverlay}>
									<VoiceControlDock
										currentUser={currentUser ?? null}
										availableUsers={allUsers}
										channels={channels}
										voiceStates={voiceStates}
										currentUserId={currentUser?.id}
										onLeaveVoice={leaveVoice}
										onUpdateVoiceState={updateVoiceState}
										isPlaybackMode={isPlaybackMode}
									/>
								</div>
							)}
						</div>
					</div>

					{/* Bottom bar with playback controls and status */}
					<div className={styles.bottomBar}>
						<PlaybackControls />
						<StatusBar />
					</div>
				</div>

				{/* Logs Panel - pushes content left when open */}
				<LogsPanel />
			</div>

			{/* Developer Tools Panel */}
			<DevToolsPanel />
		</div>
	)
}
