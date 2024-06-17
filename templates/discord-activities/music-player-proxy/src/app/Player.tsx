import { useState, useRef } from 'react'

interface PlayerProps {
	url: string
}

export const Player = (props: PlayerProps) => {
	const { url } = props
	const audioRef = useRef<HTMLAudioElement>(null)
	const [isPlaying, setIsPlaying] = useState(false)

	const togglePlayPause = () => {
		const audio = audioRef.current

		if (audio && isPlaying) {
			audio.pause()
		} else if (audio && !isPlaying) {
			audio.play()
		}

		setIsPlaying(!isPlaying)
	}

	return (
		<>
			<audio ref={audioRef} src={url} preload="auto" />
			<button onClick={togglePlayPause}>{isPlaying ? 'Pause' : 'Play'}</button>
		</>
	)
}
