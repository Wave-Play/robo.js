export type FriendRowData = {
	id: string
	username: string
	subtitle: string
	status?: 'online' | 'idle' | 'dnd' | 'offline'
	avatar: string | null
}

export const FRIENDS: FriendRowData[] = [
	{ id: '1', username: 'Dreamnugget', subtitle: '', status: 'online', avatar: null },
	{ id: '2', username: 'Jake', subtitle: '', status: 'dnd', avatar: null },
	{ id: '3', username: 'MrBatata', subtitle: 'Code - The month is so slow without her D:', status: 'online', avatar: null },
	{ id: '4', username: 'Pkmmte', subtitle: 'https://robojs.dev', status: 'online', avatar: null },
	{ id: '5', username: 'secretised', subtitle: 'Studying', status: 'online', avatar: null },
	{ id: '6', username: 'Zoryko', subtitle: '', status: 'dnd', avatar: null }
]
