import { ProxyConfigStore } from '../../../src/core/activity-proxy/config-store.js'

describe('Activity Proxy - ProxyConfigStore.resolveFromHostname', () => {
	test('matches hostname session part case-insensitively', () => {
		const store = new ProxyConfigStore()
		store.set('sess_AbC123_-Z', {
			launch_url: 'http://localhost:3000',
			launch_path: '/',
			url_mappings: [],
			csp_mode: 'relaxed',
			application_id: '1234567890',
			sdk_shim_enabled: true
		})

		const resolved = store.resolveFromHostname('sess-abc123--z.1234567890.discordsays.localhost:50002')
		expect(resolved?.sessionId).toBe('sess_AbC123_-Z')
	})
})

