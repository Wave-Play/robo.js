'use client'

import { useState, useEffect } from 'react'
import { getCsrfToken, signIn } from '@robojs/auth/client'
import Link from 'next/link'

export default function SignupPage() {
	const [csrfToken, setCsrfToken] = useState<string>('')
	const [error, setError] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)

	useEffect(() => {
		getCsrfToken().then((token) => {
			if (token) setCsrfToken(token)
		})
	}, [])

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		setLoading(true)
		setError(null)

		const formData = new FormData(e.currentTarget)
		const email = formData.get('email') as string
		const password = formData.get('password') as string
		const confirmPassword = formData.get('confirmPassword') as string
		
		if (password !== confirmPassword) {
			setError('Passwords do not match')
			setLoading(false)
			return
		}

		try {
			const res = await fetch('/api/auth/signup', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email,
					password,
					passwordConfirm: confirmPassword,
					csrfToken,
					termsAccepted: true
				})
			})

			const data = await res.json().catch(() => ({}))

			if (!res.ok) {
				throw new Error(data.message || data.error || 'Signup failed')
			}

			// Signup successful, now sign in
			const result = await signIn('credentials', {
				email,
				password,
				redirect: false,
				callbackUrl: '/dashboard'
			})

			if (result?.error) {
				throw new Error(result.error)
			}
			
			window.location.href = '/dashboard'
		} catch (err) {
			setError((err as Error).message)
			setLoading(false)
		}
	}

	return (
		<div className="page">
			<div className="card" style={{ maxWidth: '400px', margin: '0 auto' }}>
				<h1 className="card-title">Create an account</h1>
				
				{error && (
					<div className="callout callout--warning" style={{ marginBottom: '1rem' }}>
						{error}
					</div>
				)}

				<form onSubmit={handleSubmit} className="stacked">
					<input type="hidden" name="csrfToken" value={csrfToken} />
					
					<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
						<label htmlFor="email" className="label-muted">Email</label>
						<input 
							id="email"
							name="email" 
							type="email" 
							required 
							className="input"
							style={{
								background: 'rgba(15, 23, 42, 0.75)',
								border: '1px solid rgba(148, 163, 184, 0.35)',
								padding: '10px',
								borderRadius: '4px',
								color: 'white'
							}}
						/>
					</div>

					<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
						<label htmlFor="password" className="label-muted">Password</label>
						<input 
							id="password"
							name="password" 
							type="password" 
							required 
							minLength={8}
							className="input"
							style={{
								background: 'rgba(15, 23, 42, 0.75)',
								border: '1px solid rgba(148, 163, 184, 0.35)',
								padding: '10px',
								borderRadius: '4px',
								color: 'white'
							}}
						/>
					</div>

					<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
						<label htmlFor="confirmPassword" className="label-muted">Confirm Password</label>
						<input 
							id="confirmPassword"
							name="confirmPassword" 
							type="password" 
							required 
							minLength={8}
							className="input"
							style={{
								background: 'rgba(15, 23, 42, 0.75)',
								border: '1px solid rgba(148, 163, 184, 0.35)',
								padding: '10px',
								borderRadius: '4px',
								color: 'white'
							}}
						/>
					</div>

					<button 
						type="submit" 
						className="button button--primary"
						disabled={loading}
						style={{ marginTop: '1rem', width: '100%' }}
					>
						{loading ? 'Creating account...' : 'Sign up'}
					</button>
				</form>

				<p className="text-muted" style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.9rem' }}>
					Already have an account? <Link href="/api/auth/signin">Sign in</Link>
				</p>
			</div>
		</div>
	)
}
