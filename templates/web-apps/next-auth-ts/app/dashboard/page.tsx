'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSession, signOut } from '@robojs/auth/client'
import type { Session } from '@robojs/auth/types'

type ExtendedSession = Session & {
	user?: (Session['user'] & { id?: string | null; emailVerified?: string | null }) | null
}

type ResendStatus = 'idle' | 'loading' | 'sent' | 'error'

export default function DashboardPage() {
	const [session, setSession] = useState<ExtendedSession | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [resendStatus, setResendStatus] = useState<ResendStatus>('idle')
	const [signOutPending, setSignOutPending] = useState(false)

	const refreshSession = useCallback(async () => {
		setLoading(true)
		setError(null)
		try {
			const nextSession = await getSession<ExtendedSession>()
			setSession(nextSession)
		} catch (err) {
			console.error('Failed to fetch session', err)
			setError('Unable to load your session. Please try again in a moment.')
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		void refreshSession()
	}, [refreshSession])

	useEffect(() => {
		if (!loading && !session) {
			window.location.replace('/api/auth/signin')
		}
	}, [loading, session])

	const email = session?.user?.email ?? null
	const emailVerified = session?.user?.emailVerified ?? null
	const needsVerification = Boolean(email && !emailVerified)
	const sessionExpires = useMemo(() => formatDate(session?.expires), [session?.expires])
	const emailVerifiedAt = useMemo(() => formatDate(emailVerified), [emailVerified])

	useEffect(() => {
		if (!needsVerification && resendStatus !== 'idle') {
			setResendStatus('idle')
		}
	}, [needsVerification, resendStatus])

	const handleSignOut = useCallback(async () => {
		if (signOutPending) return
		setSignOutPending(true)
		setError(null)
		try {
			await signOut()
			setSession(null)
			// Give the browser a beat to clear cookies before navigating.
			window.setTimeout(() => {
				window.location.href = '/'
			}, 150)
		} catch (err) {
			console.error('Sign-out failed', err)
			setError('Sign-out failed. Please try again or clear your cookies manually.')
		} finally {
			setSignOutPending(false)
		}
	}, [signOutPending])

	const handleResendVerification = useCallback(async () => {
		if (!email || resendStatus === 'loading') return
		setResendStatus('loading')
		try {
			const response = await fetch('/api/auth/verify-email/request', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ email }),
			})
			if (!response.ok) {
				throw new Error(`Unexpected verify-email result: ${response.status}`)
			}
			setResendStatus('sent')
		} catch (err) {
			console.error('Failed to resend verification email', err)
			setResendStatus('error')
		}
	}, [email, resendStatus])

	return (
		<div className="page">
			{loading ? (
				<section className="empty-state" aria-busy="true">
					<h2>Fetching your session</h2>
					<p>
						Hang tight while we talk to <code>/api/auth/session</code>.
					</p>
					<div className="loading-dots" aria-hidden>
						<span />
						<span />
						<span />
					</div>
				</section>
			) : session ? (
				<SessionDetails
					session={session}
					email={email}
					emailVerifiedAt={emailVerifiedAt}
					needsVerification={needsVerification}
					sessionExpires={sessionExpires}
					onRefresh={refreshSession}
					onResend={handleResendVerification}
					onSignOut={handleSignOut}
					resendStatus={resendStatus}
					signOutPending={signOutPending}
				/>
			) : (
				<section className="empty-state" aria-busy="true">
					<h2>Redirecting to sign in…</h2>
					<p>We didn&apos;t find a session, so we&apos;re sending you back to the Auth.js flow.</p>
				</section>
			)}

			{error ? (
				<div className="callout callout--warning" role="alert">
					<strong>Heads up:</strong>
					<span>{error}</span>
				</div>
			) : null}

			<section className="callout callout--muted">
				<strong>Need the raw data?</strong>
				<span className="text-muted">
					This dashboard uses <code>getSession()</code> from <code>@robojs/auth</code>. Reach for{' '}
					<code>getServerSession()</code> inside API routes or command handlers whenever you need server-side checks.
				</span>
				<a
					className="button button--subtle"
					href="https://roboplay.dev/docs/plugins/auth"
					target="_blank"
					rel="noreferrer"
					style={{ alignSelf: 'flex-start' }}
				>
					Read @robojs/auth docs
				</a>
			</section>
		</div>
	)
}

