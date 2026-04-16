// Polyfill Symbol.dispose for runtimes that lack ES2024 explicit resource management.
if (typeof (Symbol as any).dispose === "undefined") {
	(Symbol as any).dispose = Symbol.for("Symbol.dispose");
}

/**
 * Default event map. When no generic is supplied to {@link PubSub},
 * any topic may carry any data — preserving the loose, dynamic shape.
 */
export type DefaultEventMap = Record<string, any>;

/**
 * Callback function that receives published data.
 *
 * For regular subscriptions, receives the published data directly.
 * For wildcard ("*") subscriptions, receives a {@link WildcardEnvelope}.
 *
 * The return value is ignored. If the callback returns a Promise (i.e. it is
 * `async`), rejections are routed to the configured error handler just like
 * synchronous throws.
 */
export type Subscriber<TData = any> = (detail: TData) => unknown;

/**
 * Function returned by subscribe methods to remove the subscription.
 *
 * - Idempotent: calling more than once is a safe no-op.
 * - Implements `Symbol.dispose`, so it can be used with the `using` statement.
 */
export interface Unsubscriber {
	(): void;
	[Symbol.dispose](): void;
}

/**
 * Envelope delivered to wildcard ("*") subscribers.
 */
export interface WildcardEnvelope<
	TEvents extends Record<string, any> = DefaultEventMap,
> {
	event: keyof TEvents & string;
	data: TEvents[keyof TEvents];
}

/**
 * Custom error handler for subscriber errors.
 *
 * @param error - The error thrown (or the rejection reason from an async subscriber)
 * @param topic - The topic being published
 * @param isWildcard - true if the failing subscriber was attached to "*"
 */
export type ErrorHandler = (
	error: Error,
	topic: string,
	isWildcard: boolean,
) => void;

/**
 * Configuration options for a {@link PubSub} instance.
 */
export interface PubSubOptions {
	/**
	 * Custom handler for subscriber errors (sync throws and async rejections).
	 * Defaults to logging via `console.error`. Pass `() => {}` for silent mode.
	 */
	onError?: ErrorHandler;
}

/**
 * Reserved topic name used for wildcard subscriptions.
 */
const WILDCARD = "*";

/**
 * Lightweight, type-safe publish-subscribe.
 *
 * - Synchronous, ordered delivery to subscribers (in registration order).
 * - Errors from any subscriber are caught and routed to the error handler;
 *   other subscribers continue to run.
 * - The subscriber list is snapshotted before delivery, so subscribing or
 *   unsubscribing inside a callback never affects the in-flight publish.
 * - Empty topics are removed automatically when their last subscriber unsubscribes.
 * - Wildcard ("*") subscribers receive a {@link WildcardEnvelope}.
 * - Methods are bound in the constructor, so destructuring is safe:
 *   `const { publish, subscribe } = createPubSub();`
 *
 * Optional generic `TEvents` provides typed events:
 * ```ts
 * type Events = { 'user:login': { id: number }; 'tick': number };
 * const ps = createPubSub<Events>();
 * ps.publish('user:login', { id: 1 }); // typed
 * ```
 *
 * @example
 * ```ts
 * const pubsub = createPubSub();
 * using sub = pubsub.subscribe('user:login', (data) => console.log(data));
 * pubsub.publish('user:login', { userId: 123 });
 * // sub is auto-disposed at the end of the enclosing block
 * ```
 */
export class PubSub<TEvents extends Record<string, any> = DefaultEventMap> {
	#subs = new Map<string, Set<Subscriber>>();
	#onError: ErrorHandler;

	constructor(options?: PubSubOptions) {
		this.#onError = options?.onError ?? this.#defaultErrorHandler;

		// Bind public methods so destructuring is safe.
		this.publish = this.publish.bind(this);
		this.subscribe = this.subscribe.bind(this);
		this.subscribeOnce = this.subscribeOnce.bind(this);
		this.subscribeMany = this.subscribeMany.bind(this);
		this.unsubscribe = this.unsubscribe.bind(this);
		this.unsubscribeAll = this.unsubscribeAll.bind(this);
		this.isSubscribed = this.isSubscribed.bind(this);
		this.subscriberCount = this.subscriberCount.bind(this);
		this.hasSubscribers = this.hasSubscribers.bind(this);
		this.topics = this.topics.bind(this);
	}

