# @marianmeres/pubsub

Basic publish-subscribe.

## Install
```sh
deno add jsr:@marianmeres/pubsub
```
```sh
npm install @marianmeres/pubsub
```

## Usage

```js
import { createPubSub } from '@marianmeres/pubsub';
```

```js
const { publish, subscribe, subscribeOnce, unsubscribe, unsubscribeAll } = createPubSub();

// create subscription (returns unsub function)
const unsub = subscribe('foo', console.log);

// publish
publish('foo', 'bar'); // logs 'bar'

// unsubscribe
unsub();

// or more general alternatives to above
unsubscribe('foo', console.log);
unsubscribeAll('foo');

// now this is a no-op as no subscription exists
publish('foo', 'baz');
```
