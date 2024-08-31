import { BaseEngine, EventOptions, ViewOptions } from './analytics';
export declare class GoogleAnalytics extends BaseEngine {
    private _MEASURE_ID;
    private _TOKEN;
    view(page: string, options: ViewOptions): Promise<void>;
    event(options: EventOptions): Promise<void>;
}
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
