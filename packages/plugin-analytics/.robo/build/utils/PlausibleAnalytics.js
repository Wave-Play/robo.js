import { logger } from "robo.js";
import { BaseEngine } from "./analytics.js";
export class PlausibleAnalytics extends BaseEngine {
    async view(page, options) {
        const temp = {
            name: 'pageview',
            url: options?.url ?? `https://${this._PLAUSIBLE_DOMAIN}${page}`,
            domain: options?.domain ?? this._PLAUSIBLE_DOMAIN
        };
        if (typeof options.data === 'object') {
            if (options.data !== null) {
                if (Object.entries(options.data).length > 30) {
                    throw new Error('[Plausible] Cannot send an object with more than 30 fields.');
                } else {
                    Object.assign(temp, {
                        props: {
                            ...options.data
                        }
                    });
                }
            }
        }
        const res = await fetch('https://plausible.io/api/event', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36'
            },
            body: JSON.stringify(temp)
        });
        if (res.status !== 202) {
            throw new Error(`[Plausible] ${res.statusText} ${res.status}`);
        }
    }
    async event(options) {
        if (!options) return;
        if (options.name === 'pageview') {
            return logger.error(`[Plausible]  Please use Analytics.view(${options.name}, ${options}).`);
        }
        if (!options.domain && !this._PLAUSIBLE_DOMAIN) {
            return logger.error("[Plausible]  Specify a domain to use Plausible's event.");
        }
        if (!options.url) {
            return logger.error("[Plausible]  Specify a URL to use Plausible's event.");
        }
        if (!options.name) {
            return logger.error("[Plausible]  Specify a name to use Plausible's event.");
        }
        const temp = {
            name: options.name,
            url: options?.url ?? `https://${this._PLAUSIBLE_DOMAIN}/`,
            domain: options?.domain ?? this._PLAUSIBLE_DOMAIN
        };
        if (options.revenue) {
            const revenue = options.revenue;
            Object.assign(temp, {
                revenue
            });
        }
        if (typeof options.data === 'object') {
            if (options.data !== null) {
                if (Object.entries(options.data).length > 30) {
                    throw new Error('[Plausible] Cannot send an object with more than 30 fields.');
                } else {
                    Object.assign(temp, {
                        props: {
                            ...options.data
                        }
                    });
                }
            }
        }
        logger.error(temp);
        const res = await fetch('https://plausible.io/api/event', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36'
            },
            body: JSON.stringify(temp)
        });
        if (res.status !== 202) {
            throw new Error(`[Plausible] ${res.statusText} ${res.status}`);
        }
    }
    constructor(...args){
        super(...args);
        this._PLAUSIBLE_DOMAIN = process.env.PLAUSIBLE_DOMAIN;
    }
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkM6XFxVc2Vyc1xcY2Vsc2lcXERvY3VtZW50c1xcUHJvZ3JhbW1pbmdcXFdvcmtcXHJvYm8uanNcXHBhY2thZ2VzXFxwbHVnaW4tYW5hbHl0aWNzXFxzcmNcXHV0aWxzXFxQbGF1c2libGVBbmFseXRpY3MudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAncm9iby5qcydcclxuaW1wb3J0IHsgQmFzZUVuZ2luZSwgRXZlbnRPcHRpb25zLCBWaWV3T3B0aW9ucyB9IGZyb20gJy4vYW5hbHl0aWNzJ1xyXG5cclxuZXhwb3J0IGNsYXNzIFBsYXVzaWJsZUFuYWx5dGljcyBleHRlbmRzIEJhc2VFbmdpbmUge1xyXG5cdHByaXZhdGUgX1BMQVVTSUJMRV9ET01BSU4gPSBwcm9jZXNzLmVudi5QTEFVU0lCTEVfRE9NQUlOXHJcblxyXG5cdHB1YmxpYyBhc3luYyB2aWV3KHBhZ2U6IHN0cmluZywgb3B0aW9uczogVmlld09wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcclxuXHRcdGNvbnN0IHRlbXAgPSB7XHJcblx0XHRcdG5hbWU6ICdwYWdldmlldycsXHJcblx0XHRcdHVybDogb3B0aW9ucz8udXJsID8/IGBodHRwczovLyR7dGhpcy5fUExBVVNJQkxFX0RPTUFJTn0ke3BhZ2V9YCxcclxuXHRcdFx0ZG9tYWluOiBvcHRpb25zPy5kb21haW4gPz8gdGhpcy5fUExBVVNJQkxFX0RPTUFJTlxyXG5cdFx0fVxyXG5cclxuXHRcdGlmICh0eXBlb2Ygb3B0aW9ucy5kYXRhID09PSAnb2JqZWN0Jykge1xyXG5cdFx0XHRpZiAob3B0aW9ucy5kYXRhICE9PSBudWxsKSB7XHJcblx0XHRcdFx0aWYgKE9iamVjdC5lbnRyaWVzKG9wdGlvbnMuZGF0YSkubGVuZ3RoID4gMzApIHtcclxuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignW1BsYXVzaWJsZV0gQ2Fubm90IHNlbmQgYW4gb2JqZWN0IHdpdGggbW9yZSB0aGFuIDMwIGZpZWxkcy4nKVxyXG5cdFx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0XHRPYmplY3QuYXNzaWduKHRlbXAsIHsgcHJvcHM6IHsgLi4ub3B0aW9ucy5kYXRhIH0gfSlcclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaCgnaHR0cHM6Ly9wbGF1c2libGUuaW8vYXBpL2V2ZW50Jywge1xyXG5cdFx0XHRtZXRob2Q6ICdQT1NUJyxcclxuXHRcdFx0aGVhZGVyczoge1xyXG5cdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXHJcblx0XHRcdFx0J1VzZXItQWdlbnQnOlxyXG5cdFx0XHRcdFx0J01vemlsbGEvNS4wIChXaW5kb3dzIE5UIDEwLjA7IFdpbjY0OyB4NjQpIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS82OC4wLjM0NDAuMTA2IFNhZmFyaS81MzcuMzYnXHJcblx0XHRcdH0sXHJcblx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHRlbXApXHJcblx0XHR9KVxyXG5cclxuXHRcdGlmIChyZXMuc3RhdHVzICE9PSAyMDIpIHtcclxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbUGxhdXNpYmxlXSAke3Jlcy5zdGF0dXNUZXh0fSAke3Jlcy5zdGF0dXN9YClcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHB1YmxpYyBhc3luYyBldmVudChvcHRpb25zPzogRXZlbnRPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XHJcblx0XHRpZiAoIW9wdGlvbnMpIHJldHVyblxyXG5cclxuXHRcdGlmIChvcHRpb25zLm5hbWUgPT09ICdwYWdldmlldycpIHtcclxuXHRcdFx0cmV0dXJuIGxvZ2dlci5lcnJvcihgW1BsYXVzaWJsZV0gIFBsZWFzZSB1c2UgQW5hbHl0aWNzLnZpZXcoJHtvcHRpb25zLm5hbWV9LCAke29wdGlvbnN9KS5gKVxyXG5cdFx0fVxyXG5cclxuXHRcdGlmICghb3B0aW9ucy5kb21haW4gJiYgIXRoaXMuX1BMQVVTSUJMRV9ET01BSU4pIHtcclxuXHRcdFx0cmV0dXJuIGxvZ2dlci5lcnJvcihcIltQbGF1c2libGVdICBTcGVjaWZ5IGEgZG9tYWluIHRvIHVzZSBQbGF1c2libGUncyBldmVudC5cIilcclxuXHRcdH1cclxuXHRcdGlmICghb3B0aW9ucy51cmwpIHtcclxuXHRcdFx0cmV0dXJuIGxvZ2dlci5lcnJvcihcIltQbGF1c2libGVdICBTcGVjaWZ5IGEgVVJMIHRvIHVzZSBQbGF1c2libGUncyBldmVudC5cIilcclxuXHRcdH1cclxuXHRcdGlmICghb3B0aW9ucy5uYW1lKSB7XHJcblx0XHRcdHJldHVybiBsb2dnZXIuZXJyb3IoXCJbUGxhdXNpYmxlXSAgU3BlY2lmeSBhIG5hbWUgdG8gdXNlIFBsYXVzaWJsZSdzIGV2ZW50LlwiKVxyXG5cdFx0fVxyXG5cclxuXHRcdGNvbnN0IHRlbXAgPSB7XHJcblx0XHRcdG5hbWU6IG9wdGlvbnMubmFtZSxcclxuXHRcdFx0dXJsOiBvcHRpb25zPy51cmwgPz8gYGh0dHBzOi8vJHt0aGlzLl9QTEFVU0lCTEVfRE9NQUlOfS9gLFxyXG5cdFx0XHRkb21haW46IG9wdGlvbnM/LmRvbWFpbiA/PyB0aGlzLl9QTEFVU0lCTEVfRE9NQUlOXHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKG9wdGlvbnMucmV2ZW51ZSkge1xyXG5cdFx0XHRjb25zdCByZXZlbnVlID0gb3B0aW9ucy5yZXZlbnVlXHJcblx0XHRcdE9iamVjdC5hc3NpZ24odGVtcCwgeyByZXZlbnVlIH0pXHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKHR5cGVvZiBvcHRpb25zLmRhdGEgPT09ICdvYmplY3QnKSB7XHJcblx0XHRcdGlmIChvcHRpb25zLmRhdGEgIT09IG51bGwpIHtcclxuXHRcdFx0XHRpZiAoT2JqZWN0LmVudHJpZXMob3B0aW9ucy5kYXRhKS5sZW5ndGggPiAzMCkge1xyXG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdbUGxhdXNpYmxlXSBDYW5ub3Qgc2VuZCBhbiBvYmplY3Qgd2l0aCBtb3JlIHRoYW4gMzAgZmllbGRzLicpXHJcblx0XHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRcdE9iamVjdC5hc3NpZ24odGVtcCwgeyBwcm9wczogeyAuLi5vcHRpb25zLmRhdGEgfSB9KVxyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdGxvZ2dlci5lcnJvcih0ZW1wKVxyXG5cclxuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKCdodHRwczovL3BsYXVzaWJsZS5pby9hcGkvZXZlbnQnLCB7XHJcblx0XHRcdG1ldGhvZDogJ1BPU1QnLFxyXG5cdFx0XHRoZWFkZXJzOiB7XHJcblx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuXHRcdFx0XHQnVXNlci1BZ2VudCc6XHJcblx0XHRcdFx0XHQnTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzY4LjAuMzQ0MC4xMDYgU2FmYXJpLzUzNy4zNidcclxuXHRcdFx0fSxcclxuXHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkodGVtcClcclxuXHRcdH0pXHJcblxyXG5cdFx0aWYgKHJlcy5zdGF0dXMgIT09IDIwMikge1xyXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFtQbGF1c2libGVdICR7cmVzLnN0YXR1c1RleHR9ICR7cmVzLnN0YXR1c31gKVxyXG5cdFx0fVxyXG5cdH1cclxufVxyXG4iXSwibmFtZXMiOlsibG9nZ2VyIiwiQmFzZUVuZ2luZSIsIlBsYXVzaWJsZUFuYWx5dGljcyIsInZpZXciLCJwYWdlIiwib3B0aW9ucyIsInRlbXAiLCJuYW1lIiwidXJsIiwiX1BMQVVTSUJMRV9ET01BSU4iLCJkb21haW4iLCJkYXRhIiwiT2JqZWN0IiwiZW50cmllcyIsImxlbmd0aCIsIkVycm9yIiwiYXNzaWduIiwicHJvcHMiLCJyZXMiLCJmZXRjaCIsIm1ldGhvZCIsImhlYWRlcnMiLCJib2R5IiwiSlNPTiIsInN0cmluZ2lmeSIsInN0YXR1cyIsInN0YXR1c1RleHQiLCJldmVudCIsImVycm9yIiwicmV2ZW51ZSIsInByb2Nlc3MiLCJlbnYiLCJQTEFVU0lCTEVfRE9NQUlOIl0sIm1hcHBpbmdzIjoiQUFBQSxTQUFTQSxNQUFNLFFBQVEsVUFBUztBQUNoQyxTQUFTQyxVQUFVLFFBQW1DLGlCQUFhO0FBRW5FLE9BQU8sTUFBTUMsMkJBQTJCRDtJQUd2QyxNQUFhRSxLQUFLQyxJQUFZLEVBQUVDLE9BQW9CLEVBQWlCO1FBQ3BFLE1BQU1DLE9BQU87WUFDWkMsTUFBTTtZQUNOQyxLQUFLSCxTQUFTRyxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQ0MsaUJBQWlCLENBQUMsRUFBRUwsS0FBSyxDQUFDO1lBQy9ETSxRQUFRTCxTQUFTSyxVQUFVLElBQUksQ0FBQ0QsaUJBQWlCO1FBQ2xEO1FBRUEsSUFBSSxPQUFPSixRQUFRTSxJQUFJLEtBQUssVUFBVTtZQUNyQyxJQUFJTixRQUFRTSxJQUFJLEtBQUssTUFBTTtnQkFDMUIsSUFBSUMsT0FBT0MsT0FBTyxDQUFDUixRQUFRTSxJQUFJLEVBQUVHLE1BQU0sR0FBRyxJQUFJO29CQUM3QyxNQUFNLElBQUlDLE1BQU07Z0JBQ2pCLE9BQU87b0JBQ05ILE9BQU9JLE1BQU0sQ0FBQ1YsTUFBTTt3QkFBRVcsT0FBTzs0QkFBRSxHQUFHWixRQUFRTSxJQUFJO3dCQUFDO29CQUFFO2dCQUNsRDtZQUNEO1FBQ0Q7UUFFQSxNQUFNTyxNQUFNLE1BQU1DLE1BQU0sa0NBQWtDO1lBQ3pEQyxRQUFRO1lBQ1JDLFNBQVM7Z0JBQ1IsZ0JBQWdCO2dCQUNoQixjQUNDO1lBQ0Y7WUFDQUMsTUFBTUMsS0FBS0MsU0FBUyxDQUFDbEI7UUFDdEI7UUFFQSxJQUFJWSxJQUFJTyxNQUFNLEtBQUssS0FBSztZQUN2QixNQUFNLElBQUlWLE1BQU0sQ0FBQyxZQUFZLEVBQUVHLElBQUlRLFVBQVUsQ0FBQyxDQUFDLEVBQUVSLElBQUlPLE1BQU0sQ0FBQyxDQUFDO1FBQzlEO0lBQ0Q7SUFFQSxNQUFhRSxNQUFNdEIsT0FBc0IsRUFBaUI7UUFDekQsSUFBSSxDQUFDQSxTQUFTO1FBRWQsSUFBSUEsUUFBUUUsSUFBSSxLQUFLLFlBQVk7WUFDaEMsT0FBT1AsT0FBTzRCLEtBQUssQ0FBQyxDQUFDLHVDQUF1QyxFQUFFdkIsUUFBUUUsSUFBSSxDQUFDLEVBQUUsRUFBRUYsUUFBUSxFQUFFLENBQUM7UUFDM0Y7UUFFQSxJQUFJLENBQUNBLFFBQVFLLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQ0QsaUJBQWlCLEVBQUU7WUFDL0MsT0FBT1QsT0FBTzRCLEtBQUssQ0FBQztRQUNyQjtRQUNBLElBQUksQ0FBQ3ZCLFFBQVFHLEdBQUcsRUFBRTtZQUNqQixPQUFPUixPQUFPNEIsS0FBSyxDQUFDO1FBQ3JCO1FBQ0EsSUFBSSxDQUFDdkIsUUFBUUUsSUFBSSxFQUFFO1lBQ2xCLE9BQU9QLE9BQU80QixLQUFLLENBQUM7UUFDckI7UUFFQSxNQUFNdEIsT0FBTztZQUNaQyxNQUFNRixRQUFRRSxJQUFJO1lBQ2xCQyxLQUFLSCxTQUFTRyxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQ0MsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO1lBQ3pEQyxRQUFRTCxTQUFTSyxVQUFVLElBQUksQ0FBQ0QsaUJBQWlCO1FBQ2xEO1FBRUEsSUFBSUosUUFBUXdCLE9BQU8sRUFBRTtZQUNwQixNQUFNQSxVQUFVeEIsUUFBUXdCLE9BQU87WUFDL0JqQixPQUFPSSxNQUFNLENBQUNWLE1BQU07Z0JBQUV1QjtZQUFRO1FBQy9CO1FBRUEsSUFBSSxPQUFPeEIsUUFBUU0sSUFBSSxLQUFLLFVBQVU7WUFDckMsSUFBSU4sUUFBUU0sSUFBSSxLQUFLLE1BQU07Z0JBQzFCLElBQUlDLE9BQU9DLE9BQU8sQ0FBQ1IsUUFBUU0sSUFBSSxFQUFFRyxNQUFNLEdBQUcsSUFBSTtvQkFDN0MsTUFBTSxJQUFJQyxNQUFNO2dCQUNqQixPQUFPO29CQUNOSCxPQUFPSSxNQUFNLENBQUNWLE1BQU07d0JBQUVXLE9BQU87NEJBQUUsR0FBR1osUUFBUU0sSUFBSTt3QkFBQztvQkFBRTtnQkFDbEQ7WUFDRDtRQUNEO1FBRUFYLE9BQU80QixLQUFLLENBQUN0QjtRQUViLE1BQU1ZLE1BQU0sTUFBTUMsTUFBTSxrQ0FBa0M7WUFDekRDLFFBQVE7WUFDUkMsU0FBUztnQkFDUixnQkFBZ0I7Z0JBQ2hCLGNBQ0M7WUFDRjtZQUNBQyxNQUFNQyxLQUFLQyxTQUFTLENBQUNsQjtRQUN0QjtRQUVBLElBQUlZLElBQUlPLE1BQU0sS0FBSyxLQUFLO1lBQ3ZCLE1BQU0sSUFBSVYsTUFBTSxDQUFDLFlBQVksRUFBRUcsSUFBSVEsVUFBVSxDQUFDLENBQUMsRUFBRVIsSUFBSU8sTUFBTSxDQUFDLENBQUM7UUFDOUQ7SUFDRDs7O2FBdkZRaEIsb0JBQW9CcUIsUUFBUUMsR0FBRyxDQUFDQyxnQkFBZ0I7O0FBd0Z6RCJ9