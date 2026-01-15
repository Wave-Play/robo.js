import { useCallback, useEffect, useState } from 'react'
import type { StageUser } from '../../types/stage'
import { useStageData } from '../../hooks/useStageData'
import { FriendsSidebar } from './FriendsSidebar'
import { FriendsMain } from './FriendsMain'
import { ActiveNowPanel } from './ActiveNowPanel'
import { FriendProfilePanel } from './dm/FriendProfilePanel'
import { DirectMessageTopBar } from './dm/DirectMessageTopBar'
import styles from './FriendsAppShell.module.css'

export function FriendsAppShell({
	onTitleChange,
	resetKey
}: {
	onTitleChange?: (title: string) => void
	resetKey?: number
}) {
	const { users, openDM } = useStageData()
	const [openUser, setOpenUser] = useState<StageUser | null>(null)
	const [dmChannelId, setDmChannelId] = useState<string | null>(null)
	const [profileOpen, setProfileOpen] = useState(false)

	// Filter out bot users to show only "friends"
	const friends = users.filter((u) => !u.bot)

	// When the user clicks the Home button again, reset to the Friends list.
	useEffect(() => {
		setOpenUser(null)
		setDmChannelId(null)
		setProfileOpen(false)
		onTitleChange?.('Friends')
	}, [resetKey]) // intentionally only keyed on resetKey

	const handleOpenUser = useCallback(async (user: StageUser | null) => {
		if (user) {
			// Create or retrieve DM channel
			try {
				const dmChannel = await openDM(user.id)
				if (dmChannel && typeof dmChannel === 'object' && 'id' in dmChannel) {
					setDmChannelId((dmChannel as { id: string }).id)
				}
			} catch (err) {
				console.error('Failed to open DM:', err)
			}
		} else {
			setDmChannelId(null)
		}
		setOpenUser(user)
		// When a DM opens, default the profile panel to open (matches Discord UX).
		setProfileOpen(!!user)
	}, [openDM])

	return (
		<div className={styles.shell}>
			<aside className={styles.sidebar}>
				<FriendsSidebar openUser={openUser} onOpenUser={handleOpenUser} />
			</aside>
			{openUser ? (
				<div className={`${styles.main} ${styles.mainDm}`}>
					<DirectMessageTopBar user={openUser} profileOpen={profileOpen} onToggleProfile={() => setProfileOpen((v) => !v)} />
					<div className={styles.dmRow}>
						<div className={styles.center}>
							<FriendsMain
								onTitleChange={onTitleChange}
								openUser={openUser}
								onOpenUser={handleOpenUser}
								dmChannelId={dmChannelId}
								users={friends}
							/>
						</div>
						{profileOpen ? (
							<aside className={styles.right}>
								<FriendProfilePanel user={openUser} />
							</aside>
						) : null}
					</div>
				</div>
			) : (
				<div className={styles.main}>
					<div className={styles.center}>
						<FriendsMain
							onTitleChange={onTitleChange}
							openUser={openUser}
							onOpenUser={handleOpenUser}
							dmChannelId={dmChannelId}
							users={friends}
						/>
					</div>
					<aside className={styles.right}>
						<ActiveNowPanel />
					</aside>
				</div>
			)}
		</div>
	)
}
