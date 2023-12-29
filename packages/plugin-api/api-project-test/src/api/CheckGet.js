export default async function CheckGet(req, res) {
	const dataSet = [
		{
			name: 'michael',
			age: '31'
		},
		{
			name: 'kevin',
			age: '32'
		}
	]

	const query = req.query

	console.log('THE QUERY IN GET', query)

	const isUser = dataSet.filter((user) => user.name === query.name)

	if (isUser) {
		return res.code(200).send('User found !')
	} else {
		return res.code(404).send('User not found !')
	}
}
