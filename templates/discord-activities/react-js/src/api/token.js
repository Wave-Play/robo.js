export default async (req) => {
	try {
		const { code } = await req.json();

		// Destructure environment variables
		const { VITE_DISCORD_CLIENT_ID: clientId, DISCORD_CLIENT_SECRET: clientSecret } = process.env;

		// Exchange the code for an access token
		const response = await fetch('https://discord.com/api/oauth2/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				client_id: clientId,
				client_secret: clientSecret,
				grant_type: 'authorization_code',
				code
			})
		});

		// Ensure response is successful
		if (!response.ok) throw new Error('Failed to exchange code for access token');

		const { access_token } = await response.json();
		return { access_token };
	} catch (error) {
		console.error(error);
		return { error: 'Authentication failed' };
	}
};
