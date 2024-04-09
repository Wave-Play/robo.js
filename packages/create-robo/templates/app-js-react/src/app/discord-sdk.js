import { DiscordSDK } from '@discord/embedded-app-sdk'
import { useState, useEffect, useCallback } from 'react'

export const discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID)

/**
 * Authenticate with Discord and return the access token.
 */
export async function authenticate() {
	await discordSdk.ready()
	const { code } = await discordSdk.commands.authorize({
		client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
		response_type: 'code',
		state: '',
		prompt: 'none',
		scope: ['identify', 'guilds']
	})

	const response = await fetch('/api/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ code })
	})

	const data = await response.json()
	return data.access_token
}

/**
 * Hook to check if the Discord SDK is ready.
 */
export function useDiscordSdk() {
	const [discordSdkReady, setDiscordSdkReady] = useState(false)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(null)

	const setupDiscordSdk = useCallback(async () => {
		try {
			await discordSdk.ready()
			setDiscordSdkReady(true)
		} catch (e) {
			if (e instanceof Error) {
				setError(e.message)
			} else {
				console.error('An unknown error occurred:', e)
				setError('An unknown error occurred')
			}
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		setupDiscordSdk()
	}, [setupDiscordSdk])

	return { discordSdk, error, loading, ready: discordSdkReady }
}

/**
 * Hook to authenticate with Discord.
 */
export function useDiscordAuth() {
	const [accessToken, setAccessToken] = useState(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(null)

	useEffect(() => {
		setLoading(true)
		authenticate()
			.then((token) => {
				setAccessToken(token)
			})
			.catch((e) => {
				if (e instanceof Error) {
					setError(e.message)
				} else {
					console.error('An unknown error occurred:', e)
					setError('An unknown error occurred')
				}
			})
			.finally(() => {
				setLoading(false)
			})
	}, [])

	return { accessToken, authenticated: !!accessToken, loading, error }
}
