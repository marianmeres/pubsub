# CLAUDE.md - Project Intelligence

> Machine-readable project context for AI assistants

## Project Identity

- **Name:** @marianmeres/pubsub
- **Version:** 2.4.0
- **Type:** Lightweight pub/sub event system
- **Runtime:** Deno-first, dual distribution (Deno + NPM)
- **Language:** TypeScript
- **License:** MIT
- **Repository:** https://github.com/marianmeres/pubsub
- **Author:** Marian Meres

## Project Structure

```
/
├── src/
│   ├── mod.ts              # Barrel export (re-exports pubsub.ts)
│   └── pubsub.ts           # Core implementation (~144 lines)
├── tests/
│   └── pubsub.test.ts      # Test suite (13 tests, ~296 lines)
├── scripts/
│   └── build-npm.ts        # NPM build/transpile script
├── .npm-dist/              # Generated NPM package (gitignored)
├── deno.json               # Deno config, tasks, version
├── deno.lock               # Dependency lock
├── README.md               # User documentation
└── LICENSE                 # MIT license
```

## Core Architecture

### Main Class: `PubSub`

Location: [src/pubsub.ts](src/pubsub.ts)

```typescript
class PubSub {
  #subs: Map<string, Set<Subscriber>>  // topic -> subscribers
  #onError: ErrorHandler               // custom error handler

  constructor(options?: PubSubOptions)
  publish(topic: string, data?: any): boolean
  subscribe(topic: string, cb: Subscriber): Unsubscriber
  subscribeOnce(topic: string, cb: Subscriber): Unsubscriber
  unsubscribe(topic: string, cb?: Subscriber): boolean
  unsubscribeAll(topic?: string): boolean
  isSubscribed(topic: string, cb: Subscriber, considerWildcard?: boolean): boolean
  __dump(): Record<string, Set<Subscriber>>  // debug only
}

function createPubSub(options?: PubSubOptions): PubSub  // factory
```

### Type Definitions

```typescript
type Subscriber = (detail: any) => void
type Unsubscriber = () => void | boolean
type ErrorHandler = (error: Error, topic: string, isWildcard: boolean) => void
interface PubSubOptions { onError?: ErrorHandler }
```

## Key Design Decisions

1. **Wildcard subscriptions:** `"*"` topic receives ALL events via envelope `{ event, data }`
2. **Error isolation:** Each subscriber wrapped in try-catch; errors don't propagate
3. **Memory cleanup:** Empty topic sets auto-deleted after last unsubscribe
4. **Synchronous execution:** Subscribers called in subscription order
5. **Zero dependencies:** Pure TypeScript, no runtime deps

## Commands

```bash
# Run tests (watch mode)
deno test --watch
# or
deno task test

# Build NPM package
deno task npm:build

# Build and publish to NPM
deno task npm:publish
```

## Testing

- **Framework:** Deno built-in test runner
- **Assertions:** @std/assert
- **Location:** [tests/pubsub.test.ts](tests/pubsub.test.ts)
- **Run:** `deno test` or `deno task test`

### Test Coverage (13 tests)

1. Basic pub/sub lifecycle
2. `subscribeOnce` auto-unsubscribe
3. Early unsubscribe before trigger
4. Publishing undefined data
5. Manual `unsubscribe(topic, cb)`
6. `unsubscribe(topic)` clears all for topic
7. `unsubscribeAll()` clears everything
8. Wildcard `"*"` subscriptions with envelope
9. `isSubscribed` with/without wildcard consideration
10. Error isolation (throwing subscriber doesn't break others)
11. Wildcard error isolation
12. `subscribeOnce` error handling (still unsubscribes)
13. Custom error handler

## Build System

### NPM Build Script

Location: [scripts/build-npm.ts](scripts/build-npm.ts)

**Process:**
1. Create/empty `.npm-dist/`
2. Copy `src/` to `.npm-dist/src/`
3. Rewrite `.ts` imports to `.js` (regex replacement)
4. Generate `tsconfig.json` (ESNext target, declarations)
5. Run `tsc -p tsconfig.json`
6. Generate `package.json` from `deno.json` metadata
7. Cleanup temp files

**Output:** ES module package with TypeScript declarations

## API Quick Reference

```typescript
import { createPubSub } from '@marianmeres/pubsub';

const ps = createPubSub();

// Subscribe (returns unsubscriber)
const unsub = ps.subscribe('topic', (data) => { ... });

// Publish
ps.publish('topic', anyData);

// Subscribe once (auto-unsubscribes after first call)
ps.subscribeOnce('topic', (data) => { ... });

// Wildcard (receives { event, data } envelope)
ps.subscribe('*', ({ event, data }) => { ... });

// Unsubscribe
unsub();                           // via returned function
ps.unsubscribe('topic', callback); // specific callback
ps.unsubscribe('topic');           // all from topic
ps.unsubscribeAll();               // everything
ps.unsubscribeAll('topic');        // all from specific topic

// Check subscription status
ps.isSubscribed('topic', callback);         // considers wildcard
ps.isSubscribed('topic', callback, false);  // excludes wildcard

// Custom error handling
const ps = createPubSub({
  onError: (error, topic, isWildcard) => { ... }
});
```

## Dependencies

### Runtime
None (zero dependencies)

### Development (Deno)
- `@std/assert@1` - Testing assertions
- `@std/fs@^1.0.17` - File operations (build script)
- `@std/path@^1.0.9` - Path utilities (build script)

## Code Style

From `deno.json`:
- Tabs for indentation
- 90 character line width
- 4-space indent width (for tab rendering)
- `no-explicit-any` lint rule disabled

## Important Implementation Details

### Wildcard Behavior
- Publishing to `"*"` only triggers wildcard subscribers
- Regular topic publishes trigger both topic subscribers AND wildcard subscribers
- Wildcard subscribers receive envelope: `{ event: topicName, data: publishedData }`

### Error Handling
- Default: errors logged to `console.error`
- Custom: pass `onError` to constructor/factory
- Silent mode: `onError: () => {}`
- Errors include: error object, topic string, isWildcard boolean

### Memory Management
- Uses `Map<string, Set<Subscriber>>` internally
- Empty Sets cleaned up automatically
- No memory leaks from subscribe/unsubscribe cycles

### subscribeOnce Implementation
- Uses try-finally to ensure unsubscribe even if callback throws
- Wraps callback in `onceWrapper` function

## Version History (Recent)

- **v2.4.0** - Current version
- **v2.3.0** - Previous version
- Custom `onError` handler feature
- Wildcard publish envelope feature

## File Sizes

- `src/pubsub.ts`: ~144 lines (core implementation)
- `src/mod.ts`: 1 line (barrel export)
- `tests/pubsub.test.ts`: ~296 lines (comprehensive tests)
- `scripts/build-npm.ts`: ~113 lines (build automation)

## Common Tasks

### Adding a new feature
1. Implement in `src/pubsub.ts`
2. Export types in `src/pubsub.ts` if needed
3. Add tests in `tests/pubsub.test.ts`
4. Update README.md if public API changes
5. Bump version in `deno.json`
6. Run `deno task npm:build` to verify NPM build

### Publishing
1. Ensure tests pass: `deno test`
2. Update version in `deno.json`
3. Commit and tag: `git tag v{version}`
4. Push: `git push && git push --tags`
5. Publish: `deno task npm:publish`
