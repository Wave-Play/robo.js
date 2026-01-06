interface Props {
	width?: number
	height?: number
	fill?: string
}

export default function CreateIcon(props: Props) {
	const { width = 25, height = 25, fill = 'currentColor' } = props

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
			<circle cx="12" cy="12" r="10" />
			<path d="M8 12h8" />
			<path d="M12 8v8" />
		</svg>
	)
}
