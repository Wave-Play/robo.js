import { BaseEngine } from "./analytics.js";
import { logger } from "robo.js";
export class GoogleAnalytics extends BaseEngine {
    async view(page, options) {
        if (isRequestValid(this._MEASURE_ID, this._TOKEN, options)) {
            if (typeof options.data === 'object' && options.name === 'pageview') {
                const res = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${this._MEASURE_ID}&api_secret=${this._TOKEN}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        client_id: options.userID,
                        events: [
                            {
                                name: options.name,
                                params: options.data
                            }
                        ]
                    })
                });
                if (!res.ok) {
                    throw new Error(`[GoogleAnalytics] ${res.statusText} ${res.status}`);
                }
            }
        }
    }
    async event(options) {
        if (isRequestValid(this._MEASURE_ID, this._TOKEN, options)) {
            if (typeof options.data === 'object' && options.name !== 'pageview') {
                const res = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${this._MEASURE_ID}&api_secret=${this._TOKEN}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        client_id: options.userID,
                        events: [
                            {
                                name: options.name,
                                params: options.data
                            }
                        ]
                    })
                });
                if (!res.ok) {
                    throw new Error(`[GoogleAnalytics] ${res.statusText} ${res.status}`);
                }
            }
        }
    }
    constructor(...args){
        super(...args);
        this._MEASURE_ID = process.env.GOOGLE_ANALYTICS_MEASURE_ID;
        this._TOKEN = process.env.GOOGLE_ANALYTICS_SECRET;
    }
}
function isRequestValid(id, token, options) {
    if (!options?.action) {
        logger.error('[GoogleAnalytics] please set an Event : ');
        logger.debug('pageview, event, transaction, item, social, timing, exception');
        return false;
    }
    if (!options?.type) {
        logger.error('[GoogleAnalytics] please set the type of interaction, ex: button');
        return false;
    }
    if (!options?.actionType) {
        logger.error('[GoogleAnalytics] please set an action Type, ex: click');
        return false;
    }
    if (!options.userID) {
        logger.error('[GoogleAnalytics] Please set the user ID.');
        return false;
    }
    if (!id) {
        logger.error("[GoogleAnalytics please set the 'process.env.GOOGLE_ANALYTICS_MEASURE_ID' enviromnent variable. ");
        return false;
    }
    if (!token) {
        logger.error("[GoogleAnalytics please set the 'process.env.GOOGLE_ANALYTICS_SECRET' enviromnent variable. ");
        return false;
    }
    return true;
} // function isGoogleParam(option: unknown): option is { name: string; params: Record<string, unknown> } {
 // 	return option.name !== undefined && option.params !== undefined
 // }
 /**
 * 
 * events: [
				{
					name: options.actionType, // Event name
					params: {
						button_id: options.name, // Any custom parameters you want to track
						engagement_time_msec: 100 // Optional: time user engaged with the button
					}
				}
			]
 */ 

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkM6XFxVc2Vyc1xcY2Vsc2lcXERvY3VtZW50c1xcUHJvZ3JhbW1pbmdcXFdvcmtcXHJvYm8uanNcXHBhY2thZ2VzXFxwbHVnaW4tYW5hbHl0aWNzXFxzcmNcXHV0aWxzXFxHb29nbGVBbmFseXRpY3MudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQmFzZUVuZ2luZSwgRXZlbnRPcHRpb25zLCBWaWV3T3B0aW9ucyB9IGZyb20gJy4vYW5hbHl0aWNzJ1xyXG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICdyb2JvLmpzJ1xyXG5cclxuZXhwb3J0IGNsYXNzIEdvb2dsZUFuYWx5dGljcyBleHRlbmRzIEJhc2VFbmdpbmUge1xyXG5cdHByaXZhdGUgX01FQVNVUkVfSUQgPSBwcm9jZXNzLmVudi5HT09HTEVfQU5BTFlUSUNTX01FQVNVUkVfSURcclxuXHRwcml2YXRlIF9UT0tFTiA9IHByb2Nlc3MuZW52LkdPT0dMRV9BTkFMWVRJQ1NfU0VDUkVUXHJcblxyXG5cdHB1YmxpYyBhc3luYyB2aWV3KHBhZ2U6IHN0cmluZywgb3B0aW9uczogVmlld09wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcclxuXHRcdGlmIChpc1JlcXVlc3RWYWxpZCh0aGlzLl9NRUFTVVJFX0lELCB0aGlzLl9UT0tFTiwgb3B0aW9ucykpIHtcclxuXHRcdFx0aWYgKHR5cGVvZiBvcHRpb25zLmRhdGEgPT09ICdvYmplY3QnICYmIG9wdGlvbnMubmFtZSA9PT0gJ3BhZ2V2aWV3Jykge1xyXG5cdFx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKFxyXG5cdFx0XHRcdFx0YGh0dHBzOi8vd3d3Lmdvb2dsZS1hbmFseXRpY3MuY29tL21wL2NvbGxlY3Q/bWVhc3VyZW1lbnRfaWQ9JHt0aGlzLl9NRUFTVVJFX0lEfSZhcGlfc2VjcmV0PSR7dGhpcy5fVE9LRU59YCxcclxuXHRcdFx0XHRcdHtcclxuXHRcdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXHJcblx0XHRcdFx0XHRcdGhlYWRlcnM6IHtcclxuXHRcdFx0XHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nXHJcblx0XHRcdFx0XHRcdH0sXHJcblx0XHRcdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcclxuXHRcdFx0XHRcdFx0XHRjbGllbnRfaWQ6IG9wdGlvbnMudXNlcklELCAvLyBVbmlxdWUgdXNlciBpZGVudGlmaWVyXHJcblx0XHRcdFx0XHRcdFx0ZXZlbnRzOiBbeyBuYW1lOiBvcHRpb25zLm5hbWUsIHBhcmFtczogb3B0aW9ucy5kYXRhIH1dXHJcblx0XHRcdFx0XHRcdH0pXHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0KVxyXG5cclxuXHRcdFx0XHRpZiAoIXJlcy5vaykge1xyXG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbR29vZ2xlQW5hbHl0aWNzXSAke3Jlcy5zdGF0dXNUZXh0fSAke3Jlcy5zdGF0dXN9YClcclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9XHJcblx0cHVibGljIGFzeW5jIGV2ZW50KG9wdGlvbnM6IEV2ZW50T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xyXG5cdFx0aWYgKGlzUmVxdWVzdFZhbGlkKHRoaXMuX01FQVNVUkVfSUQsIHRoaXMuX1RPS0VOLCBvcHRpb25zKSkge1xyXG5cdFx0XHRpZiAodHlwZW9mIG9wdGlvbnMuZGF0YSA9PT0gJ29iamVjdCcgJiYgb3B0aW9ucy5uYW1lICE9PSAncGFnZXZpZXcnKSB7XHJcblx0XHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgZmV0Y2goXHJcblx0XHRcdFx0XHRgaHR0cHM6Ly93d3cuZ29vZ2xlLWFuYWx5dGljcy5jb20vbXAvY29sbGVjdD9tZWFzdXJlbWVudF9pZD0ke3RoaXMuX01FQVNVUkVfSUR9JmFwaV9zZWNyZXQ9JHt0aGlzLl9UT0tFTn1gLFxyXG5cdFx0XHRcdFx0e1xyXG5cdFx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcclxuXHRcdFx0XHRcdFx0aGVhZGVyczoge1xyXG5cdFx0XHRcdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbidcclxuXHRcdFx0XHRcdFx0fSxcclxuXHRcdFx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG5cdFx0XHRcdFx0XHRcdGNsaWVudF9pZDogb3B0aW9ucy51c2VySUQsXHJcblx0XHRcdFx0XHRcdFx0ZXZlbnRzOiBbeyBuYW1lOiBvcHRpb25zLm5hbWUsIHBhcmFtczogb3B0aW9ucy5kYXRhIH1dXHJcblx0XHRcdFx0XHRcdH0pXHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0KVxyXG5cdFx0XHRcdGlmICghcmVzLm9rKSB7XHJcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFtHb29nbGVBbmFseXRpY3NdICR7cmVzLnN0YXR1c1RleHR9ICR7cmVzLnN0YXR1c31gKVxyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH1cclxufVxyXG5cclxuZnVuY3Rpb24gaXNSZXF1ZXN0VmFsaWQoXHJcblx0aWQ6IHN0cmluZyB8IHVuZGVmaW5lZCxcclxuXHR0b2tlbjogc3RyaW5nIHwgdW5kZWZpbmVkLFxyXG5cdG9wdGlvbnM6IEV2ZW50T3B0aW9ucyB8IFZpZXdPcHRpb25zXHJcbik6IGJvb2xlYW4ge1xyXG5cdGlmICghb3B0aW9ucz8uYWN0aW9uKSB7XHJcblx0XHRsb2dnZXIuZXJyb3IoJ1tHb29nbGVBbmFseXRpY3NdIHBsZWFzZSBzZXQgYW4gRXZlbnQgOiAnKVxyXG5cdFx0bG9nZ2VyLmRlYnVnKCdwYWdldmlldywgZXZlbnQsIHRyYW5zYWN0aW9uLCBpdGVtLCBzb2NpYWwsIHRpbWluZywgZXhjZXB0aW9uJylcclxuXHRcdHJldHVybiBmYWxzZVxyXG5cdH1cclxuXHJcblx0aWYgKCFvcHRpb25zPy50eXBlKSB7XHJcblx0XHRsb2dnZXIuZXJyb3IoJ1tHb29nbGVBbmFseXRpY3NdIHBsZWFzZSBzZXQgdGhlIHR5cGUgb2YgaW50ZXJhY3Rpb24sIGV4OiBidXR0b24nKVxyXG5cdFx0cmV0dXJuIGZhbHNlXHJcblx0fVxyXG5cdGlmICghb3B0aW9ucz8uYWN0aW9uVHlwZSkge1xyXG5cdFx0bG9nZ2VyLmVycm9yKCdbR29vZ2xlQW5hbHl0aWNzXSBwbGVhc2Ugc2V0IGFuIGFjdGlvbiBUeXBlLCBleDogY2xpY2snKVxyXG5cdFx0cmV0dXJuIGZhbHNlXHJcblx0fVxyXG5cdGlmICghb3B0aW9ucy51c2VySUQpIHtcclxuXHRcdGxvZ2dlci5lcnJvcignW0dvb2dsZUFuYWx5dGljc10gUGxlYXNlIHNldCB0aGUgdXNlciBJRC4nKVxyXG5cdFx0cmV0dXJuIGZhbHNlXHJcblx0fVxyXG5cdGlmICghaWQpIHtcclxuXHRcdGxvZ2dlci5lcnJvcihcIltHb29nbGVBbmFseXRpY3MgcGxlYXNlIHNldCB0aGUgJ3Byb2Nlc3MuZW52LkdPT0dMRV9BTkFMWVRJQ1NfTUVBU1VSRV9JRCcgZW52aXJvbW5lbnQgdmFyaWFibGUuIFwiKVxyXG5cdFx0cmV0dXJuIGZhbHNlXHJcblx0fVxyXG5cdGlmICghdG9rZW4pIHtcclxuXHRcdGxvZ2dlci5lcnJvcihcIltHb29nbGVBbmFseXRpY3MgcGxlYXNlIHNldCB0aGUgJ3Byb2Nlc3MuZW52LkdPT0dMRV9BTkFMWVRJQ1NfU0VDUkVUJyBlbnZpcm9tbmVudCB2YXJpYWJsZS4gXCIpXHJcblx0XHRyZXR1cm4gZmFsc2VcclxuXHR9XHJcblxyXG5cdHJldHVybiB0cnVlXHJcbn1cclxuXHJcbi8vIGZ1bmN0aW9uIGlzR29vZ2xlUGFyYW0ob3B0aW9uOiB1bmtub3duKTogb3B0aW9uIGlzIHsgbmFtZTogc3RyaW5nOyBwYXJhbXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH0ge1xyXG4vLyBcdHJldHVybiBvcHRpb24ubmFtZSAhPT0gdW5kZWZpbmVkICYmIG9wdGlvbi5wYXJhbXMgIT09IHVuZGVmaW5lZFxyXG4vLyB9XHJcblxyXG4vKipcclxuICogXHJcbiAqIGV2ZW50czogW1xyXG5cdFx0XHRcdHtcclxuXHRcdFx0XHRcdG5hbWU6IG9wdGlvbnMuYWN0aW9uVHlwZSwgLy8gRXZlbnQgbmFtZVxyXG5cdFx0XHRcdFx0cGFyYW1zOiB7XHJcblx0XHRcdFx0XHRcdGJ1dHRvbl9pZDogb3B0aW9ucy5uYW1lLCAvLyBBbnkgY3VzdG9tIHBhcmFtZXRlcnMgeW91IHdhbnQgdG8gdHJhY2tcclxuXHRcdFx0XHRcdFx0ZW5nYWdlbWVudF90aW1lX21zZWM6IDEwMCAvLyBPcHRpb25hbDogdGltZSB1c2VyIGVuZ2FnZWQgd2l0aCB0aGUgYnV0dG9uXHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRdXHJcbiAqL1xyXG4iXSwibmFtZXMiOlsiQmFzZUVuZ2luZSIsImxvZ2dlciIsIkdvb2dsZUFuYWx5dGljcyIsInZpZXciLCJwYWdlIiwib3B0aW9ucyIsImlzUmVxdWVzdFZhbGlkIiwiX01FQVNVUkVfSUQiLCJfVE9LRU4iLCJkYXRhIiwibmFtZSIsInJlcyIsImZldGNoIiwibWV0aG9kIiwiaGVhZGVycyIsImJvZHkiLCJKU09OIiwic3RyaW5naWZ5IiwiY2xpZW50X2lkIiwidXNlcklEIiwiZXZlbnRzIiwicGFyYW1zIiwib2siLCJFcnJvciIsInN0YXR1c1RleHQiLCJzdGF0dXMiLCJldmVudCIsInByb2Nlc3MiLCJlbnYiLCJHT09HTEVfQU5BTFlUSUNTX01FQVNVUkVfSUQiLCJHT09HTEVfQU5BTFlUSUNTX1NFQ1JFVCIsImlkIiwidG9rZW4iLCJhY3Rpb24iLCJlcnJvciIsImRlYnVnIiwidHlwZSIsImFjdGlvblR5cGUiXSwibWFwcGluZ3MiOiJBQUFBLFNBQVNBLFVBQVUsUUFBbUMsaUJBQWE7QUFDbkUsU0FBU0MsTUFBTSxRQUFRLFVBQVM7QUFFaEMsT0FBTyxNQUFNQyx3QkFBd0JGO0lBSXBDLE1BQWFHLEtBQUtDLElBQVksRUFBRUMsT0FBb0IsRUFBaUI7UUFDcEUsSUFBSUMsZUFBZSxJQUFJLENBQUNDLFdBQVcsRUFBRSxJQUFJLENBQUNDLE1BQU0sRUFBRUgsVUFBVTtZQUMzRCxJQUFJLE9BQU9BLFFBQVFJLElBQUksS0FB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