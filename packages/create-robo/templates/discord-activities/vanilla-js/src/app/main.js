import { DiscordSDK } from '@discord/embedded-app-sdk'
import './style.css'
import rocketLogo from '/rocket.png'

// Will eventually store the authenticated user's access_token
let auth

// Instantiate the SDK
const discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID)

setupDiscordSdk().then(() => {
	console.log('Discord SDK is authenticated')
})

async function setupDiscordSdk() {
	await discordSdk.ready()
	console.log('Discord SDK is ready')

	// Authorize with Discord Client
	const { code } = await discordSdk.commands.authorize({
		client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
		response_type: 'code',
		state: '',
		prompt: 'none',
		scope: ['identify', 'guilds']
	})

	// Retrieve an access_token from your activity's server
	const response = await fetch('/.proxy/api/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			code
		})
	})
	const { access_token } = await response.json()

	// Authenticate with Discord client (using the access_token)
	auth = await discordSdk.commands.authenticate({
		access_token
	})

	if (auth == null) {
		throw new Error('Authenticate command failed')
	}
}

document.querySelector('#app').innerHTML = `
  <div>
    <img src="${rocketLogo}" class="logo" alt="Discord" />
    <h1>Hello, World!</h1>
  </div>
`
