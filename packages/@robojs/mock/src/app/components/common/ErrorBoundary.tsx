import { Component, type ReactNode, type ErrorInfo } from 'react'
import { PrimaryButton } from '../base'
import styles from './ErrorBoundary.module.css'

interface ErrorBoundaryProps {
	children: ReactNode
	fallback?: ReactNode
}

interface ErrorBoundaryState {
	hasError: boolean
	error: Error | null
	errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	constructor(props: ErrorBoundaryProps) {
		super(props)
		this.state = {
			hasError: false,
			error: null,
			errorInfo: null
		}
	}

	static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
		return { hasError: true, error }
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		this.setState({ errorInfo })
		console.error('ErrorBoundary caught an error:', error, errorInfo)
	}

	handleReset = (): void => {
		this.setState({
			hasError: false,
			error: null,
			errorInfo: null
		})
	}

	render(): ReactNode {
		if (this.state.hasError) {
			if (this.props.fallback) {
				return this.props.fallback
			}

			return (
				<div className={styles.container}>
					<div className={styles.content}>
						<div className={styles.icon}>
							<WarningIcon />
						</div>
						<h1 className={styles.title}>Something went wrong</h1>
						<p className={styles.message}>
							An unexpected error occurred. This has been logged for investigation.
						</p>

						{process.env.NODE_ENV === 'development' && this.state.error && (
							<details className={styles.details}>
								<summary className={styles.summary}>Error Details</summary>
								<div className={styles.errorStack}>
									<div className={styles.errorName}>{this.state.error.name}: {this.state.error.message}</div>
									{this.state.error.stack && (
										<pre className={styles.stack}>{this.state.error.stack}</pre>
									)}
									{this.state.errorInfo?.componentStack && (
										<>
											<div className={styles.componentStackLabel}>Component Stack:</div>
											<pre className={styles.stack}>{this.state.errorInfo.componentStack}</pre>
										</>
									)}
								</div>
							</details>
						)}

						<PrimaryButton onClick={this.handleReset}>
							Try Again
						</PrimaryButton>
					</div>
				</div>
			)
		}

		return this.props.children
	}
}

function WarningIcon() {
	return (
		<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
			<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-2h2v2h-2zm0-4V7h2v6h-2z" />
		</svg>
	)
}
