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

	const unsub = ps.subscribe(
		"*",
		(data: any) => log.push(data.event + ":" + data.data),
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

Deno.test("destructured methods work (bound in constructor)", () => {
	const log: any[] = [];
	const { publish, subscribe, unsubscribe, unsubscribeAll } = createPubSub();

	const unsub = subscribe("foo", (data) => log.push(data));
	publish("foo", "bar");
	assertEquals(log, ["bar"]);

	unsub();
	publish("foo", "baz");
	assertEquals(log, ["bar"]);

	subscribe("a", (d) => log.push("a:" + d));
	subscribe("b", (d) => log.push("b:" + d));
	unsubscribe("a");
	publish("a", 1);
	publish("b", 2);
	assertEquals(log, ["bar", "b:2"]);

	unsubscribeAll();
});

Deno.test("subscribeOnce fires only once under re-entrant publish", () => {
	const log: any[] = [];
	const ps = createPubSub();

	ps.subscribeOnce("foo", (data: any) => {
		log.push(data);
		// Re-publish to the same topic from inside the once callback.
		// The wrapper must already be unsubscribed so this does not re-fire.
		if (data === 1) ps.publish("foo", 2);
	});

	ps.publish("foo", 1);
	assertEquals(log, [1]);
});

Deno.test("subscribing during publish does not fire in the same publish", () => {
	const log: any[] = [];
	const ps = createPubSub();

	ps.subscribe("foo", (data: any) => {
		log.push("first:" + data);
		// Add a new subscriber mid-publish — must NOT fire for this publish.
		ps.subscribe("foo", (d: any) => log.push("late:" + d));
	});

	ps.publish("foo", 1);
	assertEquals(log, ["first:1"]);

	ps.publish("foo", 2);
	// Now both fire. Note: the `first` subscriber adds yet another `late`
	// subscriber on every publish — that one also won't fire this turn.
	assertEquals(log, ["first:1", "first:2", "late:2"]);
});

Deno.test("unsubscribing a sibling during publish does not suppress them in the current publish", () => {
	const log: any[] = [];
	const ps = createPubSub();

	const sibling = (data: any) => log.push("sibling:" + data);
	ps.subscribe("foo", (data: any) => {
		log.push("first:" + data);
		// Unsubscribe sibling mid-publish. It was snapshotted, so it still fires.
		ps.unsubscribe("foo", sibling);
	});
	ps.subscribe("foo", sibling);

	ps.publish("foo", 1);
	assertEquals(log, ["first:1", "sibling:1"]);

	// On the next publish, sibling is gone.
	ps.publish("foo", 2);
	assertEquals(log, ["first:1", "sibling:1", "first:2"]);
});

Deno.test("async subscriber rejection routes to onError", async () => {
	const errors: Array<{ topic: string; isWildcard: boolean; msg: string }> = [];
	const ps = createPubSub({
		onError: (error, topic, isWildcard) => {
			errors.push({ topic, isWildcard, msg: error.message });
		},
	});

	ps.subscribe("foo", async (_data: any) => {
		throw new Error("async boom");
	});

	ps.subscribe("*", async (_env: any) => {
		throw new Error("wildcard async boom");
	});

	ps.publish("foo", "bar");

	// Wait one microtask flush so the rejected promises propagate.
	await Promise.resolve();
	await Promise.resolve();

	assertEquals(errors.length, 2);
	assertEquals(errors[0], { topic: "foo", isWildcard: false, msg: "async boom" });
	assertEquals(errors[1], {
		topic: "foo",
		isWildcard: true,
		msg: "wildcard async boom",
	});
});

Deno.test("__dump returns a defensive copy", () => {
	const ps = createPubSub();
	const cb = (_d: any) => {};
	ps.subscribe("foo", cb);

	const dumped = ps.__dump();
	dumped.foo.clear(); // mutating the snapshot must not affect the instance
	dumped.bogus = new Set([cb]);

	assert(ps.isSubscribed("foo", cb));
	assert(!ps.isSubscribed("bogus", cb, false));
});

Deno.test("same callback subscribed twice is deduped", () => {
	const log: any[] = [];
	const ps = createPubSub();
	const cb = (d: any) => log.push(d);

	ps.subscribe("foo", cb);
	ps.subscribe("foo", cb);
	ps.subscribe("foo", cb);

	ps.publish("foo", "x");
	assertEquals(log, ["x"]);
	assertEquals(ps.subscriberCount("foo"), 1);
});

Deno.test("publish to wildcard topic throws", () => {
	const ps = createPubSub();
	let threw = false;
	try {
		ps.publish("*", "anything");
	} catch (e) {
		threw = true;
		assert(e instanceof Error);
		assert(e.message.includes('"*"'));
	}
	assert(threw, 'expected publish("*", ...) to throw');
});

Deno.test("unsubscribeAll() returns false when nothing was removed", () => {
	const ps = createPubSub();
	assertEquals(ps.unsubscribeAll(), false);
	assertEquals(ps.unsubscribeAll("nope"), false);

	ps.subscribe("foo", () => {});
	assertEquals(ps.unsubscribeAll("foo"), true);
	assertEquals(ps.unsubscribeAll("foo"), false);

	ps.subscribe("a", () => {});
	ps.subscribe("b", () => {});
	assertEquals(ps.unsubscribeAll(), true);
	assertEquals(ps.unsubscribeAll(), false);
});

Deno.test("subscriberCount, hasSubscribers, topics", () => {
	const ps = createPubSub();
	assertEquals(ps.subscriberCount(), 0);
	assertEquals(ps.subscriberCount("foo"), 0);
	assertEquals(ps.hasSubscribers("foo"), false);
	assertEquals(ps.topics(), []);

	const a = ps.subscribe("foo", () => {});
	ps.subscribe("foo", () => {});
	ps.subscribe("bar", () => {});
	ps.subscribe("*", () => {});

	assertEquals(ps.subscriberCount(), 4);
	assertEquals(ps.subscriberCount("foo"), 2);
	assertEquals(ps.subscriberCount("bar"), 1);
	assertEquals(ps.subscriberCount("*"), 1);
	assertEquals(ps.subscriberCount("missing"), 0);
	assertEquals(ps.hasSubscribers("foo"), true);
	assertEquals(ps.hasSubscribers("missing"), false);
	assertEquals(ps.topics().sort(), ["*", "bar", "foo"]);

	a();
	assertEquals(ps.subscriberCount("foo"), 1);
});

Deno.test("subscribeMany subscribes to multiple topics", () => {
	const log: any[] = [];
	const ps = createPubSub();

	const unsub = ps.subscribeMany(["a", "b", "c"], (data: any) => log.push(data));

	ps.publish("a", 1);
	ps.publish("b", 2);
	ps.publish("c", 3);
	ps.publish("d", 4); // not subscribed
	assertEquals(log, [1, 2, 3]);

	unsub();
	ps.publish("a", 5);
	ps.publish("b", 6);
	assertEquals(log, [1, 2, 3]);
});

Deno.test("Unsubscriber supports Symbol.dispose / using statement", () => {
	const log: any[] = [];
	const ps = createPubSub();

	{
		using _sub = ps.subscribe("foo", (d: any) => log.push(d));
		ps.publish("foo", 1);
		assertEquals(log, [1]);
		assertEquals(ps.subscriberCount("foo"), 1);
	}

	// After the using-block, subscription must be disposed.
	assertEquals(ps.subscriberCount("foo"), 0);
	ps.publish("foo", 2);
	assertEquals(log, [1]);
});

Deno.test("typed events compile and run", () => {
	type Events = {
		"user:login": { id: number };
		tick: number;
	};
	const log: any[] = [];
	const ps = createPubSub<Events>();

	ps.subscribe("user:login", (data) => {
		// data is { id: number } at the type level
		log.push(data.id);
	});
	ps.subscribe("tick", (n) => {
		// n is number
		log.push(n + 1);
	});
	ps.subscribe("*", (env) => {
		// env is WildcardEnvelope<Events>
		log.push(env.event);
	});

	ps.publish("user:login", { id: 42 });
	ps.publish("tick", 10);

	assertEquals(log, [42, "user:login", 11, "tick"]);
});
