# @marianmeres/pubsub

Basic publish-subscribe.

## Install
```shell
$ npm i @marianmeres/pubsub
```

## Usage

```typescript
const { publish, subscribe, subscribeOnce, unsubscribeAll } = createPubSub();

const unsubscribe = subscribe('foo', (data) => {
	console.log(data);
});

// logs 'bar'
publish('foo', 'bar');
```
