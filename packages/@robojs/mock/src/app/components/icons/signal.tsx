interface Props {
	width?: number
	height?: number
	className?: string
}

export default function SignalIcon({ width = 20, height = 20, className }: Props) {
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
			<path d="M2 20h.01" />
			<path d="M7 20v-4" />
			<path d="M12 20v-8" />
			<path d="M17 20V8" />
			<path d="M22 4v16" />
		</svg>
	)
}
