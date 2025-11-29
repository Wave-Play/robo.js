'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { signIn, getCsrfToken } from '@robojs/auth/client'
import styles from './login.module.css'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [csrfToken, setCsrfToken] = useState('')

  useEffect(() => {
    async function fetchCsrf() {
      const token = await getCsrfToken()
      if (token) setCsrfToken(token)
    }
    fetchCsrf()
  }, [])

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    setSuccess('')

    try {
      const callbackUrl = `${window.location.origin}/dashboard`
      
      const result = await signIn('credentials', {
        email,
        password,
        callbackUrl,
        csrfToken
      }, undefined, false)
      
      if (result && 'error' in result && result.error) {
        setError('Invalid email or password')
      } else if (result && 'ok' in result && result.ok) {
        // Redirect manually on success
        const url = 'url' in result ? result.url : undefined
        window.location.href = url || callbackUrl
      } else {
        setError('Sign in failed (unknown error)')
      }
    } catch (err) {
      setError('An unexpected error occurred')
      console.error('SignIn exception:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDiscordLogin = async () => {
    setIsLoading(true)
    try {
      const callbackUrl = `${window.location.origin}/dashboard`
      await signIn('discord', { callbackUrl, csrfToken }, undefined, true)
    } catch (err) {
      console.error(err)
    }
  }

  const handlePasswordReset = async () => {
    if (!email) {
      setError('Please enter your email address to reset your password.')
      return
    }
    
    setIsLoading(true)
    setError('')
    setSuccess('')
    
    try {
      const response = await fetch('/api/auth/password/reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      
      if (response.ok) {
        setSuccess('If an account exists, a reset email has been sent.')
      } else {
        setError('Failed to send reset email. Please try again.')
      }
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <Link href="/" className={styles.backLink}>
          Back to Home
        </Link>
        <h1 className={styles.title}>Sign In</h1>
        
        {error && <div className={styles.error}>{error}</div>}
        {success && <div className={styles.success}>{success}</div>}

        <form onSubmit={handleEmailLogin} className={styles.form}>
          <div className={styles.inputGroup}>
            <label htmlFor="email" className={styles.label}>Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
              required
            />
          </div>
          
          <div className={styles.inputGroup}>
            <label htmlFor="password" className={styles.label}>Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              required
            />
            <button type="button" onClick={handlePasswordReset} className={styles.forgotPassword}>
              Forgot password?
            </button>
          </div>

          <button type="submit" className={styles.button} disabled={isLoading}>
            {isLoading ? 'Signing in...' : 'Sign in with Email'}
          </button>
        </form>

        <div className={styles.divider}>
          <span>or</span>
        </div>

        <button onClick={handleDiscordLogin} className={styles.socialButton} disabled={isLoading}>
          Sign in with Discord
        </button>

        <div className={styles.signupContainer}>
          Don't have an account? <Link href="/signup" className={styles.link}>Sign up</Link>
        </div>
      </div>
    </div>
  )
}
