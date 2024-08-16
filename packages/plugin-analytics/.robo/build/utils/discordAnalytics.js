import { BaseAnalytics } from "./analytics.js";
import { Flashcore, logger } from "robo.js";
export class DiscordAnalytics extends BaseAnalytics {
    async event(options) {
        if (options && options.user && options.user.id) {
            let data = [
                options
            ];
            const user = await Flashcore.get(options.user.id.toString(), {
                namespace: options.id?.toString()
            });
            if (user) {
                const commandExist = user.filter((command)=>{
                    if (command.label === options.label) {
                        return command;
                    }
                });
                if (commandExist) {
                    data = user.map((command)=>{
                        if (command.label === options.label) {
                            return {
                                ...command,
                                numberOfExecution: command.numberOfExecution ? command.numberOfExecution += 1 : 1
                            };
                        }
                        return command;
                    });
                } else {
                    data = [
                        options,
                        ...user
                    ];
                }
            }
            await Flashcore.set(options.user.id.toString(), data, {
                namespace: options.id?.toString()
            });
            logger.error(user);
        }
    }
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkM6XFxVc2Vyc1xcY2Vsc2lcXERvY3VtZW50c1xcUHJvZ3JhbW1pbmdcXFdvcmtcXHJvYm8uanNcXHBhY2thZ2VzXFxwbHVnaW4tYW5hbHl0aWNzXFxzcmNcXHV0aWxzXFxkaXNjb3JkQW5hbHl0aWNzLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEJhc2VBbmFseXRpY3MsIEV2ZW50T3B0aW9ucyB9IGZyb20gJy4vYW5hbHl0aWNzJ1xyXG5pbXBvcnQgeyBGbGFzaGNvcmUsIGxvZ2dlciB9IGZyb20gJ3JvYm8uanMnXHJcblxyXG5leHBvcnQgY2xhc3MgRGlzY29yZEFuYWx5dGljcyBleHRlbmRzIEJhc2VBbmFseXRpY3Mge1xyXG5cdHB1YmxpYyBhc3luYyBldmVudChvcHRpb25zPzogRXZlbnRPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XHJcblx0XHRpZiAob3B0aW9ucyAmJiBvcHRpb25zLnVzZXIgJiYgb3B0aW9ucy51c2VyLmlkKSB7XHJcblx0XHRcdGxldCBkYXRhID0gW29wdGlvbnNdXHJcblx0XHRcdGNvbnN0IHVzZXIgPSBhd2FpdCBGbGFzaGNvcmUuZ2V0PEV2ZW50T3B0aW9uc1tdPihvcHRpb25zLnVzZXIuaWQudG9TdHJpbmcoKSwge1xyXG5cdFx0XHRcdG5hbWVzcGFjZTogb3B0aW9ucy5pZD8udG9TdHJpbmcoKVxyXG5cdFx0XHR9KVxyXG5cclxuXHRcdFx0aWYgKHVzZXIpIHtcclxuXHRcdFx0XHRjb25zdCBjb21tYW5kRXhpc3QgPSB1c2VyLmZpbHRlcigoY29tbWFuZCkgPT4ge1xyXG5cdFx0XHRcdFx0aWYgKGNvbW1hbmQubGFiZWwgPT09IG9wdGlvbnMubGFiZWwpIHtcclxuXHRcdFx0XHRcdFx0cmV0dXJuIGNvbW1hbmRcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9KVxyXG5cdFx0XHRcdGlmIChjb21tYW5kRXhpc3QpIHtcclxuXHRcdFx0XHRcdGRhdGEgPSB1c2VyLm1hcCgoY29tbWFuZCkgPT4ge1xyXG5cdFx0XHRcdFx0XHRpZiAoY29tbWFuZC5sYWJlbCA9PT0gb3B0aW9ucy5sYWJlbCkge1xyXG5cdFx0XHRcdFx0XHRcdHJldHVybiB7XHJcblx0XHRcdFx0XHRcdFx0XHQuLi5jb21tYW5kLFxyXG5cdFx0XHRcdFx0XHRcdFx0bnVtYmVyT2ZFeGVjdXRpb246IGNvbW1hbmQubnVtYmVyT2ZFeGVjdXRpb24gPyAoY29tbWFuZC5udW1iZXJPZkV4ZWN1dGlvbiArPSAxKSA6IDFcclxuXHRcdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0cmV0dXJuIGNvbW1hbmRcclxuXHRcdFx0XHRcdH0pXHJcblx0XHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRcdGRhdGEgPSBbb3B0aW9ucywgLi4udXNlcl1cclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdGF3YWl0IEZsYXNoY29yZS5zZXQob3B0aW9ucy51c2VyLmlkLnRvU3RyaW5nKCksIGRhdGEsIHtcclxuXHRcdFx0XHRuYW1lc3BhY2U6IG9wdGlvbnMuaWQ/LnRvU3RyaW5nKClcclxuXHRcdFx0fSlcclxuXHJcblx0XHRcdGxvZ2dlci5lcnJvcih1c2VyKVxyXG5cdFx0fVxyXG5cdH1cclxufVxyXG4iXSwibmFtZXMiOlsiQmFzZUFuYWx5dGljcyIsIkZsYXNoY29yZSIsImxvZ2dlciIsIkRpc2NvcmRBbmFseXRpY3MiLCJldmVudCIsIm9wdGlvbnMiLCJ1c2VyIiwiaWQiLCJkYXRhIiwiZ2V0IiwidG9TdHJpbmciLCJuYW1lc3BhY2UiLCJjb21tYW5kRXhpc3QiLCJmaWx0ZXIiLCJjb21tYW5kIiwibGFiZWwiLCJtYXAiLCJudW1iZXJPZkV4ZWN1dGlvbiIsInNldCIsImVycm9yIl0sIm1hcHBpbmdzIjoiQUFBQSxTQUFTQSxhQUFhLFFBQXNCLGlCQUFhO0FBQ3pELFNBQVNDLFNBQVMsRUFBRUMsTUFBTSxRQUFRLFVBQVM7QUFFM0MsT0FBTyxNQUFNQyx5QkFBeUJIO0lBQ3JDLE1BQWFJLE1BQU1DLE9BQXNCLEVBQWlCO1FBQ3pELElBQUlBLFdBQVdBLFFBQVFDLElBQUksSUFBSUQsUUFBUUMsSUFBSSxDQUFDQyxFQUFFLEVBQUU7WUFDL0MsSUFBSUMsT0FBTztnQkFBQ0g7YUFBUTtZQUNwQixNQUFNQyxPQUFPLE1BQU1MLFVBQVVRLEdBQUcsQ0FBaUJKLFFBQVFDLElBQUksQ0FBQ0MsRUFBRSxDQUFDRyxRQUFRLElBQUk7Z0JBQzVFQyxXQUFXTixRQUFRRSxFQUFFLEVBQUVHO1lBQ3hCO1lBRUEsSUFBSUosTUFBTTtnQkFDVCxNQUFNTSxlQUFlTixLQUFLTyxNQUFNLENBQUMsQ0FBQ0M7b0JBQ2pDLElBQUlBLFFBQVFDLEtBQUssS0FBS1YsUUFBUVUsS0FBSyxFQUFFO3dCQUNwQyxPQUFPRDtvQkFDUjtnQkFDRDtnQkFDQSxJQUFJRixjQUFjO29CQUNqQkosT0FBT0YsS0FBS1UsR0FBRyxDQUFDLENBQUNGO3dCQUNoQixJQUFJQSxRQUFRQyxLQUFLLEtBQUtWLFFBQVFVLEtBQUssRUFBRTs0QkFDcEMsT0FBTztnQ0FDTixHQUFHRCxPQUFPO2dDQUNWRyxtQkFBbUJILFFBQVFHLGlCQUFpQixHQUFJSCxRQUFRRyxpQkFBaUIsSUFBSSxJQUFLOzRCQUNuRjt3QkFDRDt3QkFDQSxPQUFPSDtvQkFDUjtnQkFDRCxPQUFPO29CQUNOTixPQUFPO3dCQUFDSDsyQkFBWUM7cUJBQUs7Z0JBQzFCO1lBQ0Q7WUFFQSxNQUFNTCxVQUFVaUIsR0FBRyxDQUFDYixRQUFRQyxJQUFJLENBQUNDLEVBQUUsQ0FBQ0csUUFBUSxJQUFJRixNQUFNO2dCQUNyREcsV0FBV04sUUFBUUUsRUFBRSxFQUFFRztZQUN4QjtZQUVBUixPQUFPaUIsS0FBSyxDQUFDYjtRQUNkO0lBQ0Q7QUFDRCJ9