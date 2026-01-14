import { assetUrl } from '../../utils/api'

interface Props {
	width?: number
	height?: number
	className?: string
}

export default function ChannelLockIcon(props: Props) {
	const { width = 16, height = 16, className } = props

	return (
		<img
			src={assetUrl('/icons/discord_channel_lock_icon.png')}
			alt=""
			width={width}
			height={height}
			loading="lazy"
			decoding="async"
			className={className}
			style={{ width, height }}
		/>
	)
}
