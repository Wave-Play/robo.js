/**
 * TLS/SSL Utilities for Mock Server
 *
 * Generates self-signed certificates for testing purposes.
 * Used by the voice gateway to support wss:// connections.
 */

// Cache generated certificate to avoid regenerating for each voice gateway start
let cachedCert: { key: string; cert: string } | null = null

// Cache the selfsigned module once loaded
let selfsignedModule: { generate: (attrs: { name: string; value: string }[], opts: { keySize: number; days: number; algorithm: string }) => Promise<{ private: string; cert: string }> } | null = null

/**
 * Generate a self-signed certificate for testing
 * Returns PEM-encoded key and certificate
 */
export async function generateSelfSignedCert(): Promise<{ key: string; cert: string }> {
	// Return cached cert if available
	if (cachedCert) {
		return cachedCert
	}

	// Dynamically import selfsigned to avoid require in ESM
	if (!selfsignedModule) {
		selfsignedModule = await import('selfsigned')
	}

	// Generate new self-signed certificate
	const attrs = [{ name: 'commonName', value: 'localhost' }]
	const pems = await selfsignedModule!.generate(attrs, {
		keySize: 2048,
		days: 365,
		algorithm: 'sha256'
	})

	cachedCert = {
		key: pems.private,
		cert: pems.cert
	}

	return cachedCert
}