interface SessionDetailsProps {
	session: ExtendedSession
	email: string | null
	emailVerifiedAt: string | null
	needsVerification: boolean
	sessionExpires: string | null
	onRefresh: () => Promise<void>
	onResend: () => Promise<void>
	onSignOut: () => Promise<void>
	resendStatus: ResendStatus
	signOutPending: boolean
}

function SessionDetails(props: SessionDetailsProps) {
	const {
		session,
		email,
		emailVerifiedAt,
		needsVerification,
		sessionExpires,
		onRefresh,
		onResend,
		onSignOut,
		resendStatus,
		signOutPending,
	} = props

	const resendLabel = useMemo(() => {
		switch (resendStatus) {
			case 'sent':
				return 'Verification email sent'
			case 'loading':
				return 'Sending…'
			case 'error':
				return 'Try again'
			default:
				return 'Resend verification email'
		}
	}, [resendStatus])

		return (
			<section className="session-grid">
				<article className="card card--hover-accent">
				<h2 className="card-title">Session overview</h2>
				<ul className="info-list">
					<li>
						<span className="label-muted">User ID</span>
						<span className="value-strong">{session.user?.id ?? '—'}</span>
					</li>
					<li>
						<span className="label-muted">Display name</span>
						<span className="value-strong">{session.user?.name ?? '—'}</span>
					</li>
					<li>
						<span className="label-muted">Email</span>
						<span className="value-strong">{email ?? '—'}</span>
					</li>
					<li>
						<span className="label-muted">Session expires</span>
						<span className="value-strong">{sessionExpires ?? '—'}</span>
					</li>
				</ul>
				<div className="button-row" style={{ marginTop: '16px' }}>
					<button className="button button--ghost" type="button" onClick={() => { void onRefresh() }}>
						Refresh session
					</button>
					<button
						type="button"
						className="button button--subtle"
						onClick={() => { void onSignOut() }}
						disabled={signOutPending}
					>
						{signOutPending ? 'Signing out…' : 'Sign out'}
					</button>
				</div>
			</article>

			<article className={`card ${needsVerification ? 'card--warning' : 'card--success'}`.trimEnd()}>
				<h2 className="card-title">Email verification</h2>
				{needsVerification ? (
					<>
						<p className="card-copy">
							We&apos;re still waiting for {email} to confirm their inbox. Check spam, or resend the verification link.
						</p>
						<span className="status-pill status-pill--warning">Verification pending</span>
						<div className="button-row" style={{ marginTop: '16px' }}>
							<button
								type="button"
								className="button button--primary"
								onClick={() => { void onResend() }}
								disabled={resendStatus === 'loading'}
							>
								{resendLabel}
							</button>
							{resendStatus === 'error' ? (
								<span className="text-muted">Couldn&apos;t send email. Double-check your SMTP settings.</span>
							) : null}
							{resendStatus === 'sent' ? (
								<span className="text-muted">We just sent a new verification link. It expires in about an hour.</span>
							) : null}
						</div>
					</>
				) : (
					<>
						<p className="card-copy">Your email is verified. Welcome aboard!</p>
						<span className="status-pill status-pill--success">Verified</span>
						<p className="card-copy text-muted" style={{ marginTop: '16px' }}>
							Verified on {emailVerifiedAt ?? '—'}. You can reuse this card to surface premium perks or onboarding tasks.
						</p>
					</>
				)}
			</article>

				<article className="card card--hover-accent">
				<h2 className="card-title">Developer quick links</h2>
				<ul className="card-list">
					<li>
						Add your own data by editing{' '}
						<code>app/dashboard/page.tsx</code>.
					</li>
					<li>
						Need the raw API? Hit <code>GET /api/auth/session</code> in your tools or server handlers.
					</li>
					<li>
						Keep your users safe with <code>@robojs/auth</code> helpers like <code>signIn</code>, <code>signOut</code>, and
						<code>getProviders</code>.
					</li>
				</ul>
				<p className="card-copy text-muted" style={{ marginTop: '16px' }}>
					Need to peek behind the scenes? Attach an inspector of your choice or log <code>getServerSession()</code> responses inside your APIs while you iterate.
				</p>
			</article>
		</section>
	)
}

function formatDate(value: string | null | undefined): string | null {
	if (!value) return null
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return value
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(date)
}
