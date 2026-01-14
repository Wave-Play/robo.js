import { assetUrl } from '../../utils/api'

interface Props {
	width?: number
	height?: number
	className?: string
}

export default function NotificationIcon(props: Props) {
	const { width = 24, height = 24, className } = props

	return (
		<img
			src={assetUrl('/icons/discord_notification-bell_icon.png')}
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
