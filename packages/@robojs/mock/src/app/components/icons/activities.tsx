interface Props {
	width?: number
	height?: number
	fill?: string
}

export default function ActivitiesIcon({ width = 30, height = 30, fill = 'currentColor' }: Props) {
	return (
		<svg width={width} height={height} viewBox="0 0 10 10" fill={fill}>
			<rect x="0.5" y="0.5" width="3.5" height="3.5" rx="0.8" transform="rotate(15 2.25 2.25)" />
			<path d="M7.75,0.3 L9.6,3.5 Q9.8,3.9 9.4,3.9 L6.1,3.9 Q5.7,3.9 5.9,3.5 Z" />
			<circle cx="2.25" cy="7.75" r="1.75" />
			<rect x="6.25" y="6.25" width="3" height="3" rx="0.7" transform="rotate(45 7.75 7.75)" />
		</svg>
	)
}
