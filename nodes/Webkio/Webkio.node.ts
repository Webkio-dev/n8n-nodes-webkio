import {
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestMethods,
	type ILoadOptionsFunctions,
	type INodeExecutionData,
	type INodePropertyOptions,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';
import { compact } from './body';
import { apiError, listOptions, webkioRequest } from './GenericFunctions';

/** Where each "Get Many" reads from. */
const LIST_PATHS: Record<string, string> = {
	contact: '/contacts',
	emailList: '/email-lists',
	order: '/orders',
};

/** One API call for item i; the answer's `data`, or the API's error. */
async function send(
	this: IExecuteFunctions,
	method: IHttpRequestMethods,
	path: string,
	i: number,
	body?: IDataObject,
): Promise<IDataObject> {
	const { status, body: answer } = await webkioRequest.call(
		this,
		method,
		path,
		body ? { body: compact(body) as IDataObject } : {},
	);
	if (status >= 400) {
		throw apiError.call(this, answer, 'The Webkio request failed', i);
	}
	return (answer.data ?? {}) as IDataObject;
}

/** A list, following the API's cursor until the limit (or everything, with Return All). */
async function getMany(this: IExecuteFunctions, path: string, qs: IDataObject, i: number): Promise<IDataObject[]> {
	const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
	const limit = returnAll ? Number.POSITIVE_INFINITY : (this.getNodeParameter('limit', i, 50) as number);
	const results: IDataObject[] = [];
	let cursor: string | undefined;
	while (results.length < limit) {
		const pageSize = Math.min(100, limit - results.length);
		const { status, body } = await webkioRequest.call(this, 'GET', path, {
			qs: cursor ? { ...qs, limit: pageSize, cursor } : { ...qs, limit: pageSize },
		});
		if (status >= 400) {
			throw apiError.call(this, body, 'The Webkio request failed', i);
		}
		results.push(...((body.data as IDataObject[]) ?? []));
		const meta = (body.meta ?? {}) as IDataObject;
		if (!meta.has_more || !meta.next_cursor) {
			break;
		}
		cursor = String(meta.next_cursor);
	}
	return results.slice(0, limit);
}

async function run(this: IExecuteFunctions, resource: string, operation: string, i: number): Promise<IDataObject[]> {
	if (operation === 'getAll' && LIST_PATHS[resource]) {
		const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
		const qs = compact({
			project_id: filters.projectId,
			email: filters.email,
			number: filters.number,
			status: filters.status,
		}) as IDataObject;
		return getMany.call(this, LIST_PATHS[resource], qs, i);
	}

	if (resource === 'contact' && operation === 'upsert') {
		return [
			await send.call(this, 'POST', '/contacts', i, {
				project_id: this.getNodeParameter('projectId', i),
				email: this.getNodeParameter('email', i),
				...(this.getNodeParameter('additionalFields', i, {}) as IDataObject),
			}),
		];
	}
	if (resource === 'contact' && operation === 'get') {
		const id = this.getNodeParameter('contactId', i) as string;
		return [await send.call(this, 'GET', `/contacts/${encodeURIComponent(id)}`, i)];
	}
	if (resource === 'order' && operation === 'get') {
		const id = this.getNodeParameter('orderId', i) as string;
		return [await send.call(this, 'GET', `/orders/${encodeURIComponent(id)}`, i)];
	}
	if (resource === 'subscriber' && operation === 'add') {
		const extra = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
		return [
			await send.call(this, 'POST', '/subscribers', i, {
				project_id: this.getNodeParameter('projectId', i),
				email: this.getNodeParameter('email', i),
				name: extra.name,
				list_id: extra.listId,
				tags: extra.tags,
			}),
		];
	}
	if (resource === 'blogPost' && operation === 'create') {
		const extra = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
		return [
			await send.call(this, 'POST', '/blog-posts', i, {
				project_id: this.getNodeParameter('projectId', i),
				title: this.getNodeParameter('title', i),
				content: extra.content,
				excerpt: extra.excerpt,
				tags: extra.tags,
				slug: extra.slug,
				meta_title: extra.metaTitle,
				meta_description: extra.metaDescription,
				featured_image: extra.featuredImage,
			}),
		];
	}
	throw new NodeOperationError(this.getNode(), `"${operation}" is not an operation for ${resource}`, { itemIndex: i });
}

export class Webkio implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Webkio',
		name: 'webkio',
		icon: { light: 'file:../../icons/webkio.svg', dark: 'file:../../icons/webkio.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Add contacts, email subscribers and blog drafts to Webkio, and find contacts and orders',
		defaults: {
			name: 'Webkio',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'webkioApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Blog Post', value: 'blogPost' },
					{ name: 'Contact', value: 'contact' },
					{ name: 'Email List', value: 'emailList' },
					{ name: 'Order', value: 'order' },
					{ name: 'Subscriber', value: 'subscriber' },
				],
				default: 'contact',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['blogPost'] } },
				options: [
					{
						name: 'Create Draft',
						value: 'create',
						description: 'Create a blog post as a draft, to publish from Webkio',
						action: 'Create a blog post draft',
					},
				],
				default: 'create',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['contact'] } },
				options: [
					{
						name: 'Create or Update',
						value: 'upsert',
						description: 'Create a new record, or update the current one if it already exists (upsert)',
						action: 'Create or update a contact',
					},
					{ name: 'Get', value: 'get', description: 'Get a contact by ID', action: 'Get a contact' },
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'Get contacts, on one site or by email',
						action: 'Get many contacts',
					},
				],
				default: 'upsert',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['emailList'] } },
				options: [
					{ name: 'Get Many', value: 'getAll', description: 'Get your email lists', action: 'Get many email lists' },
				],
				default: 'getAll',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['order'] } },
				options: [
					{ name: 'Get', value: 'get', description: 'Get an order by ID', action: 'Get an order' },
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'Find orders by number, customer email, status or site',
						action: 'Get many orders',
					},
				],
				default: 'getAll',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['subscriber'] } },
				options: [
					{
						name: 'Add',
						value: 'add',
						description: "Add someone to a site's email subscribers",
						action: 'Add a subscriber',
					},
				],
				default: 'add',
			},
			{
				displayName: 'Site Name or ID',
				name: 'projectId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getSites' },
				required: true,
				default: '',
				description:
					'The site this is for. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: {
					show: { resource: ['blogPost', 'contact', 'subscriber'], operation: ['create', 'upsert', 'add'] },
				},
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				required: true,
				default: '',
				description: 'Contacts are matched on email: a new one creates a contact, a known one updates it',
				displayOptions: { show: { resource: ['contact'], operation: ['upsert'] } },
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				required: true,
				default: '',
				description:
					'They are subscribed at once, so only add people who agreed to hear from you. Someone who unsubscribed stays unsubscribed.',
				displayOptions: { show: { resource: ['subscriber'], operation: ['add'] } },
			},
			{
				displayName: 'Title',
				name: 'title',
				type: 'string',
				required: true,
				default: '',
				displayOptions: { show: { resource: ['blogPost'], operation: ['create'] } },
			},
			{
				displayName: 'Contact ID',
				name: 'contactId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: { show: { resource: ['contact'], operation: ['get'] } },
			},
			{
				displayName: 'Order ID',
				name: 'orderId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: { show: { resource: ['order'], operation: ['get'] } },
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['contact'], operation: ['upsert'] } },
				options: [
					{ displayName: 'Name', name: 'name', type: 'string', default: '' },
					{
						displayName: 'Notes',
						name: 'notes',
						type: 'string',
						typeOptions: { rows: 4 },
						default: '',
						description: "Replaces the contact's notes",
					},
					{ displayName: 'Phone', name: 'phone', type: 'string', default: '' },
					{
						displayName: 'Tags',
						name: 'tags',
						type: 'string',
						default: '',
						description: "Comma-separated tags, added to the contact's own",
					},
				],
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['subscriber'], operation: ['add'] } },
				options: [
					{
						displayName: 'Email List Name or ID',
						name: 'listId',
						type: 'options',
						typeOptions: { loadOptionsMethod: 'getEmailLists', loadOptionsDependsOn: ['projectId'] },
						default: '',
						description:
							'Also add them to this list. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{ displayName: 'Name', name: 'name', type: 'string', default: '' },
					{ displayName: 'Tags', name: 'tags', type: 'string', default: '', description: 'Comma-separated tags' },
				],
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['blogPost'], operation: ['create'] } },
				options: [
					{
						displayName: 'Content',
						name: 'content',
						type: 'string',
						typeOptions: { rows: 8 },
						default: '',
						description: 'HTML. Scripts and unsafe markup are removed.',
					},
					{ displayName: 'Excerpt', name: 'excerpt', type: 'string', typeOptions: { rows: 2 }, default: '' },
					{ displayName: 'Featured Image URL', name: 'featuredImage', type: 'string', default: '' },
					{ displayName: 'SEO Description', name: 'metaDescription', type: 'string', default: '' },
					{ displayName: 'SEO Title', name: 'metaTitle', type: 'string', default: '' },
					{
						displayName: 'Slug',
						name: 'slug',
						type: 'string',
						default: '',
						description: 'The post\'s address, like "spring-menu". Made from the title when left empty.',
					},
					{ displayName: 'Tags', name: 'tags', type: 'string', default: '', description: 'Comma-separated tags' },
				],
			},
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				description: 'Whether to return all results or only up to a given limit',
				displayOptions: { show: { resource: ['contact', 'emailList', 'order'], operation: ['getAll'] } },
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 50,
				description: 'Max number of results to return',
				displayOptions: {
					show: { resource: ['contact', 'emailList', 'order'], operation: ['getAll'], returnAll: [false] },
				},
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { resource: ['contact'], operation: ['getAll'] } },
				options: [
					{
						displayName: 'Email',
						name: 'email',
						type: 'string',
						placeholder: 'name@email.com',
						default: '',
						description: 'Only the contact with this email',
					},
					{
						displayName: 'Site Name or ID',
						name: 'projectId',
						type: 'options',
						typeOptions: { loadOptionsMethod: 'getSites' },
						default: '',
						description:
							'Only this site. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
				],
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { resource: ['emailList'], operation: ['getAll'] } },
				options: [
					{
						displayName: 'Site Name or ID',
						name: 'projectId',
						type: 'options',
						typeOptions: { loadOptionsMethod: 'getSites' },
						default: '',
						description:
							'Only this site. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
				],
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { resource: ['order'], operation: ['getAll'] } },
				options: [
					{
						displayName: 'Customer Email',
						name: 'email',
						type: 'string',
						placeholder: 'name@email.com',
						default: '',
					},
					{
						displayName: 'Order Number',
						name: 'number',
						type: 'string',
						default: '',
						description: 'Exactly as on the order, like ORD-260914-0001',
					},
					{
						displayName: 'Site Name or ID',
						name: 'projectId',
						type: 'options',
						typeOptions: { loadOptionsMethod: 'getSites' },
						default: '',
						description:
							'Only this site. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Status',
						name: 'status',
						type: 'options',
						options: [
							{ name: 'Cancelled', value: 'cancelled' },
							{ name: 'Delivered', value: 'delivered' },
							{ name: 'Paid', value: 'paid' },
							{ name: 'Pending', value: 'pending' },
							{ name: 'Processing', value: 'processing' },
							{ name: 'Refunded', value: 'refunded' },
							{ name: 'Shipped', value: 'shipped' },
						],
						default: 'paid',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getSites(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return listOptions.call(this, '/projects');
			},
			// The chosen site's lists; none until a site is picked.
			async getEmailLists(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const projectId = this.getCurrentNodeParameter('projectId') as string | undefined;
				if (!projectId) {
					return [];
				}
				return listOptions.call(this, '/email-lists', { project_id: projectId });
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				for (const json of await run.call(this, resource, operation, i)) {
					returnData.push({ json, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				// An error this node raised is a NodeOperationError already and passes through unchanged
				// (with the API's error code); anything else, such as a network failure, is wrapped.
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}
		return [returnData];
	}
}
