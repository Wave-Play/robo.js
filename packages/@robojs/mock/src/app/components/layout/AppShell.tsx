import { useCallback, useMemo, useState } from 'react'
import { useStageData } from '../../hooks/useStageData'
import { useLogs } from '../../stores/logsStore'
import { FriendsAppShell } from '../friends'
import { ServerList } from '../sidebar/ServerList'
import { ChannelList } from '../sidebar/ChannelList'
import { Header } from './Header'
import { StatusBar } from './StatusBar'
import { MessageArea } from '../messages/MessageArea'
import { MemberList } from '../members/MemberList'
import { ThreadList } from '../threads/ThreadList'
import { LogsPanel } from '../logs'
import { PlaybackControls } from '../playback/PlaybackControls'
import { DevToolsPanel } from '../devtools/DevToolsPanel'
import styles from './AppShell.module.css'

export function AppShell() {
	// Unified hook handles live/playback mode switching automatically
	const {
		guilds,
		channels,
		members,
		roles,
		voiceStates,
		users,
		selectedGuildId,
		selectedChannelId,
		selectedGuild,
		selectedChannel,
		showMembers,
		selectGuild,
		selectChannel,
		toggleMembers,
		botUser,
		currentUser,
		sessionId,
		joinVoice,
		leaveVoice,
		unreadMentions
	} = useStageData()

	// Home view toggle (Friends UI) via the top-left Home button in the server list.
	const [showHome, setShowHome] = useState(false)

	// Mobile sidebar state
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

	// Threads panel state
	const [showThreads, setShowThreads] = useState(false)

	// Notifications dropdown state
	const [showNotifications, setShowNotifications] = useState(false)

	// Pinned messages dropdown state
	const [showPinnedMessages, setShowPinnedMessages] = useState(false)

	// Logs panel state from context
	const { isOpen: showLogs } = useLogs()

	// Combine users with botUser and currentUser for voice channel display
	const allUsers = useMemo(() => {
		const result = [...users]
		// Add botUser if not already in list
		if (botUser && !result.some((u) => u.id === botUser.id)) {
			result.push(botUser)
		}
		// Add currentUser if not already in list
		if (currentUser && !result.some((u) => u.id === currentUser.id)) {
			result.push(currentUser)
		}
		return result
	}, [users, botUser, currentUser])

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
		selectGuild(null)
		selectChannel(null)
		// Close any open mobile sidebars/dropdowns when switching
		setMobileSidebarOpen(false)
		setShowThreads(false)
		setShowNotifications(false)
		setShowPinnedMessages(false)
	}, [selectGuild, selectChannel])

	const guildName = () => {
		if (selectedGuild) {
			return `${selectedGuild.icon ? selectedGuild.icon + ' | ' : ''}  ${selectedGuild.name}`
		}
		return 'unknown guild name'
	}

	const shellClassName = `${styles.shell}${mobileSidebarOpen ? ` ${styles.sidebarOpen}` : ''}`

	return (
		<div className={shellClassName}>
			{/* Body wrapper contains main content + logs panel (pushes content left) */}
			<div className={styles.bodyWrapper}>
				{/* Main area contains everything except logs panel */}
				<div className={styles.mainArea}>
					<div className={styles.topShell}>
						<span>{guildName()}</span>
					</div>

<<<<<<< HEAD
					<div className={styles.contentWrapper}>
						<div className={styles.serverList}>
							<ServerList
								guilds={guilds}
								selectedId={selectedGuildId}
								onSelect={handleGuildSelect}
								sessionId={sessionId}
								onHomeClick={handleHomeClick}
								homeSelected={showHome}
=======
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
								currentUser={botUser}
								availableUsers={allUsers}
								onJoinVoice={joinVoice}
								onLeaveVoice={leaveVoice}
								currentUserId={botUser?.id}
>>>>>>> 29e5f5ec (fix: adjusted mock ui's small issues)
							/>
						</div>

<<<<<<< HEAD
						<div className={styles.mainContent}>
							{showHome ? (
								<FriendsAppShell />
							) : (
								<>
									<ChannelList
										guild={selectedGuild ?? undefined}
										channels={channels}
										selectedId={selectedChannelId}
										onSelect={handleChannelSelect}
										mentionCounts={unreadMentions}
										voiceStates={voiceStates}
										users={allUsers}
										onJoinVoice={joinVoice}
										onLeaveVoice={leaveVoice}
										currentUserId={currentUser?.id}
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
										/>

										<div className={styles.content}>
											<MessageArea channelId={selectedChannelId} />
											{showThreads && <ThreadList />}
											{showMembers && <MemberList members={members} roles={roles} />}
										</div>
									</div>
								</>
							)}
						</div>
					</div>
=======
								<div className={styles.content}>
									<MessageArea channelId={selectedChannelId} />
									{showThreads && <ThreadList onClose={() => setShowThreads(false)} />}
									{showMembers && <MemberList members={displayMembers} roles={guildRoles} />}
								</div>
							</div>
						</>
					)}
>>>>>>> 29e5f5ec (fix: adjusted mock ui's small issues)
				</div>

				{/* Logs panel - outside main area to push everything left */}
				{showLogs && <LogsPanel />}
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
