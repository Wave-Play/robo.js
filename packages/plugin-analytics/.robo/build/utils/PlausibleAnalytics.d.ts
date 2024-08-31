import { BaseEngine, EventOptions, ViewOptions } from './analytics';
export declare class PlausibleAnalytics extends BaseEngine {
    private _PLAUSIBLE_DOMAIN;
    view(page: string, options: ViewOptions): Promise<void>;
    event(options?: EventOptions): Promise<void>;
}
