'use client'

import { useState, useEffect } from 'react'
import { getCsrfToken, signIn } from '@robojs/auth/client'
import Link from 'next/link'
import styles from './signup.module.css'

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

			if (result && 'error' in result && typeof result.error === 'string') {
				throw new Error(result.error)
			}
			
			window.location.href = '/dashboard'
		} catch (err) {
			setError((err as Error).message)
			setLoading(false)
		}
	}

	return (
		<div className={styles.container}>
			<div className={styles.card}>
				<Link href="/" className={styles.backLink}>
					Back to Home
				</Link>
				<h1 className={styles.title}>Create an account</h1>
				
				{error && (
					<div className={styles.error}>
						{error}
					</div>
				)}

				<form onSubmit={handleSubmit} className={styles.form}>
					<input type="hidden" name="csrfToken" value={csrfToken} />
					
					<div className={styles.inputGroup}>
						<label htmlFor="email" className={styles.label}>Email</label>
						<input 
							id="email"
							name="email" 
							type="email" 
							required 
							className={styles.input}
						/>
					</div>

					<div className={styles.inputGroup}>
						<label htmlFor="password" className={styles.label}>Password</label>
						<input 
							id="password"
							name="password" 
							type="password" 
							required 
							minLength={8}
							className={styles.input}
						/>
					</div>

					<div className={styles.inputGroup}>
						<label htmlFor="confirmPassword" className={styles.label}>Confirm Password</label>
						<input 
							id="confirmPassword"
							name="confirmPassword" 
							type="password" 
							required 
							minLength={8}
							className={styles.input}
						/>
					</div>

					<button 
						type="submit" 
						className={styles.button}
						disabled={loading}
					>
						{loading ? 'Creating account...' : 'Sign up'}
					</button>
				</form>

				<div className={styles.loginContainer}>
					Already have an account? <Link href="/login" className={styles.link}>Sign in</Link>
				</div>
			</div>
		</div>
	)
}
