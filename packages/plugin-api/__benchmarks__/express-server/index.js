import express from 'express'

const app = express()

app.get('/api/test', (req, res) => {
	const now = new Date()
	console.log(`${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}.${now.getMilliseconds()}`)
	res.send('Hello World!')
})

app.listen(4902, () => {
	console.log('Server is live on port 4902')
})
