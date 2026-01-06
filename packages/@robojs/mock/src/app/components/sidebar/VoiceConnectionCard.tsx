import SignalIcon from '../icons/signal'
import PhoneIcon from '../icons/phone'
import VideoIcon from '../icons/video'
import ScreenShareIcon from '../icons/screen_share'
import AppsIcon from '../icons/apps'
import EqualizerIcon from '../icons/equalizer'
import { ControlIconButton } from './ControlIconButton'
import styles from './VoiceConnectionCard.module.css'

interface VoiceConnectionCardProps {
	channelName: string
	onDisconnect?: () => void
}

export function VoiceConnectionCard({ channelName, onDisconnect }: VoiceConnectionCardProps) {
	return (
		<div className={styles.container}>
			<div className={styles.header}>
				<div className={styles.info}>
					<div className={styles.icon}>
						<SignalIcon />
					</div>
					<div className={styles.text}>
						<span className={styles.status}>Voice Connected</span>
						<span className={styles.channelName}>{channelName}</span>
					</div>
				</div>

				<div className={styles.actions}>
					<ControlIconButton label="Connection" size="sm">
						<SignalIcon />
					</ControlIconButton>
					<ControlIconButton
						label="Disconnect"
						tone="danger"
						size="sm"
						onClick={onDisconnect}
						isDisabled={!onDisconnect}
					>
						<PhoneIcon />
					</ControlIconButton>
				</div>
			</div>

			<div className={styles.quickActions}>
				<ControlIconButton label="Video" size="lg" className={styles.quickButton}>
					<VideoIcon />
				</ControlIconButton>
				<ControlIconButton label="Screen Share" size="lg" className={styles.quickButton}>
					<ScreenShareIcon />
				</ControlIconButton>
				<ControlIconButton label="Activities" size="lg" className={styles.quickButton}>
					<AppsIcon />
				</ControlIconButton>
				<ControlIconButton label="Soundboard" size="lg" className={styles.quickButton}>
					<EqualizerIcon />
				</ControlIconButton>
			</div>
		</div>
	)
}
