interface Props {
	width?: number
	height?: number
	fill?: string
}

export default function PinIcon(props: Props) {
	const { width = 24, height = 24, fill = 'currentColor' } = props

	return (
		<svg
			width={width}
			height={height}
			viewBox="0 0 24 24"
			fill="none"
			stroke={fill}
			strokeWidth="1.25"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M12 17v5" />
			<path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
		</svg>
	)
}
