import { BaseEngine, EventOptions, ViewOptions } from './analytics';
export declare class ManyEngines extends BaseEngine {
    private _engines;
    constructor(...engines: BaseEngine[]);
    event(options: EventOptions): Promise<void>;
    view(page: string, options: ViewOptions): Promise<void>;
}
