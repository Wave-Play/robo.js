import type { StageUser } from '../../types/stage'
import { FriendsList } from './FriendsList'

export function FriendsOnlinePanel({ users, onOpenUser }: { users: StageUser[]; onOpenUser?: (user: StageUser) => void }) {
	// Filter to show only online users (online, idle, or dnd - not offline)
	const onlineUsers = users.filter((u) => u.status !== 'offline')
	return <FriendsList users={onlineUsers} onOpenUser={onOpenUser} />
}
