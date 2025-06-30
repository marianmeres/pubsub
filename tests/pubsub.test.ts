// deno-lint-ignore-file no-explicit-any

import { assert, assertEquals } from "@std/assert";
import { createPubSub } from "../src/pubsub.ts";

Deno.test("pub sub works", () => {
	const log: any[] = [];
	const ps = createPubSub();

	const unsub = ps.subscribe("foo", (data) => {
		log.push(data);
	});

	assert(!log.length);

	ps.publish("foo", "bar");

	assert(log.length === 1);
	assert(log[0] === "bar");

	unsub();
	unsub(); // noop
	unsub(); // noop

	ps.publish("foo", "baz");

	assert(log.length === 1);
});

Deno.test("subscribe once works", () => {
	const log: any[] = [];
	const ps = createPubSub();

	ps.subscribeOnce("foo", (data) => log.push(data));

	ps.publish("foo", "bar");
	ps.publish("foo", "baz");
	ps.publish("foo", "bat");

	assert(log.length === 1);
	assert(log[0] === "bar");
});

Deno.test("subscribe once unsub early works", () => {
	const log: any[] = [];
	const ps = createPubSub();

	// immediately unsubscribe
	const unsub = ps.subscribeOnce("foo", (data) => log.push(data));
	unsub();

	ps.publish("foo", "bar");

	assert(!log.length);
});

Deno.test("publish undefined", () => {
	const log: any[] = [];
	const ps = createPubSub();
	const unsub = ps.subscribe("foo", (data) => log.push(data));

	ps.publish("foo");
	ps.publish("foo", undefined);

	assert(log.length === 2);
	assert(log[0] === undefined);
	assert(log[1] === undefined);

	unsub();
});

Deno.test("outer unsubscribe", () => {
	const log: any[] = [];
	const ps = createPubSub();
	const fn = (data: any) => log.push(data);
	ps.subscribe("foo", fn);

	ps.publish("must be ignored");

	ps.publish("foo");
	assert(log.length === 1);

	ps.unsubscribe("foo", fn);
	ps.publish("foo"); // must have no effect
	assert(log.length === 1);
});

Deno.test("unsubscribe all for topic", () => {
	const log: any[] = [];
	const ps = createPubSub();
	const fn = (data: any) => log.push(data);
	ps.subscribe("foo", fn);
	ps.subscribe("foo", () => log.push("bar"));

	ps.publish("foo", 1);
	assertEquals(log, [1, "bar"]);

	// both will be unsubscribed
	ps.unsubscribe("foo");

	ps.publish("foo", 2); // must have no effect

	assertEquals(log, [1, "bar"]);
});

Deno.test("unsubscribe all", () => {
	const log: any[] = [];
	const ps = createPubSub();
	const fn = (data: any) => log.push(data);
	ps.subscribe("foo", fn);
	ps.subscribe("foo", () => log.push("bar"));

	ps.publish("foo", 1);
	assertEquals(log, [1, "bar"]);

	// all will be unsubscribed
	ps.unsubscribeAll();

	ps.publish("foo", 2); // must have no effect

	assertEquals(log, [1, "bar"]);
});

Deno.test("wildcard", () => {
	let log: any[] = [];
	const ps = createPubSub();

	const unsub = ps.subscribe("*", (data: any) => log.push("*:" + data));
	ps.subscribe("foo", (data: any) => log.push(data));

	ps.publish("foo", "foo");
	ps.publish("bar", "bar");
	ps.publish("baz", "baz");

	// "foo" must be logged twice
	assertEquals(log, ["foo", "*:foo", "*:bar", "*:baz"]);

	unsub(); // unsub wildcard listener
	log = [];

	// wildcard must not be subscribed anymore
	ps.publish("no effect");
	assertEquals(log, []);

	ps.unsubscribeAll();
});
