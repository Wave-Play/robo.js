import { logger } from "robo.js";
import { BaseEngine } from "./analytics.js";
export class PlausibleAnalytics extends BaseEngine {
    async view(page, options) {
        if (options.name === 'revenue' && typeof options.data === 'object') {
            Object.assign(options, {
                revenue: {
                    ...options.data
                }
            });
        }
        if (options.name === 'props' && typeof options.data === 'object') {
            Object.assign(options, {
                props: {
                    ...options.data
                }
            });
        }
        const temp = {
            ...options,
            name: 'pageview',
            url: page,
            domain: options?.domain ?? this._PLAUSIBLE_DOMAIN
        };
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
            return logger.error(`Please use Analytics.view(${options.name}, ${options}).`);
        }
        if (!options.domain) {
            return logger.error("Specify a domain to use Plausible's event.");
        }
        if (!options.url) {
            return logger.error("Specify a URL to use Plausible's event.");
        }
        if (!options.name) {
            return logger.error("Specify a name to use Plausible's event.");
        }
        if (options.name === 'revenue' && typeof options.data === 'object') {
            Object.assign(options, {
                revenue: {
                    ...options.data
                }
            });
        }
        if (options.name === 'props' && typeof options.data === 'object') {
            Object.assign(options, {
                props: {
                    ...options.data
                }
            });
        }
        const temp = {
            ...options,
            domain: options?.domain ?? process.env.PLAUSIBLE_DOMAIN
        };
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkM6XFxVc2Vyc1xcY2Vsc2lcXERvY3VtZW50c1xcUHJvZ3JhbW1pbmdcXFdvcmtcXHJvYm8uanNcXHBhY2thZ2VzXFxwbHVnaW4tYW5hbHl0aWNzXFxzcmNcXHV0aWxzXFxQbGF1c2libGVBbmFseXRpY3MudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAncm9iby5qcydcclxuaW1wb3J0IHsgQmFzZUVuZ2luZSwgRXZlbnRPcHRpb25zLCBWaWV3T3B0aW9ucyB9IGZyb20gJy4vYW5hbHl0aWNzJ1xyXG5cclxuZXhwb3J0IGNsYXNzIFBsYXVzaWJsZUFuYWx5dGljcyBleHRlbmRzIEJhc2VFbmdpbmUge1xyXG5cdHByaXZhdGUgX1BMQVVTSUJMRV9ET01BSU4gPSBwcm9jZXNzLmVudi5QTEFVU0lCTEVfRE9NQUlOXHJcblxyXG5cdHB1YmxpYyBhc3luYyB2aWV3KHBhZ2U6IHN0cmluZywgb3B0aW9uczogVmlld09wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcclxuXHRcdGlmIChvcHRpb25zLm5hbWUgPT09ICdyZXZlbnVlJyAmJiB0eXBlb2Ygb3B0aW9ucy5kYXRhID09PSAnb2JqZWN0Jykge1xyXG5cdFx0XHRPYmplY3QuYXNzaWduKG9wdGlvbnMsIHsgcmV2ZW51ZTogeyAuLi5vcHRpb25zLmRhdGEgfSB9KVxyXG5cdFx0fVxyXG5cclxuXHRcdGlmIChvcHRpb25zLm5hbWUgPT09ICdwcm9wcycgJiYgdHlwZW9mIG9wdGlvbnMuZGF0YSA9PT0gJ29iamVjdCcpIHtcclxuXHRcdFx0T2JqZWN0LmFzc2lnbihvcHRpb25zLCB7IHByb3BzOiB7IC4uLm9wdGlvbnMuZGF0YSB9IH0pXHJcblx0XHR9XHJcblx0XHRjb25zdCB0ZW1wID0ge1xyXG5cdFx0XHQuLi5vcHRpb25zLFxyXG5cdFx0XHRuYW1lOiAncGFnZXZpZXcnLFxyXG5cdFx0XHR1cmw6IHBhZ2UsXHJcblx0XHRcdGRvbWFpbjogb3B0aW9ucz8uZG9tYWluID8/IHRoaXMuX1BMQVVTSUJMRV9ET01BSU5cclxuXHRcdH1cclxuXHJcblx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaCgnaHR0cHM6Ly9wbGF1c2libGUuaW8vYXBpL2V2ZW50Jywge1xyXG5cdFx0XHRtZXRob2Q6ICdQT1NUJyxcclxuXHRcdFx0aGVhZGVyczoge1xyXG5cdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXHJcblx0XHRcdFx0J1VzZXItQWdlbnQnOlxyXG5cdFx0XHRcdFx0J01vemlsbGEvNS4wIChXaW5kb3dzIE5UIDEwLjA7IFdpbjY0OyB4NjQpIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS82OC4wLjM0NDAuMTA2IFNhZmFyaS81MzcuMzYnXHJcblx0XHRcdH0sXHJcblx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHRlbXApXHJcblx0XHR9KVxyXG5cclxuXHRcdGlmIChyZXMuc3RhdHVzICE9PSAyMDIpIHtcclxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbUGxhdXNpYmxlXSAke3Jlcy5zdGF0dXNUZXh0fSAke3Jlcy5zdGF0dXN9YClcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHB1YmxpYyBhc3luYyBldmVudChvcHRpb25zPzogRXZlbnRPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XHJcblx0XHRpZiAoIW9wdGlvbnMpIHJldHVyblxyXG5cclxuXHRcdGlmIChvcHRpb25zLm5hbWUgPT09ICdwYWdldmlldycpIHtcclxuXHRcdFx0cmV0dXJuIGxvZ2dlci5lcnJvcihgUGxlYXNlIHVzZSBBbmFseXRpY3Mudmlldygke29wdGlvbnMubmFtZX0sICR7b3B0aW9uc30pLmApXHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKCFvcHRpb25zLmRvbWFpbikge1xyXG5cdFx0XHRyZXR1cm4gbG9nZ2VyLmVycm9yKFwiU3BlY2lmeSBhIGRvbWFpbiB0byB1c2UgUGxhdXNpYmxlJ3MgZXZlbnQuXCIpXHJcblx0XHR9XHJcblx0XHRpZiAoIW9wdGlvbnMudXJsKSB7XHJcblx0XHRcdHJldHVybiBsb2dnZXIuZXJyb3IoXCJTcGVjaWZ5IGEgVVJMIHRvIHVzZSBQbGF1c2libGUncyBldmVudC5cIilcclxuXHRcdH1cclxuXHRcdGlmICghb3B0aW9ucy5uYW1lKSB7XHJcblx0XHRcdHJldHVybiBsb2dnZXIuZXJyb3IoXCJTcGVjaWZ5IGEgbmFtZSB0byB1c2UgUGxhdXNpYmxlJ3MgZXZlbnQuXCIpXHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKG9wdGlvbnMubmFtZSA9PT0gJ3JldmVudWUnICYmIHR5cGVvZiBvcHRpb25zLmRhdGEgPT09ICdvYmplY3QnKSB7XHJcblx0XHRcdE9iamVjdC5hc3NpZ24ob3B0aW9ucywgeyByZXZlbnVlOiB7IC4uLm9wdGlvbnMuZGF0YSB9IH0pXHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKG9wdGlvbnMubmFtZSA9PT0gJ3Byb3BzJyAmJiB0eXBlb2Ygb3B0aW9ucy5kYXRhID09PSAnb2JqZWN0Jykge1xyXG5cdFx0XHRPYmplY3QuYXNzaWduKG9wdGlvbnMsIHsgcHJvcHM6IHsgLi4ub3B0aW9ucy5kYXRhIH0gfSlcclxuXHRcdH1cclxuXHJcblx0XHRjb25zdCB0ZW1wID0ge1xyXG5cdFx0XHQuLi5vcHRpb25zLFxyXG5cdFx0XHRkb21haW46IG9wdGlvbnM/LmRvbWFpbiA/PyBwcm9jZXNzLmVudi5QTEFVU0lCTEVfRE9NQUlOXHJcblx0XHR9XHJcblxyXG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgZmV0Y2goJ2h0dHBzOi8vcGxhdXNpYmxlLmlvL2FwaS9ldmVudCcsIHtcclxuXHRcdFx0bWV0aG9kOiAnUE9TVCcsXHJcblx0XHRcdGhlYWRlcnM6IHtcclxuXHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG5cdFx0XHRcdCdVc2VyLUFnZW50JzpcclxuXHRcdFx0XHRcdCdNb3ppbGxhLzUuMCAoV2luZG93cyBOVCAxMC4wOyBXaW42NDsgeDY0KSBBcHBsZVdlYktpdC81MzcuMzYgKEtIVE1MLCBsaWtlIEdlY2tvKSBDaHJvbWUvNjguMC4zNDQwLjEwNiBTYWZhcmkvNTM3LjM2J1xyXG5cdFx0XHR9LFxyXG5cdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh0ZW1wKVxyXG5cdFx0fSlcclxuXHJcblx0XHRpZiAocmVzLnN0YXR1cyAhPT0gMjAyKSB7XHJcblx0XHRcdHRocm93IG5ldyBFcnJvcihgW1BsYXVzaWJsZV0gJHtyZXMuc3RhdHVzVGV4dH0gJHtyZXMuc3RhdHVzfWApXHJcblx0XHR9XHJcblx0fVxyXG59XHJcbiJdLCJuYW1lcyI6WyJsb2dnZXIiLCJCYXNlRW5naW5lIiwiUGxhdXNpYmxlQW5hbHl0aWNzIiwidmlldyIsInBhZ2UiLCJvcHRpb25zIiwibmFtZSIsImRhdGEiLCJPYmplY3QiLCJhc3NpZ24iLCJyZXZlbnVlIiwicHJvcHMiLCJ0ZW1wIiwidXJsIiwiZG9tYWluIiwiX1BMQVVTSUJMRV9ET01BSU4iLCJyZXMiLCJmZXRjaCIsIm1ldGhvZCIsImhlYWRlcnMiLCJib2R5IiwiSlNPTiIsInN0cmluZ2lmeSIsInN0YXR1cyIsIkVycm9yIiwic3RhdHVzVGV4dCIsImV2ZW50IiwiZXJyb3IiLCJwcm9jZXNzIiwiZW52IiwiUExBVVNJQkxFX0RPTUFJTiJdLCJtYXBwaW5ncyI6IkFBQUEsU0FBU0EsTUFBTSxRQUFRLFVBQVM7QUFDaEMsU0FBU0MsVUFBVSxRQUFtQyxpQkFBYTtBQUVuRSxPQUFPLE1BQU1DLDJCQUEyQkQ7SUFHdkMsTUFBYUUsS0FBS0MsSUFBWSxFQUFFQyxPQUFvQixFQUFpQjtRQUNwRSxJQUFJQSxRQUFRQyxJQUFJLEtBQUssYUFBYSxPQUFPRCxRQUFRRSxJQUFJLEtBQUssVUFBVTtZQUNuRUMsT0FBT0MsTUFBTSxDQUFDSixTQUFTO2dCQUFFSyxTQUFTO29CQUFFLEdBQUdMLFFBQVFFLElBQUk7Z0JBQUM7WUFBRTtRQUN2RDtRQUVBLElBQUlGLFFBQVFDLElBQUksS0FBSyxXQUFXLE9BQU9ELFFBQVFFLElBQUksS0FBSyxVQUFVO1lBQ2pFQyxPQUFPQyxNQUFNLENBQUNKLFNBQVM7Z0JBQUVNLE9BQU87b0JBQUUsR0FBR04sUUFBUUUsSUFBSTtnQkFBQztZQUFFO1FBQ3JEO1FBQ0EsTUFBTUssT0FBTztZQUNaLEdBQUdQLE9BQU87WUFDVkMsTUFBTTtZQUNOTyxLQUFLVDtZQUNMVSxRQUFRVCxTQUFTUyxVQUFVLElBQUksQ0FBQ0MsaUJBQWlCO1FBQ2xEO1FBRUEsTUFBTUMsTUFBTSxNQUFNQyxNQUFNLGtDQUFrQztZQUN6REMsUUFBUTtZQUNSQyxTQUFTO2dCQUNSLGdCQUFnQjtnQkFDaEIsY0FDQztZQUNGO1lBQ0FDLE1BQU1DLEtBQUtDLFNBQVMsQ0FBQ1Y7UUFDdEI7UUFFQSxJQUFJSSxJQUFJTyxNQUFNLEtBQUssS0FBSztZQUN2QixNQUFNLElBQUlDLE1BQU0sQ0FBQyxZQUFZLEVBQUVSLElBQUlTLFVBQVUsQ0FBQyxDQUFDLEVBQUVULElBQUlPLE1BQU0sQ0FBQyxDQUFDO1FBQzlEO0lBQ0Q7SUFFQSxNQUFhRyxNQUFNckIsT0FBc0IsRUFBaUI7UUFDekQsSUFBSSxDQUFDQSxTQUFTO1FBRWQsSUFBSUEsUUFBUUMsSUFBSSxLQUFLLFlBQVk7WUFDaEMsT0FBT04sT0FBTzJCLEtBQUssQ0FBQyxDQUFDLDBCQUEwQixFQUFFdEIsUUFBUUMsSUFBSSxDQUFDLEVBQUUsRUFBRUQsUUFBUSxFQUFFLENBQUM7UUFDOUU7UUFFQSxJQUFJLENBQUNBLFFBQVFTLE1BQU0sRUFBRTtZQUNwQixPQUFPZCxPQUFPMkIsS0FBSyxDQUFDO1FBQ3JCO1FBQ0EsSUFBSSxDQUFDdEIsUUFBUVEsR0FBRyxFQUFFO1lBQ2pCLE9BQU9iLE9BQU8yQixLQUFLLENBQUM7UUFDckI7UUFDQSxJQUFJLENBQUN0QixRQUFRQyxJQUFJLEVBQUU7WUFDbEIsT0FBT04sT0FBTzJCLEtBQUssQ0FBQztRQUNyQjtRQUVBLElBQUl0QixRQUFRQyxJQUFJLEtBQUssYUFBYSxPQUFPRCxRQUFRRSxJQUFJLEtBQUssVUFBVTtZQUNuRUMsT0FBT0MsTUFBTSxDQUFDSixTQUFTO2dCQUFFSyxTQUFTO29CQUFFLEdBQUdMLFFBQVFFLElBQUk7Z0JBQUM7WUFBRTtRQUN2RDtRQUVBLElBQUlGLFFBQVFDLElBQUksS0FBSyxXQUFXLE9BQU9ELFFBQVFFLElBQUksS0FBSyxVQUFVO1lBQ2pFQyxPQUFPQyxNQUFNLENBQUNKLFNBQVM7Z0JBQUVNLE9BQU87b0JBQUUsR0FBR04sUUFBUUUsSUFBSTtnQkFBQztZQUFFO1FBQ3JEO1FBRUEsTUFBTUssT0FBTztZQUNaLEdBQUdQLE9BQU87WUFDVlMsUUFBUVQsU0FBU1MsVUFBVWMsUUFBUUMsR0FBRyxDQUFDQyxnQkFBZ0I7UUFDeEQ7UUFFQSxNQUFNZCxNQUFNLE1BQU1DLE1BQU0sa0NBQWtDO1lBQ3pEQyxRQUFRO1lBQ1JDLFNBQVM7Z0JBQ1IsZ0JBQWdCO2dCQUNoQixjQUNDO1lBQ0Y7WUFDQUMsTUFBTUMsS0FBS0MsU0FBUyxDQUFDVjtRQUN0QjtRQUVBLElBQUlJLElBQUlPLE1BQU0sS0FBSyxLQUFLO1lBQ3ZCLE1BQU0sSUFBSUMsTUFBTSxDQUFDLFlBQVksRUFBRVIsSUFBSVMsVUFBVSxDQUFDLENBQUMsRUFBRVQsSUFBSU8sTUFBTSxDQUFDLENBQUM7UUFDOUQ7SUFDRDs7O2FBM0VRUixvQkFBb0JhLFFBQVFDLEdBQUcsQ0FBQ0MsZ0JBQWdCOztBQTRFekQifQ==