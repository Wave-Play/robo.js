import type { EmailContext, ReactTemplateValue } from './types.js'

let componentsCheck: Promise<void> | undefined
let reactDomServerModule: Promise<{ renderToStaticMarkup: (element: unknown) => string }> | undefined

function missingDependencyError(pkg: string, cause: unknown): Error {
	return new Error(
		`@robojs/auth: using the emails.react field requires ${pkg} to be installed in your project. ` +
		`Run your package manager's install command (for example, npm install ${pkg}) and try again.`,
		{ cause }
	)
}

async function ensureReactEmailComponentsAvailable() {
	if (!componentsCheck) {
		componentsCheck = import('@react-email/components')
			.then(() => undefined)
			.catch((error: unknown) => {
				throw missingDependencyError('@react-email/components', error)
			})
	}
	return componentsCheck
}

async function getReactDomServer() {
	if (!reactDomServerModule) {
		reactDomServerModule = import('react-dom/server')
			.then((mod) => {
				const render = mod.renderToStaticMarkup ?? (mod as { default?: { renderToStaticMarkup?: (element: unknown) => string } }).default?.renderToStaticMarkup
				if (typeof render !== 'function') {
					throw new Error(
						'@robojs/auth: react-dom/server does not expose renderToStaticMarkup. Ensure you are using a compatible react-dom version.'
					)
				}
				return { renderToStaticMarkup: render }
			})
			.catch((error: unknown) => {
				throw missingDependencyError('react-dom', error)
			})
	}
	return reactDomServerModule
}

async function resolveReactValue(
	value: ReactTemplateValue | undefined,
	ctx: EmailContext
): Promise<unknown | null | undefined> {
	if (typeof value === 'function') {
		return await (value as (ctx: EmailContext) => unknown | null | undefined | Promise<unknown | null | undefined>)(
			ctx
		)
	}
	if (value && typeof value === 'object' && 'then' in (value as Record<string, unknown>)) {
		return await (value as Promise<unknown | null | undefined>)
	}
	return value
}

export async function renderReactTemplate(
	value: ReactTemplateValue | undefined,
	ctx: EmailContext
): Promise<string | undefined> {
	if (value == null) return undefined

	await ensureReactEmailComponentsAvailable()
	const element = await resolveReactValue(value, ctx)
	if (element == null) return undefined

	const { renderToStaticMarkup } = await getReactDomServer()
	return renderToStaticMarkup(element)
}
