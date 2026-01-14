import type { StageMember, StageUser } from '../types/stage'

export function getDisplayName(user?: StageUser, member?: StageMember | null): string {
	const nick = member?.nick?.trim()
	if (nick) {
		return nick
	}
	const resolvedUser = user ?? member?.user
	const globalName = resolvedUser?.global_name?.trim()
	if (globalName) {
		return globalName
	}
	if (resolvedUser?.username) {
		return resolvedUser.username
	}
	return 'Unknown User'
}
