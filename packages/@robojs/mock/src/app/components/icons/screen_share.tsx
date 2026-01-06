interface Props {
	width?: number
	height?: number
	className?: string
}

export default function ScreenShareIcon({ width = 20, height = 20, className }: Props) {
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
			<path d="M13 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3" />
			<path d="M8 21h8" />
			<path d="M12 17v4" />
			<path d="m17 8 5-5" />
			<path d="M17 3h5v5" />
		</svg>
	)
}
