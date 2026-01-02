import ThreadIcon from '../icons/thread'
import MagnifyingGlass from '../icons/magnifying_glass'
import { assetUrl } from '../../utils/api'
import styles from './ThreadList.module.css'

interface Thread {
	id: string
	name: string
	authorName: string
	authorAvatar?: string
	lastActive: string
	participants: Array<{
		id: string
		avatar?: string
		name: string
	}>
}

interface ThreadListProps {
	threads?: Thread[]
	onClose?: () => void
}

const mockThreads: Thread[] = [
	{
		id: '1',
		name: 'W3Schools Revival: Rebuilding the',
		authorName: '< { ProCoder } />',
		authorAvatar: assetUrl('/avatars/0.png'),
		lastActive: '>30d ago',
		participants: [{ id: '1', name: 'User1', avatar: assetUrl('/avatars/1.png') }]
	},
	{
		id: '2',
		name: 'inno setup alternatives',
		authorName: '/home/mostypc123/',
		authorAvatar: assetUrl('/avatars/2.png'),
		lastActive: '>30d ago',
		participants: [
			{ id: '1', name: 'User1', avatar: assetUrl('/avatars/3.png') },
			{ id: '2', name: 'User2', avatar: assetUrl('/avatars/4.png') }
		]
	},
	{
		id: '3',
		name: 'How to',
		authorName: '00face',
		lastActive: 'December 3, 2024',
		participants: [{ id: '1', name: 'User1', avatar: assetUrl('/avatars/0.png') }]
	}
]

<<<<<<< HEAD
export function ThreadList({ threads = mockThreads }: ThreadListProps) {
=======
export function ThreadList({ threads = [], onClose }: ThreadListProps) {
>>>>>>> 29e5f5ec (fix: adjusted mock ui's small issues)
	return (
		<div className={styles.container}>
			<div className={styles.header}>
				<div className={styles.headerIcon}>
					<ThreadIcon width={24} height={24} fill="var(--interactive-normal)" />
				</div>
				<h2 className={styles.headerTitle}>Threads</h2>
				<div className={styles.searchContainer}>
					<input type="text" className={styles.searchInput} placeholder="Search for Thread Name" />
				</div>
<<<<<<< HEAD
				<button className={styles.createButton}>Create</button>
=======
				<button className={styles.createButton} type="button">
					Create
				</button>
				<button className={styles.closeButton} type="button" onClick={onClose} aria-label="Close threads panel">
					<CloseIcon />
				</button>
>>>>>>> 29e5f5ec (fix: adjusted mock ui's small issues)
			</div>

			<div className={styles.section}>
				<h3 className={styles.sectionTitle}>Older Threads</h3>
			</div>

			<div className={styles.threadList}>
				{threads.length === 0 ? (
					<div className={styles.empty}>No threads yet</div>
				) : (
					threads.map((thread) => (
						<div key={thread.id} className={styles.threadItem}>
							<div className={styles.threadContent}>
								<div className={styles.threadName}>{thread.name}</div>
								<div className={styles.threadMeta}>
									{thread.authorAvatar && (
										<img src={thread.authorAvatar} alt={thread.authorName} className={styles.threadAuthorAvatar} />
									)}
									<span>Started by</span>
									<span className={styles.threadAuthorName}>{thread.authorName}</span>
									<span className={styles.metaDot}>·</span>
									<span>Last active {thread.lastActive}</span>
								</div>
							</div>
							<div className={styles.threadAvatars}>
								{thread.participants.slice(0, 3).map((participant, index) => (
									<img
										key={participant.id}
										src={participant.avatar || assetUrl('/avatars/0.png')}
										alt={participant.name}
										className={styles.participantAvatar}
										style={{ zIndex: 3 - index }}
									/>
								))}
							</div>
						</div>
					))
				)}
			</div>
		</div>
	)
}

function CloseIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
			<path d="M18.3 5.71L12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.29 19.71 2.88 18.29 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.3-6.3z" />
		</svg>
	)
}
