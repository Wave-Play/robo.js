export interface StartOptions {
	port: number
}

export abstract class BaseServer {
	public abstract isRunning(): boolean
	public abstract start(options: StartOptions): Promise<void>
	public abstract stop(): Promise<void>
}
