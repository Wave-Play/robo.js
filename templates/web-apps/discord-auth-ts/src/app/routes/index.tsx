import { createFileRoute } from '@tanstack/react-router'
import { useSessionState } from '../session-context'

export const Route = createFileRoute('/')({
	component: HomePage,
})

const highlights = [
	{
		title: 'Auth flows out of the box',
		description:
			'Sign-in routes, sessions, verification emails, and password resets ship ready to run under /api/auth.',
		items: ['Auth.js endpoints ready', 'Email & password included', 'Client signIn/signOut APIs'],
	},
	{
		title: 'Extend Robo.js your way',
		description:
			'Stack plugins in config/plugins to add analytics, realtime sync, cron jobs, or moderation without touching core code.',
		items: ['Plugin ecosystem', 'Indexed commands & routes', 'Shared logger, env & state'],
	},
	{
		title: 'Brand every touchpoint',
		description:
			'Tweak emails, routes, and copy to match your product without rebuilding the underlying auth foundation.',
		items: ['Brandable email templates', 'Configurable pages & redirects', 'Session dashboard ready'],
	},
]

function HomePage() {
	const { status, session } = useSessionState()
	const isSignedIn = status === 'authenticated' && Boolean(session)
	const primaryHref = isSignedIn ? '/dashboard' : '/api/auth/signin'
	const primaryLabel = isSignedIn ? 'Open the dashboard' : 'Sign in to this app'
	const docsHref = 'https://roboplay.dev/docs'

	return (
		<div className="page">
				<section className="hero-card">
					<p className="hero-eyebrow">Robo.js template</p>
					<h1 className="hero-title">Ship branded auth in seconds.</h1>
					<p className="hero-copy">
						This starter bundles Robo.js and <strong>@robojs/auth</strong> so you can authenticate users, protect routes, and surface account context immediately.
					</p>
				<div className="hero-actions">
					<a className="button button--primary" href={primaryHref}>
						{primaryLabel}
					</a>
					<a className="button button--ghost" href={docsHref} target="_blank" rel="noreferrer">
						Read the docs
					</a>
				</div>
				<p className="hero-hint">
					Read the docs to add your own providers, mailer, or adapters.
				</p>
			</section>

			<section className="stacked">
				<h2 className="divider-heading">
					What&apos;s inside
					<span />
				</h2>
					<div className="card-grid">
						{highlights.map((highlight) => (
							<article key={highlight.title} className="card card--hover-accent">
								<h3 className="card-title">{highlight.title}</h3>
								<p className="card-copy">{highlight.description}</p>
								<ul className="card-list">
									{highlight.items.map((item) => (
										<li key={item}>{item}</li>
									))}
								</ul>
							</article>
						))}
					</div>
			</section>

			<section className="callout callout--muted">
				<strong>Need a deeper dive?</strong>
				<span className="text-muted">Browse the Robo.js docs for plugin tips and deploy guidance.</span>
				<a className="button button--subtle" href="https://roboplay.dev/docs" target="_blank" rel="noreferrer">
					View Robo.js documentation
				</a>
			</section>
		</div>
	)
}
