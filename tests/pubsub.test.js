import path from 'node:path';
import { strict as assert } from 'node:assert';
import { TestRunner } from '@marianmeres/test-runner';
import { fileURLToPath } from 'node:url';
import { createPubSub } from '../dist/index.js';

const suite = new TestRunner(path.basename(fileURLToPath(import.meta.url)));

suite.test('pub sub works', () => {
	const log = [];
	const ps = createPubSub();

	const unsub = ps.subscribe('foo', (data) => {
		log.push(data);
	});

	assert(!log.length);

	ps.publish('foo', 'bar');

	assert(log.length === 1);
	assert(log[0] === 'bar');

	unsub();
	unsub(); // noop
	unsub(); // noop

	ps.publish('foo', 'baz');

	assert(log.length === 1);
});

suite.test('subscribe once works', () => {
	const log = [];
	const ps = createPubSub();

	ps.subscribeOnce('foo', (data) => log.push(data));

	ps.publish('foo', 'bar');
	ps.publish('foo', 'baz');
	ps.publish('foo', 'bat');

	assert(log.length === 1);
	assert(log[0] === 'bar');
});

suite.test('subscribe once unsub early works', () => {
	const log = [];
	const ps = createPubSub();

	// immediately unsubscribe
	const unsub = ps.subscribeOnce('foo', (data) => log.push(data));
	unsub();

	ps.publish('foo', 'bar');

	assert(!log.length);
});

suite.test('publish undefined', () => {
	const log = [];
	const ps = createPubSub();
	const unsub = ps.subscribe('foo', (data) => log.push(data));

	ps.publish('foo');
	ps.publish('foo', undefined);

	assert(log.length === 2);
	assert(log[0] === undefined);
	assert(log[1] === undefined);

	unsub();
});

suite.test('outer unsubscribe', () => {
	const log = [];
	const ps = createPubSub();
	const fn = (data) => log.push(data);
	ps.subscribe('foo', fn);

	ps.publish('must be ignored');

	ps.publish('foo');
	assert(log.length === 1);

	ps.unsubscribe('foo', fn);
	ps.publish('foo'); // must have no effect
	assert(log.length === 1);

	ps.unsubscribe(() => null); // noop
	ps.unsubscribe(123); // noop
});

//
export default suite;
