import {
	NodeConnectionTypes,
	type IDataObject,
	type IHookFunctions,
	type ILoadOptionsFunctions,
	type INodePropertyOptions,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
} from 'n8n-workflow';
import { apiError, listOptions, webkioRequest } from '../Webkio/GenericFunctions';
import { verifySignature } from './signature';

/** The published Webkio webhook events. `form.submitted` is held back by Webkio and not offered. */
const EVENTS: INodePropertyOptions[] = [
	{ name: 'New Booking', value: 'booking.created', description: 'A customer books an appointment' },
	{ name: 'New Order', value: 'order.created', description: 'An order is placed; card payment may still be pending' },
	{ name: 'New Product Review', value: 'review.submitted', description: 'A customer reviews a product' },
	{ name: 'New Property Enquiry', value: 'property_enquiry.created', description: 'A visitor enquires about a property listing' },
	{ name: 'New Rental Reservation', value: 'rental.reserved', description: 'A customer reserves a rental item' },
	{ name: 'New Subscriber', value: 'subscriber.created', description: 'Someone joins your email list' },
	{ name: 'Order Paid', value: 'order.paid', description: 'Payment for an order is confirmed' },
];

/** A delivery as the workflow sees it: the record's fields on top, its id kept as record_id. */
function flatten(envelope: IDataObject): IDataObject {
	const data = (envelope.data ?? {}) as IDataObject;
	return {
		...data,
		record_id: data.id ?? null,
		id: envelope.id,
		event: envelope.event,
		project: envelope.project,
	};
}

export class WebkioTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Webkio Trigger',
		name: 'webkioTrigger',
		icon: { light: 'file:../../icons/webkio.svg', dark: 'file:../../icons/webkio.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Starts the workflow when something happens on your Webkio sites',
		defaults: {
			name: 'Webkio Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'webkioApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				noDataExpression: true,
				required: true,
				options: EVENTS,
				default: 'order.paid',
			},
			{
				displayName: 'Site Name or ID',
				name: 'projectId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getProjects',
				},
				default: '',
				description:
					'Only this site; leave empty for all your sites. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
		],
	};

	methods = {
		loadOptions: {
			// Every site on the account, following the API's cursor until has_more is false.
			async getProjects(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return [{ name: 'All Sites', value: '' }, ...(await listOptions.call(this, '/projects'))];
			},
		},
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				if (!staticData.webhookId) {
					return false;
				}
				const { status, body } = await webkioRequest.call(
					this,
					'GET',
					`/webhooks/${encodeURIComponent(String(staticData.webhookId))}`,
				);
				if (status === 404) {
					delete staticData.webhookId;
					delete staticData.secret;
					return false;
				}
				if (status >= 400) {
					throw apiError.call(this, body, 'Could not check the Webkio webhook');
				}
				return true;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const payload: IDataObject = {
					event: this.getNodeParameter('event') as string,
					target_url: this.getNodeWebhookUrl('default'),
				};
				const projectId = this.getNodeParameter('projectId', '') as string;
				if (projectId) {
					payload.project_id = projectId;
				}
				const { status, body } = await webkioRequest.call(this, 'POST', '/webhooks', { body: payload });
				if (status >= 400) {
					throw apiError.call(this, body, 'Could not create the Webkio webhook');
				}
				const webhook = (body.data ?? {}) as IDataObject;
				const staticData = this.getWorkflowStaticData('node');
				staticData.webhookId = webhook.id;
				staticData.secret = webhook.secret;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				if (staticData.webhookId) {
					const { status, body } = await webkioRequest.call(
						this,
						'DELETE',
						`/webhooks/${encodeURIComponent(String(staticData.webhookId))}`,
					);
					// Already gone (removed in Webkio, or its key revoked) counts as deleted.
					if (status >= 400 && status !== 404) {
						throw apiError.call(this, body, 'Could not remove the Webkio webhook');
					}
				}
				delete staticData.webhookId;
				delete staticData.secret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const request = this.getRequestObject() as unknown as { rawBody?: Buffer };
		const headers = this.getHeaderData() as IDataObject;
		const staticData = this.getWorkflowStaticData('node');

		const verified = verifySignature(
			request.rawBody ? request.rawBody.toString('utf8') : undefined,
			headers['x-webkio-signature'] as string | undefined,
			headers['x-webkio-timestamp'] as string | undefined,
			staticData.secret as string | undefined,
		);
		// A wrong or stale signature is dropped without running the workflow.
		if (verified === false) {
			return {};
		}

		const envelope = this.getBodyData() as IDataObject;
		if (!envelope || !envelope.data) {
			return {};
		}
		return {
			workflowData: [this.helpers.returnJsonArray([flatten(envelope)])],
		};
	}
}
