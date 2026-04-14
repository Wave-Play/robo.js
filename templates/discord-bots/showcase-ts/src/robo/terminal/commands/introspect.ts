import { createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'
import { Flashcore } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Show Flashcore introspection data'
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	const introspection = await Flashcore.$.introspect()
	const capabilities = Flashcore.$.capabilities()

	ctx.write('Flashcore Introspection\n')
	ctx.write(`Initialized: ${Flashcore.$.isInitialized}\n`)
	ctx.write(`Adapter: ${capabilities?.name ?? 'file (default)'}\n`)
	ctx.write(`Keys: ${introspection.storage.totalKeys}  WAL Pending: ${introspection.walStatus.pendingEntries}\n`)

	if (capabilities) {
		const caps = [
			capabilities.scan ? 'scan' : null,
			capabilities.batch ? 'batch' : null,
			capabilities.ttl ? 'ttl' : null
		].filter(Boolean)
		if (caps.length > 0) {
			ctx.write(`Capabilities: ${caps.join(', ')}\n`)
		}
	}

	if (introspection.plugins.length > 0) {
		ctx.write(`Plugins: ${introspection.plugins.join(', ')}\n`)
	}

	ctx.write(`\nModels (${introspection.models.length}):\n`)
	for (const model of introspection.models) {
		if (model.name.startsWith('_junction_')) continue

		const parts = [`${model.recordCount} records`, `${model.fields.length} fields`]
		if (model.relations.length > 0) parts.push(`${model.relations.length} relations`)
		if (model.indexes.length > 0) parts.push(`${model.indexes.length} indexes`)

		ctx.write(`  ${model.name}: ${parts.join(', ')}\n`)
	}
}
