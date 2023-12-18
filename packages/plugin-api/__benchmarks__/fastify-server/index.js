import fastify from 'fastify'

// Create a Fastify instance
const app = fastify()

// Define the GET route
app.get('/api/test', async () => {
	const now = new Date()
	console.log(`${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}.${now.getMilliseconds()}`)
	return 'Hello, World!'
})

// Start the server
app.listen({ port: 4903 }, (err) => {
	if (err) {
		console.error(err)
		process.exit(1)
	}
	console.log('Server is live on port 4903')
})
