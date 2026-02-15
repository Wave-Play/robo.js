import { loadMappingsFile, type MappingsFileActivity } from '../../core/activity-proxy/mappings-file-loader.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

interface ProjectDetectionResult {
	/** Whether @discord/embedded-app-sdk is an installed dependency */
	hasEmbeddedAppSdk: boolean
	/** Whether @robojs/patch is an installed dependency */
	hasRoboPatch: boolean
	/** Status of discord-url-mappings.json in project root */
	detectedMappingsFile: {
		exists: boolean
		valid: boolean
		error?: string
		activities?: MappingsFileActivity[]
	}
	/** Best-effort suggested launch URL (may be null) */
	suggestedLaunchUrl: string | null
	/** Detected application ID from mappings file (may be null) */
	suggestedApplicationId: string | null
}

export function GET() {
	const result: ProjectDetectionResult = {
		hasEmbeddedAppSdk: false,
		hasRoboPatch: false,
		detectedMappingsFile: { exists: false, valid: false },
		suggestedLaunchUrl: null,
		suggestedApplicationId: null
	}

	// 1. Read package.json and check dependencies
	try {
		const packageJsonPath = join(process.cwd(), 'package.json')
		const packageJsonContent = readFileSync(packageJsonPath, 'utf-8')
		const packageJson = JSON.parse(packageJsonContent) as {
			dependencies?: Record<string, string>
			devDependencies?: Record<string, string>
		}

		const allDeps = {
			...packageJson.dependencies,
			...packageJson.devDependencies
		}

		result.hasEmbeddedAppSdk = '@discord/embedded-app-sdk' in allDeps
		result.hasRoboPatch = '@robojs/patch' in allDeps
	} catch {
		// No package.json or invalid -- leave defaults (false)
	}

	// 2. Load and validate discord-url-mappings.json
	const mappingsResult = loadMappingsFile()
	result.detectedMappingsFile = {
		exists: mappingsResult.exists,
		valid: mappingsResult.valid,
		error: mappingsResult.error,
		activities: mappingsResult.data?.activities
	}

	// 3. Compute suggested launch URL
	if (mappingsResult.valid && mappingsResult.data) {
		const firstActivity = mappingsResult.data.activities[0]
		if (firstActivity) {
			result.suggestedLaunchUrl = firstActivity.launch_url
			result.suggestedApplicationId = firstActivity.application_id
		}
	} else if (result.hasEmbeddedAppSdk) {
		// Use the Robo server port — @robojs/server embeds Vite in the same HTTP server
		const port = process.env.PORT ?? '3000'
		result.suggestedLaunchUrl = `http://localhost:${port}`
	}

	return result
}
