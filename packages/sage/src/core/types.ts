export interface PackageJson {
	dependencies?: Record<string, string>
	devDependencies?: Record<string, string>
	workspaces: Array<string>
	name: string
	repository?: {
		directory: string
		type: string
		url: string
	}
	version: string
}
