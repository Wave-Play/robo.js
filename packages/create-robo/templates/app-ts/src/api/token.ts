import type { RoboRequest } from '@robojs/server'

type RequestBody = {
	code: string
}

export default async (req: RoboRequest<RequestBody>) => {
	// Exchange the code for an access_token
	const response = await fetch(`https://discord.com/api/oauth2/token`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({
			client_id: process.env.VITE_DISCORD_CLIENT_ID ?? '',
			client_secret: process.env.DISCORD_CLIENT_SECRET ?? '',
			grant_type: 'authorization_code',
			code: req.body.code
		})
	})

	// Retrieve the access_token from the response
	const { access_token } = await response.json()

	// Return the access_token to our client as { access_token: "..."}
	return { access_token }
}
