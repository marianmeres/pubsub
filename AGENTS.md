# AGENTS.md

Machine-readable context for AI agents working with this codebase.

## Package Overview

- **Name:** `@marianmeres/pubsub`
- **Type:** Lightweight publish-subscribe (pub/sub) library
- **Runtime:** Deno-first, cross-published to npm
- **Language:** TypeScript
- **Dependencies:** Zero runtime dependencies
- **License:** MIT
- **Major version:** 3.x (BC release — see "Migration from 2.x" in README)

## Architecture

### File Structure

```
src/
  mod.ts          # Re-exports from pubsub.ts
  pubsub.ts       # All implementation code
tests/
  pubsub.test.ts  # All tests (26)
scripts/
  build-npm.ts    # npm build script
```

### Core Design

Single-file implementation with:
- `PubSub<TEvents>` class (generic; default `Record<string, any>` preserves untyped use)
- `createPubSub<TEvents>()` factory
- Private `Map<string, Set<Subscriber>>` for storage
- Wildcard topic `"*"` for global subscriptions (subscribers receive a `WildcardEnvelope`)
- `Symbol.dispose` polyfilled at module top for older runtimes

## Public API

### Exports

| Export | Type | Description |
|--------|------|-------------|
| `PubSub<TEvents>` | class | Main pub/sub implementation (generic) |
| `createPubSub<TEvents>` | function | Factory function |
| `Subscriber<TData>` | type | `(detail: TData) => unknown` (return ignored; promise rejections → onError) |
| `Unsubscriber` | interface | Callable + `Symbol.dispose` |
| `WildcardEnvelope<TEvents>` | interface | `{ event, data }` delivered to `"*"` subscribers |
| `ErrorHandler` | type | `(error, topic, isWildcard) => void` |
| `PubSubOptions` | interface | `{ onError? }` |
| `DefaultEventMap` | type | `Record<string, any>` (default generic) |

### PubSub Methods

| Method | Signature | Returns |
|--------|-----------|---------|
| `publish` | `(topic, data?)` | `boolean` (true if direct subscribers; **throws** if topic is `"*"`) |
| `subscribe` | `(topic, cb)` | `Unsubscriber` |
| `subscribeOnce` | `(topic, cb)` | `Unsubscriber` (unsubs **before** invoking) |
| `subscribeMany` | `(topics: string[], cb)` | `Unsubscriber` (removes all) |
| `unsubscribe` | `(topic, cb?)` | `boolean` |
| `unsubscribeAll` | `(topic?)` | `boolean` (false when nothing was removed) |
| `isSubscribed` | `(topic, cb, considerWildcard?)` | `boolean` |
| `subscriberCount` | `(topic?)` | `number` |
| `hasSubscribers` | `(topic)` | `boolean` |
| `topics` | `()` | `string[]` |
| `__dump` | `()` | `Record<string, Set<Subscriber>>` (defensive copy; internal/debug) |

## Key Behaviors

### Generic Typing

```ts
type Events = { 'tick': number; 'msg': { body: string } };
const ps = createPubSub<Events>();
ps.publish('tick', 1);          // typed
ps.subscribe('msg', (m) => …);  // m: { body: string }
```

When `TEvents` is omitted, defaults to `Record<string, any>` and behaves like the dynamic 2.x API.

### Wildcard Subscriptions

- Topic `"*"` subscribes to all events
- Wildcard subscribers receive an envelope: `{ event: keyof TEvents & string, data }`
- `publish('*', …)` **throws** — `"*"` is reserved for subscribers

### Error Handling

- Synchronous subscriber throws → caught, routed to `onError`
- Async subscriber rejection → also caught, routed to `onError`
- Other subscribers continue executing after an error
- Default `onError`: `console.error`

### Re-entrancy / Snapshot Semantics

The subscriber list is snapshotted before each publish. Therefore:
- A subscriber that calls `subscribe(sameTopic, …)` does **not** see the new callback fire in the in-flight publish.
- A subscriber that calls `unsubscribe(sameTopic, otherCb)` does **not** suppress `otherCb` for the in-flight publish.
- `subscribeOnce` unsubscribes **before** invoking the user callback, so re-entrant publishes can never re-fire it.

### Memory Management

- Empty topics auto-cleanup when last subscriber removed
- Unsubscriber functions are idempotent (safe to call multiple times)

### Resource Management (`using`)

`Unsubscriber` implements `Symbol.dispose`:
```ts
{
  using s = ps.subscribe('foo', cb);
} // auto-unsubscribed at block exit
```

### Method Binding

All public methods are bound in the constructor. Destructuring is safe:
```ts
const { publish, subscribe } = createPubSub();
```

### Execution Model

- Synchronous, ordered delivery in registration order
- Async subscribers are **not** awaited — fire-and-forget; their rejections route to `onError`

## Development Commands

```bash
deno test              # Run tests once (26 tests)
deno task test:watch   # Watch mode
deno task npm:build    # Build npm package
deno task npm:publish  # Build and publish to npm
```

## Testing

- Framework: Deno test
- Location: `tests/pubsub.test.ts`
- Test count: **26 tests**
- Coverage: All public methods, all bug-fix invariants, snapshot semantics, async errors, `Symbol.dispose`, generic typing

## Code Style

- Tabs for indentation, line width 90
- `no-explicit-any` lint disabled in tests
- Uses Deno fmt

## Publishing

- JSR: Publish via `deno publish`
- npm: Build with `deno task npm:build`, outputs to `.npm-dist/`
- Uses `@marianmeres/npmbuild` for npm package generation

## Common Patterns

### Basic Usage (destructuring is supported)

```ts
const { publish, subscribe } = createPubSub();
const unsub = subscribe('topic', (data) => { /* … */ });
publish('topic', data);
unsub();
```

### Typed Events

```ts
type Events = { 'user:login': { id: number } };
const ps = createPubSub<Events>();
ps.publish('user:login', { id: 1 });
```

### One-time Subscription

```ts
ps.subscribeOnce('init', (data) => { /* runs exactly once, even on re-entrant publish */ });
```

### Multi-topic Subscription

```ts
const unsub = ps.subscribeMany(['a', 'b', 'c'], handler);
unsub(); // removes all three
```

### Global Event Logging (wildcard)

```ts
ps.subscribe('*', ({ event, data }) => console.log(event, data));
```

### `using`-statement Disposal

```ts
{
  using s = ps.subscribe('foo', cb);
}
```

### Silent Error Mode

```ts
const ps = createPubSub({ onError: () => {} });
```

### Async Subscribers

```ts
ps.subscribe('save', async (data) => {
  await db.write(data);   // resolves are ignored; rejections → onError
});
```

## Breaking Changes vs 2.x (relevant for migration tooling)

- `publish('*', …)` now throws.
- `subscribeOnce` fires exactly once even under re-entrant publish (was N times).
- `publish` snapshots subscribers (was: live-iterated).
- Async subscriber rejections route to `onError` (was: unhandled).
- `unsubscribeAll()` returns `false` when nothing removed (was: always `true`).
- `Unsubscriber` is now `() => void` (was `() => void | boolean`) and also a `Disposable`.
- `Subscriber` return type widened from `void` to `unknown`.
- `__dump()` returns a defensive copy.

## Additive Surface vs 2.x

`subscribeMany`, `subscriberCount`, `hasSubscribers`, `topics`, generic `PubSub<TEvents>`, `WildcardEnvelope<TEvents>`, `DefaultEventMap`, `Symbol.dispose` on `Unsubscriber`, bound methods.
