'use strict';

// Runs against the compiled node (npm test builds first). Node's own test runner: the package keeps
// no runtime dependencies, and needs no test framework for this.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { verifySignature } = require('../dist/nodes/WebkioTrigger/signature');

const sign = (body, secret, ts) =>
	'v1=' + crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');

test('a correctly signed, fresh delivery verifies', () => {
	const ts = String(Math.floor(Date.now() / 1000));
	assert.strictEqual(verifySignature('{"a":1}', sign('{"a":1}', 's3cret', ts), ts, 's3cret'), true);
});

test('a wrong secret, an edited body or a stale timestamp does not', () => {
	const ts = String(Math.floor(Date.now() / 1000));
	assert.strictEqual(verifySignature('{"a":1}', sign('{"a":1}', 'other', ts), ts, 's3cret'), false);
	assert.strictEqual(verifySignature('{"a":2}', sign('{"a":1}', 's3cret', ts), ts, 's3cret'), false);
	const old = String(Math.floor(Date.now() / 1000) - 3600);
	assert.strictEqual(verifySignature('{"a":1}', sign('{"a":1}', 's3cret', old), old, 's3cret'), false);
});

test('nothing to check against is not a failure', () => {
	assert.strictEqual(verifySignature('{"a":1}', undefined, undefined, 's3cret'), null);
	assert.strictEqual(verifySignature('{"a":1}', 'v1=x', '1', undefined), null);
});
