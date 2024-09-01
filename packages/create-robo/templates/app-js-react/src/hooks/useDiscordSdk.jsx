import { DiscordSDK, DiscordSDKMock } from '@discord/embedded-app-sdk'
import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react'

const queryParams = new URLSearchParams(window.location.search)
const isEmbedded = queryParams.get('frame_id') != null

let discordSdk

if (isEmbedded) {
	discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID)
} else {
	// We're using session storage for user_id, guild_id, and channel_id
	// This way the user/guild/channel will be maintained until the tab is closed, even if you refresh
	// Session storage will generate new unique mocks for each tab you open
	// Any of these values can be overridden via query parameters
	// i.e. if you set https://my-tunnel-url.com/?user_id=test_user_id
	// this will override this will override the session user_id value
	const mockUserId = getOverrideOrRandomSessionValue('user_id')
	const mockGuildId = getOverrideOrRandomSessionValue('guild_id')
	const mockChannelId = getOverrideOrRandomSessionValue('channel_id')

	discordSdk = new DiscordSDKMock(import.meta.env.VITE_DISCORD_CLIENT_ID, mockGuildId, mockChannelId)
	const discriminator = String(mockUserId.charCodeAt(0) % 5)

	discordSdk._updateCommandMocks({
		authenticate: async () => {
			return {
				access_token: 'mock_token',
				user: {
					username: mockUserId,
					discriminator,
					id: mockUserId,
					avatar: null,
					public_flags: 1
				},
				scopes: [],
				expires: new Date(2112, 1, 1).toString(),
				application: {
					description: 'mock_app_description',
					icon: 'mock_app_icon',
					id: 'mock_app_id',
					name: 'mock_app_name'
				}
			}
		}
	})
}

export { discordSdk }

function getOverrideOrRandomSessionValue(queryParam) {
	const overrideValue = queryParams.get(queryParam)
	if (overrideValue != null) {
		return overrideValue
	}

	const currentStoredValue = sessionStorage.getItem(queryParam)
	if (currentStoredValue != null) {
		return currentStoredValue
	}

	// Set queryParam to a random 8-character string
	const randomString = Math.random().toString(36).slice(2, 10)
	sessionStorage.setItem(queryParam, randomString)
	return randomString
}

const DiscordContext = createContext({
	accessToken: null,
	authenticated: false,
	discordSdk: discordSdk,
	error: null,
	session: {
		user: {
			id: '',
			username: '',
			discriminator: '',
			avatar: null,
			public_flags: 0
		},
		access_token: '',
		scopes: [],
		expires: '',
		application: {
			rpc_origins: undefined,
			id: '',
			name: '',
			icon: null,
			description: ''
		}
	},
	status: 'pending'
})

export function DiscordContextProvider(props) {
	const { authenticate, children, loadingScreen = null, scope } = props
	const setupResult = useDiscordSdkSetup({ authenticate, scope })

	if (loadingScreen && !['error', 'ready'].includes(setupResult.status)) {
		return <>{loadingScreen}</>
	}

	return <DiscordContext.Provider value={setupResult}>{children}</DiscordContext.Provider>
}

export function useDiscordSdk() {
	return useContext(DiscordContext)
}

/**
 * Authenticate with Discord and return the access token.
 * See full list of scopes: https://discord.com/developers/docs/topics/oauth2#shared-resources-oauth2-scopes
 *
 * @param scope The scope of the authorization (default: ['identify', 'guilds'])
 * @returns The result of the Discord SDK `authenticate()` command
 */
export async function authenticateSdk(options) {
	const { scope = ['identify', 'guilds'] } = options ?? {}

	await discordSdk.ready()
	const { code } = await discordSdk.commands.authorize({
		client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
		response_type: 'code',
		state: '',
		prompt: 'none',
		scope: scope
	})

	const response = await fetch('/api/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ code })
	})

	const { access_token } = await response.json()

	// Authenticate with Discord client (using the access_token)
	const auth = await discordSdk.commands.authenticate({ access_token })

	if (auth == null) {
		throw new Error('Authenticate command failed')
	}
	return { accessToken: access_token, auth }
}

export function useDiscordSdkSetup(options) {
	const { authenticate, scope } = options ?? {}
	const [accessToken, setAccessToken] = useState(null)
	const [session, setSession] = useState(null)
	const [error, setError] = useState(null)
	const [status, setStatus] = useState('pending')

	const setupDiscordSdk = useCallback(async () => {
		try {
			setStatus('loading')
			await discordSdk.ready()

			if (authenticate) {
				setStatus('authenticating')
				const { accessToken, auth } = await authenticateSdk({ scope })
				setAccessToken(accessToken)
				setSession(auth)
			}

			setStatus('ready')
		} catch (e) {
			console.error(e)
			if (e instanceof Error) {
				setError(e.message)
			} else {
				setError('An unknown error occurred')
			}
			setStatus('error')
		}
	}, [authenticate])

	useStableEffect(() => {
		setupDiscordSdk()
	})

	return { accessToken, authenticated: !!accessToken, discordSdk, error, session, status }
}

/**
 * React in development mode re-mounts the root component initially.
 * This hook ensures that the callback is only called once, preventing double authentication.
 */
function useStableEffect(callback) {
	const isRunning = useRef(false)

	useEffect(() => {
		if (!isRunning.current) {
			isRunning.current = true
			callback()
		}
	}, [])
}
