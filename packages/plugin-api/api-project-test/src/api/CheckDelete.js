export default async function CheckDelete(req, res) {
	let dataSet = [
		{
			name: 'michael',
			age: 56,
			id: 9999
		},
		{
			name: 'kevin',
			age: 32,
			id: 6683
		}
	]
	const body = req.query

	dataSet = dataSet.filter((user) => user.id !== parseInt(body.id, 10))

	if (dataSet.length === 1) {
		return res.code(200).send('User Correctly deleted')
	} else {
		return res.code(404).send('User not found !')
	}
}
