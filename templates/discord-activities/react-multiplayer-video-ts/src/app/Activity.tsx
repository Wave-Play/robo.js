import { useDiscordSdk } from '../hooks/useDiscordSdk'
import { useSyncState } from '@robojs/sync'
import { useEffect, useRef } from 'react'

export const Activity = () => {
	const { discordSdk } = useDiscordSdk()
	const [isPlaying, setPlaying] = useSyncState(false, ['video', discordSdk.channelId])
	const videoPlayer = useRef<HTMLVideoElement>(null)

	const onPause = () => {
		if (isPlaying) {
			setPlaying(false)
		}
	}
	const onPlay = () => {
		if (!isPlaying) {
			setPlaying(true)
		}
	}

	useEffect(() => {
		if (isPlaying) {
			videoPlayer.current?.play()
		} else if (!isPlaying) {
			videoPlayer.current?.pause()
		}
	}, [isPlaying])

	return (
		<div>
			<img src="/rocket.png" className="logo" alt="Discord" />
			<br />
			<video ref={videoPlayer} className="video" src="/sample.mp4" controls={false} loop />
			<br />
			<button onClick={isPlaying ? onPause : onPlay}>{isPlaying ? 'Pause' : 'Play'}</button>
		</div>
	)
}
