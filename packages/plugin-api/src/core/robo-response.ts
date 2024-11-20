/**
 * Extends the [Web Response API](https://developer.mozilla.org/docs/Web/API/Response) with additional convenience methods.
 */
export class RoboResponse extends Response {
	constructor(body?: BodyInit, init?: ResponseInit) {
		super(body, init)
	}

	public static json<JsonBody>(body: JsonBody, init?: ResponseInit): RoboResponse {
		const response: Response = Response.json(body, init)
		return new RoboResponse(response.body, response)
	}
}
