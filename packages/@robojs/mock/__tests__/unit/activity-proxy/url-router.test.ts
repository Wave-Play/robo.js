import { resolveRoute, isRedirectResult } from '../../../src/core/activity-proxy/url-router.js'
import type { ProxySessionConfig } from '../../../src/core/activity-proxy/config-store.js'

describe('Activity Proxy - url-router', () => {
	const baseConfig: ProxySessionConfig = {
		launch_url: 'http://localhost:3000',
		launch_path: '/',
		url_mappings: [{ prefix: '/firestore', target: 'firestore.googleapis.com' }],
		csp_mode: 'relaxed',
		application_id: '1234567890',
		sdk_shim_enabled: true
	}

	test('proxies non-/.proxy absolute paths to activity upstream (Vite ESM imports)', () => {
		const result = resolveRoute('/src/app/App.tsx', '', baseConfig)
		expect(result).not.toBeNull()
		expect(isRedirectResult(result)).toBe(false)
		if (!result || isRedirectResult(result)) return
		expect(result.isProxyRoute).toBe(true)
		expect(result.targetUrl.href).toBe('http://localhost:3000/src/app/App.tsx')
	})

	test('proxies root path "/" to activity upstream (required for Vite HMR WS)', () => {
		const result = resolveRoute('/', '?token=abc', baseConfig)
		expect(result).not.toBeNull()
		expect(isRedirectResult(result)).toBe(false)
		if (!result || isRedirectResult(result)) return
		expect(result.isProxyRoute).toBe(true)
		expect(result.targetUrl.href).toBe('http://localhost:3000/?token=abc')
	})

	test('mapping prefixes still take precedence over activity upstream', () => {
		const result = resolveRoute('/firestore/projects', '?x=1', baseConfig)
		expect(result).not.toBeNull()
		expect(isRedirectResult(result)).toBe(false)
		if (!result || isRedirectResult(result)) return
		expect(result.isProxyRoute).toBe(false)
		expect(result.targetUrl.href).toBe('https://firestore.googleapis.com/projects?x=1')
	})

	test('does not double-apply launch_path when stage already includes it', () => {
		const cfg: ProxySessionConfig = { ...baseConfig, launch_path: '/foo' }

		// Initial iframe URL today is often built as "/.proxy" + launch_path.
		// The router must tolerate that and only apply launch_path once.
		const result = resolveRoute('/.proxy/foo', '', cfg)
		expect(result).not.toBeNull()
		expect(isRedirectResult(result)).toBe(false)
		if (!result || isRedirectResult(result)) return
		expect(result.targetUrl.href).toBe('http://localhost:3000/foo')
	})
})
