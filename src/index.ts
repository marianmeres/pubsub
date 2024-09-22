export const createPubSub = () => {
	const _subs = new Map();
	const _subsFor = (event: string) => {
		if (!_subs.has(event)) _subs.set(event, new Set());
		return _subs.get(event);
	};

	const publish = (event: string, detail: any) => {
		_subsFor(event).forEach((cb: CallableFunction) => cb(detail));
	};

	const subscribe = (event: string, cb: CallableFunction) => {
		if (!event) {
			throw new TypeError(`Expecting valid event name.`);
		}
		if (typeof cb !== 'function') {
			throw new TypeError(`Expecting valid callback function.`);
		}
		_subsFor(event).add(cb);
		return () => _subsFor(event).delete(cb);
	};

	const unsubscribe = (event: string, cb: CallableFunction) => {
		_subsFor(event).delete(cb);
	};

	const subscribeOnce = (event: string, cb: CallableFunction) => {
		const unsub = subscribe(event, (data: any) => {
			cb(data);
			unsub();
		});
		return unsub;
	};

	const unsubscribeAll = (event: string) => _subs.delete(event);

	return { publish, subscribe, subscribeOnce, unsubscribe, unsubscribeAll };
};
