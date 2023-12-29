export default async function CheckPost(req, res) {
	const body = req.body

	if (body.name === 'x' && body.id === 9999) {
		return res.code(200).send('valid request')
	} else {
		return res.code(404).send('invalid request')
	}
}
