'use strict';

// Runs against the compiled node (npm test builds first), with Node's own test runner.
const test = require('node:test');
const assert = require('node:assert');
const { compact } = require('../dist/nodes/Webkio/body');
const { simplifyContact, simplifyOrder } = require('../dist/nodes/Webkio/simplify');

let Webkio;
try {
	({ Webkio } = require('../dist/nodes/Webkio/Webkio.node'));
} catch {
	Webkio = undefined; // n8n-workflow is a peer dependency; without it only the helpers are tested
}

test('blank fields are left out of a request', () => {
	assert.deepStrictEqual(
		compact({ email: 'a@example.com', name: '', phone: undefined, notes: null, tags: 'vip', count: 0 }),
		{ email: 'a@example.com', tags: 'vip', count: 0 },
	);
});

test('every operation names its action, and every write asks for a site', { skip: !Webkio && 'n8n-workflow not installed' }, () => {
	const { properties } = new Webkio().description;
	for (const operation of properties.filter((p) => p.name === 'operation')) {
		for (const option of operation.options) {
			assert.ok(option.action, `${option.name} has an action`);
		}
	}
	const site = properties.find((p) => p.name === 'projectId');
	assert.strictEqual(site.required, true);
	assert.deepStrictEqual(site.displayOptions.show.operation.sort(), ['add', 'create', 'upsert']);
});

test('Simplify keeps ten fields and flattens the order customer', () => {
	const contact = simplifyContact({ id: 'C1', email: 'a@example.com', notes: 'long', first_seen_at: 'x', source: 'api' });
	assert.strictEqual(Object.keys(contact).length, 10);
	assert.strictEqual(contact.notes, undefined);
	const order = simplifyOrder({ id: 'O1', number: 'ORD-1', customer: { name: 'Sofia', email: 's@example.com' }, items: [{}, {}] });
	assert.strictEqual(Object.keys(order).length, 10);
	assert.strictEqual(order.customer_email, 's@example.com');
	assert.strictEqual(order.item_count, 2);
});

