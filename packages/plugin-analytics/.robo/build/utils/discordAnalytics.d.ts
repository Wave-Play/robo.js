import { BaseAnalytics, EventOptions } from './analytics';
export declare class DiscordAnalytics extends BaseAnalytics {
    event(options?: EventOptions): Promise<void>;
}
