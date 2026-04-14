import { getExtensions } from 'robo.js/flashcore'

export function hasExtras(): boolean {
	try {
		const ext = getExtensions()
		return !!ext.transaction
	} catch {
		return false
	}
}
