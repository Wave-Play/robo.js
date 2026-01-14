import { useId } from 'react'
import styles from './ControlIconButton.module.css'

interface ControlIconButtonProps {
	label: string
	children: React.ReactNode
	onClick?: () => void
	isActive?: boolean
	isDisabled?: boolean
	tone?: 'default' | 'danger' | 'warning'
	size?: 'sm' | 'md' | 'lg'
	tooltipPlacement?: 'top' | 'bottom'
	className?: string
}

export function ControlIconButton({
	label,
	children,
	onClick,
	isActive = false,
	isDisabled = false,
	tone = 'default',
	size = 'md',
	tooltipPlacement = 'top',
	className
}: ControlIconButtonProps) {
	const tooltipId = useId()
	const classes = [
		styles.button,
		size === 'sm' && styles.sizeSm,
		size === 'lg' && styles.sizeLg,
		isActive && styles.active,
		isDisabled && styles.disabled,
		tone === 'danger' && styles.toneDanger,
		tone === 'warning' && styles.toneWarning,
		className
	].filter(Boolean).join(' ')
	const tooltipClasses = [
		styles.tooltip,
		tooltipPlacement === 'bottom' && styles.tooltipBottom
	].filter(Boolean).join(' ')

	return (
		<div className={styles.wrapper}>
			<button
				type="button"
				className={classes}
				onClick={isDisabled ? undefined : onClick}
				disabled={isDisabled}
				aria-label={label}
				aria-pressed={isActive}
				aria-describedby={tooltipId}
			>
				{children}
			</button>
			<span id={tooltipId} role="tooltip" className={tooltipClasses}>
				{label}
			</span>
		</div>
	)
}
