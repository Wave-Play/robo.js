// @ts-expect-error - This is valid once command file is parsed
import { devCommand, devCommandConfig } from '@roboplay/robo.js/dist/core/debug.js'

export const config = devCommandConfig
export default devCommand
