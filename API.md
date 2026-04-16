# API Reference

Complete API documentation for `@marianmeres/pubsub`.

## Table of Contents

- [Factory Function](#factory-function)
- [PubSub Class](#pubsub-class)
  - [Constructor](#constructor)
  - [Methods](#methods)
- [Types](#types)

---

## Factory Function

### `createPubSub<TEvents>(options?)`

Convenience factory equivalent to `new PubSub<TEvents>(options)`.

**Type Parameters:**
- `TEvents` (optional): `Record<string, any>` — event map for typed events. Defaults to `Record<string, any>` (untyped).

**Parameters:**
- `options` (optional): [`PubSubOptions`](#pubsuboptions)

**Returns:** [`PubSub<TEvents>`](#pubsub-class)

**Example:**
```ts
import { createPubSub } from '@marianmeres/pubsub';

const ps = createPubSub();

// With custom error handling
const ps2 = createPubSub({
  onError: (error, topic) => myLogger.error(error, { topic }),
});

// Typed events
type Events = { 'tick': number; 'msg': { body: string } };
const ps3 = createPubSub<Events>();
```

---

## PubSub Class

A lightweight, type-safe publish-subscribe.

- Synchronous, ordered delivery (registration order).
- Subscriber errors and async rejections are caught and routed to `onError`; other subscribers keep running.
- The subscriber list is snapshotted before delivery — concurrent subscribe/unsubscribe inside a callback never affects the in-flight publish.
- Empty topics are auto-cleaned.
- Wildcard `"*"` subscribers receive a [`WildcardEnvelope`](#wildcardenvelope).
- Methods are pre-bound; destructuring is safe.

### Constructor

```ts
new PubSub<TEvents extends Record<string, any> = Record<string, any>>(options?: PubSubOptions)
```

**Example:**
```ts
import { PubSub } from '@marianmeres/pubsub';

const ps = new PubSub();
const silent = new PubSub({ onError: () => {} });
```

---

### Methods

#### `publish(topic, data?)`

Publishes data to all direct subscribers of `topic`, then to all wildcard (`"*"`) subscribers (which receive a [`WildcardEnvelope`](#wildcardenvelope)).

Subscribers are called in registration order. Errors from any subscriber are caught and routed to `onError`; remaining subscribers still run. The subscriber list is snapshotted before iteration.

**Parameters:**
- `topic`: `string` (or `keyof TEvents` if generic) — must not be `"*"`
- `data` (optional): the payload (typed by `TEvents[topic]` when generic)

**Returns:** `boolean` — `true` if the topic had any direct subscribers; wildcard subscribers do not affect this value.

**Throws:** if `topic === "*"`. The wildcard is reserved for subscribers.

**Example:**
```ts
ps.publish('user:login', { userId: 123 });
ps.publish('notification'); // data is optional in the untyped case
```

---

#### `subscribe(topic, callback)`

Subscribes a callback. Use `"*"` to receive every event as a [`WildcardEnvelope`](#wildcardenvelope).

**Parameters:**
- `topic`: `string` (or `keyof TEvents` / `"*"` if generic)
- `callback`: [`Subscriber`](#subscriber)

**Returns:** [`Unsubscriber`](#unsubscriber) — idempotent function that also implements `Symbol.dispose`.

**Example:**
```ts
const unsub = ps.subscribe('foo', (data) => console.log(data));

// Wildcard
ps.subscribe('*', ({ event, data }) => console.log(event, data));

// Disposable / using
{
  using s = ps.subscribe('bar', handler);
}
```

---

#### `subscribeOnce(topic, callback)`

Subscribes for exactly one delivery, then auto-unsubscribes. The unsubscribe runs **before** the callback, so re-entrant publishes from inside the callback never re-fire it. Errors are still routed to `onError`.

**Parameters:**
- `topic`: `string` (or `keyof TEvents` / `"*"` if generic)
- `callback`: [`Subscriber`](#subscriber)

**Returns:** [`Unsubscriber`](#unsubscriber) — can also be used to cancel before the event fires.

**Example:**
```ts
ps.subscribeOnce('init', (data) => {
  console.log('Initialized:', data);
});

ps.publish('init', { ready: true }); // logs once
ps.publish('init', { ready: true }); // no-op
```

---

#### `subscribeMany(topics, callback)`

Subscribes a single callback to multiple topics. The returned unsubscriber removes them all.

**Parameters:**
- `topics`: `string[]` (or `(keyof TEvents)[]` if generic)
- `callback`: [`Subscriber`](#subscriber)

**Returns:** [`Unsubscriber`](#unsubscriber)

**Example:**
```ts
const unsub = ps.subscribeMany(['user:login', 'user:logout'], (data) => {
  console.log(data);
});
unsub(); // removes both
```

---

#### `unsubscribe(topic, callback?)`

Removes a specific callback from a topic. If `callback` is omitted, removes every subscriber from the topic. Empty topics are auto-cleaned.

**Parameters:**
- `topic`: `string`
- `callback` (optional): [`Subscriber`](#subscriber)

**Returns:** `boolean` — `true` if anything was removed.

**Example:**
```ts
ps.unsubscribe('foo', myCallback);
ps.unsubscribe('foo'); // remove all from "foo"
```

---

#### `unsubscribeAll(topic?)`

Removes every subscriber for `topic`, or — if `topic` is omitted — every subscriber from every topic.

**Parameters:**
- `topic` (optional): `string`

**Returns:** `boolean` — `true` if anything was removed, `false` otherwise (e.g. nothing was subscribed, or the topic doesn't exist).

**Example:**
```ts
ps.unsubscribeAll('foo'); // clear "foo"
ps.unsubscribeAll();      // clear everything
```

---

#### `isSubscribed(topic, callback, considerWildcard?)`

Checks whether `callback` is subscribed to `topic`. By default, also reports `true` if `callback` is registered to the wildcard `"*"`.

**Parameters:**
- `topic`: `string`
- `callback`: [`Subscriber`](#subscriber)
- `considerWildcard` (optional): `boolean` — default `true`

**Returns:** `boolean`

**Example:**
```ts
ps.subscribe('*', cb);
ps.isSubscribed('foo', cb);        // true (via wildcard)
ps.isSubscribed('foo', cb, false); // false (excluding wildcard)
```

---

#### `subscriberCount(topic?)`

Returns the subscriber count for `topic`, or — if `topic` is omitted — the total across all topics (including `"*"`).

**Parameters:**
- `topic` (optional): `string`

**Returns:** `number`

**Example:**
```ts
ps.subscriberCount();        // total
ps.subscriberCount('foo');   // count for "foo"
ps.subscriberCount('*');     // wildcard count
```

---

#### `hasSubscribers(topic)`

Returns `true` if `topic` has at least one **direct** subscriber. Does not consider wildcards.

**Parameters:**
- `topic`: `string`

**Returns:** `boolean`

---

#### `topics()`

Returns the list of topics that currently have at least one subscriber. Includes `"*"` if there are wildcard subscribers.

**Returns:** `string[]`

---

## Types

### `Subscriber`

```ts
type Subscriber<TData = any> = (detail: TData) => unknown;
```

Callback that receives published data. For `"*"` subscriptions, `TData` is a [`WildcardEnvelope`](#wildcardenvelope). The return value is ignored. If the callback returns a Promise (i.e. it is `async`), rejections are routed to `onError`.

---

### `Unsubscriber`

```ts
interface Unsubscriber {
  (): void;
  [Symbol.dispose](): void;
}
```

Function returned by `subscribe`, `subscribeOnce`, and `subscribeMany`. Idempotent — calling more than once is safe. Implements `Symbol.dispose` for use with the ES2024 `using` statement.

---

### `WildcardEnvelope`

```ts
interface WildcardEnvelope<TEvents extends Record<string, any> = Record<string, any>> {
  event: keyof TEvents & string;
  data: TEvents[keyof TEvents];
}
```

Envelope delivered to wildcard (`"*"`) subscribers, identifying which event was published.

---

### `ErrorHandler`

```ts
type ErrorHandler = (error: Error, topic: string, isWildcard: boolean) => void;
```

- `error` — the thrown error or rejection reason from an async subscriber
- `topic` — the topic being published
- `isWildcard` — `true` if the failing subscriber was attached to `"*"`

---

### `PubSubOptions`

```ts
interface PubSubOptions {
  onError?: ErrorHandler;
}
```

- `onError` — custom error handler. Defaults to `console.error`. Pass `() => {}` for silent mode.

---

### `DefaultEventMap`

```ts
type DefaultEventMap = Record<string, any>;
```

Default generic argument for `PubSub<TEvents>` — preserves the dynamic, untyped behavior when no event map is supplied.
