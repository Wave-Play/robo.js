// @ts-expect-error - This is valid once command file is parsed
import { devLogCommand, devLogCommandConfig } from 'robo.js/dist/core/debug.js'

export const config = devLogCommandConfig
export default devLogCommand
