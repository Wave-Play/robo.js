declare module '@react-email/components' {
	const components: Record<string, unknown>
	export = components
}

declare module 'react-dom/server' {
	export function renderToStaticMarkup(element: unknown): string
}
