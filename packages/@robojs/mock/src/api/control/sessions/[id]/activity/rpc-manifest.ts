import { getManifest, isManifestLoaded } from '../../../../../activity/schema/manifest-loader.js'

/**
 * GET /api/control/sessions/:id/activity/rpc-manifest
 *
 * Returns the loaded RPC manifest for traceability and DevTools introspection.
 * The manifest is global (not per-session), but lives under the session path
 * for API consistency.
 */
export function GET() {
	if (!isManifestLoaded()) {
		return { error: 'RPC manifest not loaded', status: 503 }
	}

	return getManifest()
}
