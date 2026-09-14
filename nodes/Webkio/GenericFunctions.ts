import {
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type IHookFunctions,
	type IHttpRequestMethods,
	type ILoadOptionsFunctions,
	type INodePropertyOptions,
} from 'n8n-workflow';

/** Shared by the Webkio node and the Webkio Trigger. */
export type WebkioContext = IHookFunctions | ILoadOptionsFunctions | IExecuteFunctions;

/** A call to the Webkio API with the node's credential. Answers the status and the parsed body. */
export async function webkioRequest(
	this: WebkioContext,
	method: IHttpRequestMethods,
	path: string,
	options: { body?: IDataObject; qs?: IDataObject } = {},
): Promise<{ status: number; body: IDataObject }> {
	const credentials = await this.getCredentials('webkioApi');
	const baseUrl = String(credentials.baseUrl || 'https://api.webkio.com/v1').replace(/\/+$/, '');
	const response = (await this.helpers.httpRequestWithAuthentication.call(this, 'webkioApi', {
		method,
		url: `${baseUrl}${path}`,
		body: options.body,
		qs: options.qs,
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	})) as { statusCode: number; body: IDataObject };
	return { status: response.statusCode, body: response.body ?? {} };
}

/** The API's error ({"error": {"code", "message"}}) as an n8n error, with the code in its description. */
export function apiError(
	this: WebkioContext,
	body: IDataObject,
	fallback: string,
	itemIndex?: number,
): NodeOperationError {
	const error = (body.error ?? {}) as IDataObject;
	return new NodeOperationError(this.getNode(), String(error.message ?? fallback), {
		description: error.code ? `Webkio error code: ${String(error.code)}` : undefined,
		itemIndex,
	});
}

/** A cursor-paginated list as dropdown options (name, id), following the cursor until has_more is false. */
export async function listOptions(
	this: ILoadOptionsFunctions,
	path: string,
	qs: IDataObject = {},
): Promise<INodePropertyOptions[]> {
	const options: INodePropertyOptions[] = [];
	let cursor: string | undefined;
	for (let page = 0; page < 20; page++) {
		const { status, body } = await webkioRequest.call(this, 'GET', path, {
			qs: cursor ? { ...qs, limit: 100, cursor } : { ...qs, limit: 100 },
		});
		if (status >= 400) {
			throw apiError.call(this, body, 'Could not load the list from Webkio');
		}
		for (const item of (body.data as IDataObject[]) ?? []) {
			options.push({ name: String(item.name), value: String(item.id) });
		}
		const meta = (body.meta ?? {}) as IDataObject;
		if (!meta.has_more || !meta.next_cursor) {
			break;
		}
		cursor = String(meta.next_cursor);
	}
	return options;
}
