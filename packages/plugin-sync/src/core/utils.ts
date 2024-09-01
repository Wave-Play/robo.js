export function normalizeKey(key: string | (string | null)[] | undefined): string {
	return (Array.isArray(key) ? key.join('.') : key) as string
}
