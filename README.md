# @marianmeres/pubsub

[![NPM version](https://img.shields.io/npm/v/@marianmeres/pubsub)](https://www.npmjs.com/package/@marianmeres/pubsub)
[![JSR version](https://jsr.io/badges/@marianmeres/pubsub)](https://jsr.io/@marianmeres/pubsub)

Lightweight, type-safe publish-subscribe with zero dependencies.

## Features

- **Typed events** — optional generic event map for compile-time safety
- **Wildcard subscriptions** — subscribe to every event with `"*"`
- **Async-aware** — rejected promises from `async` subscribers are routed to your error handler
- **Safe re-entrancy** — subscribing/unsubscribing inside a callback never affects the in-flight publish
- **Memory-efficient** — empty topics are auto-cleaned
- **`using`-friendly** — the unsubscriber implements `Symbol.dispose`
- **Destructuring-safe** — methods are pre-bound, so `const { publish } = createPubSub()` just works

## Install

```sh
# Deno
deno add jsr:@marianmeres/pubsub
```

```sh
# npm
npm install @marianmeres/pubsub
```

## Basic Usage

```ts
import { createPubSub } from '@marianmeres/pubsub';

const { publish, subscribe, subscribeOnce, unsubscribe, unsubscribeAll } = createPubSub();

// Create a subscription (returns an unsubscribe function)
const unsub = subscribe('foo', console.log);

// Publish data
publish('foo', 'bar'); // logs 'bar'

// Unsubscribe — calling again is a safe no-op
unsub();

// Alternative ways to unsubscribe
unsubscribe('foo', console.log);
unsubscribeAll('foo');

// Now this is a no-op as no subscription exists
publish('foo', 'baz');
```

## Typed Events

Pass an event map to get full type-safety on `publish` and `subscribe`:

```ts
import { createPubSub } from '@marianmeres/pubsub';

type Events = {
  'user:login':  { id: number; name: string };
  'user:logout': { id: number };
  'tick':        number;
};

const ps = createPubSub<Events>();

ps.publish('user:login', { id: 1, name: 'Ada' }); // ✓
// ps.publish('user:login', { id: 1 });           // ✗ TypeScript error
// ps.publish('unknown', 1);                      // ✗ TypeScript error

ps.subscribe('tick', (n) => {
  // n is inferred as number
  console.log(n + 1);
});

ps.subscribe('*', ({ event, data }) => {
  // event: keyof Events; data: union of all event payloads
});
```

## Advanced Usage

### Subscribe Once

Subscribe to an event that auto-unsubscribes after the first delivery. The unsubscribe happens *before* your callback runs, so re-entrant publishes from within the callback can never re-trigger it.

```ts
const ps = createPubSub();

ps.subscribeOnce('init', (data) => {
  console.log('Initialized:', data);
});

ps.publish('init', { ready: true }); // logs once
ps.publish('init', { ready: true }); // no-op
```

### Subscribe to Multiple Topics

```ts
const unsub = ps.subscribeMany(['user:login', 'user:logout'], (data) => {
  console.log('user event', data);
});

unsub(); // removes all of them at once
```

### Wildcard Subscriptions

Subscribe to all events using the `"*"` topic. Wildcard subscribers receive an envelope:

```ts
ps.subscribe('*', ({ event, data }) => {
  console.log(`event "${event}" published with`, data);
});

ps.publish('user:login', { userId: 123 });
// → event "user:login" published with { userId: 123 }
```

> **Note** — `"*"` is reserved for *subscribers*. Calling `publish('*', …)` throws.

### `using` Statement (ES2024 Explicit Resource Management)

The unsubscriber returned by `subscribe`, `subscribeOnce`, and `subscribeMany` implements `Symbol.dispose`. In environments that support `using`, subscriptions can scope themselves automatically:

```ts
{
  using sub = ps.subscribe('foo', (data) => console.log(data));
  ps.publish('foo', 'bar');
  // sub is auto-unsubscribed when the block exits
}
```

### Async Subscribers

Subscribers may be `async`. Rejections are routed to your error handler the same way synchronous throws are — they will *not* surface as unhandled rejections.

```ts
const ps = createPubSub({
  onError: (err, topic, isWildcard) => log.error({ err, topic, isWildcard }),
});

ps.subscribe('save', async (data) => {
  await db.write(data);          // resolved value is ignored
  if (!data.ok) throw new Error('bad payload'); // → onError
});
```

### Check Subscription Status

```ts
const cb = (data) => console.log(data);
ps.subscribe('foo', cb);

ps.isSubscribed('foo', cb);                  // true
ps.subscribe('*', cb);
ps.isSubscribed('bar', cb);                  // true (via wildcard)
ps.isSubscribed('bar', cb, false);           // false (excluding wildcard)
```

### Introspection

```ts
ps.subscriberCount();        // total subscribers across all topics (incl. "*")
ps.subscriberCount('foo');   // direct subscribers on "foo"
ps.hasSubscribers('foo');    // true if "foo" has direct subscribers
ps.topics();                 // string[] — topics with at least one subscriber
```

### Custom Error Handling

By default, errors thrown by subscribers (and rejections from async subscribers) are logged to `console.error`. Customize via the `onError` option:

```ts
// Silent mode
const ps = createPubSub({ onError: () => {} });

// Send to your logger
const ps = createPubSub({
  onError: (error, topic, isWildcard) => {
    myLogger.error('subscriber error', { error, topic, isWildcard });
  },
});
```

`onError` receives:
- `error: Error` — the thrown error or rejection reason
- `topic: string` — the topic being published
- `isWildcard: boolean` — `true` if the failing subscriber was attached to `"*"`

## API Reference

For the full reference, see [API.md](API.md).

### Quick Reference

| Method | Description |
|---|---|
| `createPubSub<Events>(options?)` | Factory returning a typed `PubSub<Events>` |
| `new PubSub<Events>(options?)` | Constructor |
| `publish(topic, data?)` | Publishes data; throws if `topic === "*"` |
| `subscribe(topic, cb)` | Subscribes; returns an `Unsubscriber` (Disposable) |
| `subscribeOnce(topic, cb)` | One-shot subscription |
| `subscribeMany(topics, cb)` | One callback for many topics |
| `unsubscribe(topic, cb?)` | Removes a callback or all subscribers of `topic` |
| `unsubscribeAll(topic?)` | Clears all subscribers of `topic`, or every topic |
| `isSubscribed(topic, cb, considerWildcard?)` | Subscription check |
| `subscriberCount(topic?)` | Count of subscribers (per topic, or total) |
| `hasSubscribers(topic)` | True if `topic` has direct subscribers |
| `topics()` | Topics with at least one subscriber |

## TypeScript

Full type support, including a generic event map:

```ts
import { PubSub, type PubSubOptions, type Subscriber, type Unsubscriber, type WildcardEnvelope }
  from '@marianmeres/pubsub';

type Events = { 'msg': string };

const ps = new PubSub<Events>({
  onError: (error, topic, isWildcard) =>
    console.warn(`[${isWildcard ? 'wildcard' : 'direct'}] ${topic}:`, error),
});
```

## Important Notes

- Subscribers run **synchronously** in registration order. Async subscribers are not awaited; their rejections are routed to `onError`.
- The subscriber list is snapshotted before each publish — adding subscribers inside a callback never affects the in-flight publish; removing subscribers inside a callback does not suppress already-snapshotted callees for the in-flight publish.
- Subscriber errors are caught and routed to `onError`; other subscribers continue to run.
- Empty topics are auto-cleaned after the last subscriber leaves.
- The wildcard `"*"` is reserved for subscribers; `publish('*', …)` throws.
- Methods are bound in the constructor — destructuring `createPubSub()` is safe.

## Migration from 2.x

Version 3 is a breaking release. See [CHANGELOG](CHANGELOG.md) (or the release notes) for the full list. Notable observable behavior changes:

- `publish('*', …)` now **throws** (was silent and inconsistent).
- `subscribeOnce` now fires exactly once, even under re-entrant publish.
- Subscribers added during a `publish` no longer fire in the same publish (snapshot semantics).
- Subscribers removed during a `publish` are still delivered for the in-flight publish (snapshot semantics).
- Async subscriber rejections now go through `onError` (previously: unhandled).
- `unsubscribeAll()` returns `false` when nothing was actually removed (previously always `true`).
- `Unsubscriber` return type narrowed from `() => void | boolean` to `() => void`.
- `__dump()` now returns a defensive copy of the internal sets.

Additive (non-breaking-style) additions: `subscribeMany`, `subscriberCount`, `hasSubscribers`, `topics`, generic `PubSub<TEvents>`, `Symbol.dispose` on the unsubscriber.

## Package Identity

- **Name:** @marianmeres/pubsub
- **Author:** Marian Meres
- **Repository:** https://github.com/marianmeres/pubsub
- **License:** MIT
