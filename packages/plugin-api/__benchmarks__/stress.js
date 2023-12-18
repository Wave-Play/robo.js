import http from 'k6/http'
import { sleep, check } from 'k6'

export let options = {
	stages: [
		{ duration: '15s', target: 20 },
		{ duration: '35s', target: 1000 },
		{ duration: '10s', target: 100 }
	]
}

export default function () {
	let response = http.get('http://localhost:4903/api/test')
	check(response, {
		'is status 200': (r) => r.status === 200
	})
	sleep(1)
}
