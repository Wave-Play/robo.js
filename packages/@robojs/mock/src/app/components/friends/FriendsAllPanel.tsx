import type { StageUser } from '../../types/stage'
import { FriendsList } from './FriendsList'

// UI-only: All shows all non-bot users
export function FriendsAllPanel({ users, onOpenUser }: { users: StageUser[]; onOpenUser?: (user: StageUser) => void }) {
	return <FriendsList users={users} onOpenUser={onOpenUser} />
}
