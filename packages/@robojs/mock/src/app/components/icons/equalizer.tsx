interface Props {
	width?: number
	height?: number
	className?: string
}

export default function EqualizerIcon({ width = 20, height = 20, className }: Props) {
	return (
		<svg
			className={className}
			width={width}
			height={height}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.25"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M10 5H3" />
			<path d="M12 19H3" />
			<path d="M14 3v4" />
			<path d="M16 17v4" />
			<path d="M21 12h-9" />
			<path d="M21 19h-5" />
			<path d="M21 5h-7" />
			<path d="M8 10v4" />
			<path d="M8 12H3" />
		</svg>
	)
}
