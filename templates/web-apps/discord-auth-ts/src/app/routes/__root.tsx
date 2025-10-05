import { useCallback } from 'react'
import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { SessionProvider, useSessionState } from '../session-context'

const NAV_LINKS = [
	{ to: '/', label: 'Home' },
	{ to: '/dashboard', label: 'Dashboard' }
]

const RootShell = () => {
	const { status, signOut, signOutPending } = useSessionState()

	const handleSignOut = useCallback(async () => {
		await signOut()
		window.location.href = '/'
	}, [signOut])

	return (
		<div className="app-shell">
			<header className="nav-bar">
				<Link to="/" className="nav-brand">
					Robo.js Auth Starter
				</Link>
				<nav className="nav-links" aria-label="Primary">
					{NAV_LINKS.map((link) => (
						<Link
							key={link.to}
							to={link.to}
							className="nav-link"
							activeProps={{ className: 'nav-link nav-link--active' }}
						>
							{link.label}
						</Link>
					))}
				</nav>
				<div className="nav-actions">
					{status === 'authenticated' ? (
						<button className="button button--ghost" type="button" onClick={() => { void handleSignOut() }} disabled={signOutPending}>
							{signOutPending ? 'Signing out…' : 'Sign Out'}
						</button>
					) : status === 'loading' ? (
						<span className="text-muted" aria-live="polite">
							Checking session…
						</span>
					) : (
						<a className="button button--ghost" href="/api/auth/signin">
							Sign In
						</a>
					)}
				</div>
			</header>
			<main className="main-content">
				<Outlet />
			</main>
			<footer className="footer">
				Built with{' '}
				<a href="https://robojs.dev" rel="noreferrer" target="_blank">
					<strong>Robo.js</strong>
				</a>
			</footer>
		</div>
	)
}

const RootLayout = () => (
	<SessionProvider>
		<RootShell />
	</SessionProvider>
)

export const Route = createRootRoute({ component: RootLayout })
