import type { RoboRequest } from '@robojs/server'

interface RequestBody {
	code: string
}

export default async (req: RoboRequest) => {
	const { code } = (await req.json()) as RequestBody

	// Exchange the code for an access_token
	const response = await fetch(`https://discord.com/api/oauth2/token`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({
			client_id: process.env.VITE_DISCORD_CLIENT_ID!,
			client_secret: process.env.DISCORD_CLIENT_SECRET!,
			grant_type: 'authorization_code',
			code: code
		})
	})
	const { access_token } = await response.json()

	return { access_token }
}
