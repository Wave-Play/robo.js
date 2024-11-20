import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
	stages: [
		{ duration: '15s', target: 5 }, // Low load (idle scenario)
		{ duration: '45s', target: 100 }, // Ramp-up to high load (announcement scenario)
		{ duration: '30s', target: 5 } // Sustained low load
	]
}

export default function () {
	const response = http.get('http://localhost:4901/api/test')
	check(response, {
		'is status 200': (r) => r.status === 200
	})
	sleep(1)
}
