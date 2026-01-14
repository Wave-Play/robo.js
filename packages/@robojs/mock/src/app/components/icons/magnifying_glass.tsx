interface Props {
	width?: number
	height?: number
	fill?: string
}

export default function MagnifyingGlass(props: Props) {
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
			<path d="m21 21-4.34-4.34" />
			<circle cx="11" cy="11" r="8" />
		</svg>
	)
}
