import http from 'k6/http'
import { sleep, check } from 'k6'

const HOST = `http://localhost:4903`

export let options = {
	stages: [
		{ duration: '15s', target: 20 },
		{ duration: '35s', target: 1000 },
		{ duration: '10s', target: 100 }
	]
}

export default function () {
	let response = http.get(HOST + '/simple')
	check(response, {
		'is status 200': (r) => r.status === 200
	})

	// Create
	let createRes = http.post(HOST + `/create`, JSON.stringify({ data: 'TestData' }), {
		headers: { 'Content-Type': 'application/json' }
	})
	check(createRes, { 'created status was 200': (r) => r.status === 200 })
	let createdId = createRes.json().id

	// Read
	let readRes = http.get(HOST + `/read/${createdId}`)
	check(readRes, { 'read status was 200': (r) => r.status === 200 })

	// Update
	let updateRes = http.put(HOST + `/update/${createdId}`, JSON.stringify({ data: 'UpdatedData' }), {
		headers: { 'Content-Type': 'application/json' }
	})
	check(updateRes, { 'update status was 200': (r) => r.status === 200 })

	// Delete
	let deleteRes = http.del(HOST + `/delete/${createdId}`)
	check(deleteRes, { 'delete status was 200': (r) => r.status === 200 })

	sleep(1)
}
