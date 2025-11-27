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

	assert(ps.__dump().foo);

	unsub();
	unsub(); // noop
	unsub(); // noop

	assert(!ps.__dump().foo);

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

	const unsub = ps.subscribe("*", (data: any) =>
		log.push(data.event + ":" + data.data)
	);
	ps.subscribe("foo", (data: any) => log.push(data));

	ps.publish("foo", "foo");
	ps.publish("bar", "bar");
	ps.publish("baz", "foo"); // not baz here, just to test data.event and data.data envelope

	// "foo" must be logged twice
	assertEquals(log, ["foo", "foo:foo", "bar:bar", "baz:foo"]);

	assert(ps.__dump()["*"]);
	assert(ps.__dump().foo);

	unsub(); // unsub wildcard listener
	log = [];

	assert(!ps.__dump()["*"]);
	assert(ps.__dump().foo);

	// wildcard must not be subscribed anymore
	ps.publish("no effect");
	assertEquals(log, []);

	ps.unsubscribeAll();
	assert(!ps.__dump()["*"]);
	assert(!ps.__dump().foo);
});

Deno.test("isSubscribed works", () => {
	const cb = (_data: any) => undefined;
	const ps = createPubSub();

	// subscribe to all
	ps.subscribe("*", cb);

	// must be subscribed to "foo" because is subscribed to "*"
	assert(ps.isSubscribed("foo", cb));
	// but not if we exlude wildcard
	assert(!ps.isSubscribed("foo", cb, false));

	// now unsub all, to start fresh
	ps.unsubscribeAll();

	// is NOT
	assert(!ps.isSubscribed("foo", cb));

	// IS
	ps.subscribe("foo", cb);
	assert(ps.isSubscribed("foo", cb));

	assert(!ps.isSubscribed("asdfasdf", cb));

	ps.unsubscribeAll();
});

Deno.test("error in subscriber does not break other subscribers", () => {
	const log: any[] = [];
	const ps = createPubSub({ onError: () => {} }); // silent mode for tests

	// Subscribe first callback that will throw
	ps.subscribe("foo", (_data: any) => {
		throw new Error("Intentional error");
	});

	// Subscribe second callback that should still execute
	ps.subscribe("foo", (data: any) => {
		log.push(data);
	});

	// Subscribe third callback that should also execute
	ps.subscribe("foo", (data: any) => {
		log.push(data + "-second");
	});

	// Publish - first subscriber throws, but others should still execute
	ps.publish("foo", "bar");

	// Both non-throwing subscribers should have been called
	assertEquals(log, ["bar", "bar-second"]);
});

Deno.test("error in wildcard subscriber does not break other subscribers", () => {
	const log: any[] = [];
	const ps = createPubSub({ onError: () => {} }); // silent mode for tests

	// Subscribe wildcard that throws
	ps.subscribe("*", (_envelope: any) => {
		throw new Error("Wildcard error");
	});

	// Subscribe regular callback that should still execute
	ps.subscribe("foo", (data: any) => {
		log.push(data);
	});

	// Subscribe another wildcard that should still execute
	ps.subscribe("*", (envelope: any) => {
		log.push(envelope.event + ":" + envelope.data);
	});

	// Publish - first wildcard throws, but others should still execute
	ps.publish("foo", "bar");

	// Regular subscriber and second wildcard should have been called
	assertEquals(log, ["bar", "foo:bar"]);
});

Deno.test("error in subscribeOnce does not prevent unsubscribe", () => {
	const log: any[] = [];
	const ps = createPubSub({ onError: () => {} }); // silent mode for tests

	// Subscribe once with a callback that throws
	ps.subscribeOnce("foo", (_data: any) => {
		log.push("throwing");
		throw new Error("Subscribe once error");
	});

	// Subscribe regular callback
	ps.subscribe("foo", (data: any) => {
		log.push(data);
	});

	// First publish - subscribeOnce throws but should still auto-unsubscribe
	ps.publish("foo", "first");

	assertEquals(log, ["throwing", "first"]);

	// Second publish - subscribeOnce should not execute again
	ps.publish("foo", "second");

	assertEquals(log, ["throwing", "first", "second"]);
});

Deno.test("custom error handler works", () => {
	const errors: Array<{ error: Error; topic: string; isWildcard: boolean }> = [];
	const ps = createPubSub({
		onError: (error, topic, isWildcard) => {
			errors.push({ error, topic, isWildcard });
		},
	});

	// Subscribe callback that throws
	ps.subscribe("foo", (_data: any) => {
		throw new Error("Regular error");
	});

	// Subscribe wildcard that throws
	ps.subscribe("*", (_envelope: any) => {
		throw new Error("Wildcard error");
	});

	ps.publish("foo", "bar");

	// Should have captured both errors
	assertEquals(errors.length, 2);
	assertEquals(errors[0].topic, "foo");
	assertEquals(errors[0].isWildcard, false);
	assertEquals(errors[0].error.message, "Regular error");
	assertEquals(errors[1].topic, "foo");
	assertEquals(errors[1].isWildcard, true);
	assertEquals(errors[1].error.message, "Wildcard error");
});
