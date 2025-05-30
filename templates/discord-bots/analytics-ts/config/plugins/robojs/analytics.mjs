import { GoogleAnalytics, PlausibleAnalytics, ManyEngines } from '@robojs/analytics'

export default {
    engine: new PlausibleAnalytics()// new ManyEngines(new GoogleAnalytics(), new Plausible())
}