	#defaultErrorHandler(error: Error, topic: string, isWildcard: boolean): void {
		const prefix = isWildcard ? "wildcard subscriber" : "subscriber";
		console.error(`Error in ${prefix} for topic "${topic}":`, error);
	}

	#invoke(cb: Subscriber, data: any, topic: string, isWildcard: boolean): void {
		try {
			const result = cb(data);
			if (result && typeof (result as Promise<void>).then === "function") {
				(result as Promise<void>).catch((reason) => {
					const err = reason instanceof Error
						? reason
						: new Error(String(reason));
					this.#onError(err, topic, isWildcard);
				});
			}
		} catch (error) {
			this.#onError(error as Error, topic, isWildcard);
		}
	}

	#makeUnsubscriber(fn: () => void): Unsubscriber {
		const u = (() => fn()) as Unsubscriber;
		(u as any)[Symbol.dispose] = fn;
		return u;
	}

	/**
	 * Publishes data to all subscribers of `topic`, plus any wildcard ("*")
	 * subscribers (which receive a {@link WildcardEnvelope}).
	 *
	 * @returns true if `topic` had any direct subscribers, false otherwise.
	 *          (Wildcard subscribers do not affect this return value.)
	 * @throws if `topic === "*"` — the wildcard is reserved for subscribers.
	 */
	publish<K extends keyof TEvents & string>(topic: K, data: TEvents[K]): boolean;
	publish(topic: string, data?: any): boolean;
	publish(topic: string, data?: any): boolean {
		if (topic === WILDCARD) {
			throw new Error(
				`Cannot publish to wildcard topic "*". "*" is reserved for subscribers; publish to a real topic name instead.`,
			);
		}

		// Snapshot before iteration: subscribe/unsubscribe inside a callback
		// must not affect the in-flight publish.
		const direct = this.#subs.get(topic);
		const hadDirect = !!direct && direct.size > 0;
		if (direct) {
			for (const cb of [...direct]) {
				this.#invoke(cb, data, topic, false);
			}
		}

		const wildcards = this.#subs.get(WILDCARD);
		if (wildcards && wildcards.size > 0) {
			const envelope: WildcardEnvelope<TEvents> = {
				event: topic as keyof TEvents & string,
				data,
			};
			for (const cb of [...wildcards]) {
				this.#invoke(cb, envelope, topic, true);
			}
		}

		return hadDirect;
	}

	/**
	 * Subscribes a callback to a topic. Use `"*"` to receive every published event
	 * as a {@link WildcardEnvelope}.
	 *
	 * @returns An idempotent unsubscriber. Implements `Symbol.dispose` for `using`.
	 */
	subscribe<K extends keyof TEvents & string>(
		topic: K,
		cb: Subscriber<TEvents[K]>,
	): Unsubscriber;
	subscribe(
		topic: "*",
		cb: Subscriber<WildcardEnvelope<TEvents>>,
	): Unsubscriber;
	subscribe(topic: string, cb: Subscriber): Unsubscriber;
	subscribe(topic: string, cb: Subscriber): Unsubscriber {
		let bucket = this.#subs.get(topic);
		if (!bucket) {
			bucket = new Set<Subscriber>();
			this.#subs.set(topic, bucket);
		}
		bucket.add(cb);

		return this.#makeUnsubscriber(() => {
			this.unsubscribe(topic, cb);
		});
	}

	/**
	 * Subscribes for exactly one delivery, then auto-unsubscribes.
	 *
	 * The unsubscribe happens *before* the user callback runs, so re-entrant
	 * publishes from within the callback can never re-trigger this subscription.
	 * Errors from the callback are routed to the error handler as usual.
	 */
	subscribeOnce<K extends keyof TEvents & string>(
		topic: K,
		cb: Subscriber<TEvents[K]>,
	): Unsubscriber;
	subscribeOnce(
		topic: "*",
		cb: Subscriber<WildcardEnvelope<TEvents>>,
	): Unsubscriber;
	subscribeOnce(topic: string, cb: Subscriber): Unsubscriber;
	subscribeOnce(topic: string, cb: Subscriber): Unsubscriber {
		let fired = false;
		const onceWrapper: Subscriber = (data: any) => {
			if (fired) return;
			fired = true;
			// Unsubscribe BEFORE invoking — guards against re-entrant publishes.
			this.unsubscribe(topic, onceWrapper);
			return cb(data);
		};
		return this.subscribe(topic, onceWrapper);
	}

	/**
	 * Subscribes a single callback to multiple topics at once.
	 * The returned unsubscriber removes all of them.
	 */
	subscribeMany<K extends keyof TEvents & string>(
		topics: K[],
		cb: Subscriber<TEvents[K]>,
	): Unsubscriber;
	subscribeMany(topics: string[], cb: Subscriber): Unsubscriber;
	subscribeMany(topics: string[], cb: Subscriber): Unsubscriber {
		const unsubs = topics.map((t) => this.subscribe(t, cb));
		return this.#makeUnsubscriber(() => {
			for (const u of unsubs) u();
		});
	}

	/**
	 * Removes a specific callback from a topic, or — if `cb` is omitted —
	 * removes every subscriber from the topic. Empty topics are cleaned up.
	 *
	 * @returns true if anything was removed.
	 */
	unsubscribe(topic: string, cb?: Subscriber): boolean {
		const bucket = this.#subs.get(topic);
		if (!bucket) return false;

		if (typeof cb === "function") {
			const removed = bucket.delete(cb);
			if (bucket.size === 0) this.#subs.delete(topic);
			return removed;
		}

		return this.#subs.delete(topic);
	}

	/**
	 * Removes every subscriber for `topic`, or — if `topic` is omitted —
	 * every subscriber from every topic.
	 *
	 * @returns true if anything was removed.
	 */
	unsubscribeAll(topic?: string): boolean {
		if (topic !== undefined) return this.#subs.delete(topic);
		if (this.#subs.size === 0) return false;
		this.#subs.clear();
		return true;
	}

	/**
	 * Checks whether `cb` is subscribed to `topic`. By default also reports true
	 * if `cb` is subscribed to the wildcard ("*"). Pass `considerWildcard: false`
	 * to require an exact, direct subscription.
	 */
	isSubscribed(
		topic: string,
		cb: Subscriber,
		considerWildcard = true,
	): boolean {
		if (this.#subs.get(topic)?.has(cb)) return true;
		if (considerWildcard && this.#subs.get(WILDCARD)?.has(cb)) return true;
		return false;
	}

	/**
	 * Returns the subscriber count for `topic`, or — if `topic` is omitted —
	 * the total count across all topics (including wildcard).
	 */
	subscriberCount(topic?: string): number {
		if (topic !== undefined) return this.#subs.get(topic)?.size ?? 0;
		let total = 0;
		for (const set of this.#subs.values()) total += set.size;
		return total;
	}

	/**
	 * Returns true if `topic` has at least one direct subscriber.
	 * (Does not consider wildcard subscribers.)
	 */
	hasSubscribers(topic: string): boolean {
		return (this.#subs.get(topic)?.size ?? 0) > 0;
	}

	/**
	 * Lists topics that currently have at least one subscriber. Includes "*"
	 * if there are wildcard subscribers.
	 */
	topics(): string[] {
		return [...this.#subs.keys()];
	}

	/**
	 * Returns a defensive snapshot of internal subscriptions for debugging.
	 * Mutating the returned object does not affect the instance.
	 *
	 * @internal Intended for debugging and tests only.
	 */
	__dump(): Record<string, Set<Subscriber>> {
		const out: Record<string, Set<Subscriber>> = {};
		for (const [topic, set] of this.#subs.entries()) {
			out[topic] = new Set(set);
		}
		return out;
	}
}

/**
 * Convenience factory equivalent to `new PubSub<TEvents>(options)`.
 */
export function createPubSub<
	TEvents extends Record<string, any> = DefaultEventMap,
>(options?: PubSubOptions): PubSub<TEvents> {
	return new PubSub<TEvents>(options);
}
