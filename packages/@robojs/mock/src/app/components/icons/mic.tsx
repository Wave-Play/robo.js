interface Props {
	width?: number
	height?: number
	className?: string
}

export default function MicIcon({ width = 20, height = 20, className }: Props) {
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
			<path d="M12 19v3" />
			<path d="M19 10v2a7 7 0 0 1-14 0v-2" />
			<rect x="9" y="2" width="6" height="13" rx="3" />
		</svg>
	)
}
