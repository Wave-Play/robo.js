import { assetUrl } from '../../utils/api'

interface Props {
	width?: number
	height?: number
	className?: string
}

export default function ChannelIcon(props: Props) {
	const { width = 20, height = 20, className } = props

	return (
		<img
			src={assetUrl('/icons/discord_channel_icon.png')}
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
