interface Props {
	width?: number
	height?: number
	fill?: string
}

export default function GiftIcon(props: Props) {
	const { width = 30, height = 30, fill = 'currentColor' } = props
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
			<rect x="3" y="8" width="18" height="4" rx="1" />
			<path d="M12 8v13" />
			<path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
			<path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
		</svg>
	)
}
