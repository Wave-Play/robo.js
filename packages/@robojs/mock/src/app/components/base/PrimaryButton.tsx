import styles from './PrimaryButton.module.css'

interface PrimaryButtonBaseProps {
	children: React.ReactNode
	className?: string
	fullWidth?: boolean
	onClick?: React.MouseEventHandler
}

interface PrimaryButtonButtonProps extends PrimaryButtonBaseProps {
	href?: undefined
	disabled?: boolean
	type?: 'button' | 'submit' | 'reset'
	target?: undefined
	rel?: undefined
}

interface PrimaryButtonAnchorProps extends PrimaryButtonBaseProps {
	href: string
	target?: string
	rel?: string
	disabled?: undefined
	type?: undefined
}

type PrimaryButtonProps = PrimaryButtonButtonProps | PrimaryButtonAnchorProps

export function PrimaryButton(props: PrimaryButtonProps) {
	const { children, className, fullWidth, onClick } = props
	const cls = [styles.button, fullWidth && styles.fullWidth, props.disabled && styles.disabled, className]
		.filter(Boolean)
		.join(' ')

	if (props.href) {
		return (
			<a className={cls} href={props.href} target={props.target} rel={props.rel} onClick={onClick}>
				{children}
			</a>
		)
	}

	return (
		<button className={cls} type={props.type ?? 'button'} disabled={props.disabled} onClick={onClick}>
			{children}
		</button>
	)
}
