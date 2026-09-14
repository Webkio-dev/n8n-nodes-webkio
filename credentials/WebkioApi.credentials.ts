import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class WebkioApi implements ICredentialType {
	name = 'webkioApi';

	displayName = 'Webkio API';

	icon: Icon = { light: 'file:../icons/webkio.svg', dark: 'file:../icons/webkio.dark.svg' };

	documentationUrl = 'https://developer.webkio.com/docs';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Create a key in Webkio under Settings > API & webhooks, or in the developer console. It starts with wk_.',
		},
		{
			displayName: 'API URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.webkio.com/v1',
			description: 'Leave as it is unless Webkio asked you to use another address',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/me',
			method: 'GET',
		},
	};
}
