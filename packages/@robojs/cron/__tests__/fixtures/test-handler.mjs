export default async function testHandler(jobId) {
	if (!global.testExecutions) {
		global.testExecutions = []
	}
	global.testExecutions.push({
		jobId,
		timestamp: Date.now()
	})
}
