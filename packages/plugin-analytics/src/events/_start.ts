import { setAnalytics } from '../utils/analytics'
import { DiscordAnalytics } from '../utils/discordAnalytics'

export default () => {
	setAnalytics(new DiscordAnalytics())
}
