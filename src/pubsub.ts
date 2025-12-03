/**
 * Callback function that receives published data.
 * For regular subscriptions, receives the published data directly.
 * For wildcard ("*") subscriptions, receives an envelope with `event` and `data` properties.
 * @param detail - The published data (or envelope for wildcard subscriptions)
 */
export type Subscriber = (detail: any) => void;

/**
 * Function returned by subscribe methods to remove the subscription.
 * Can be called multiple times safely (subsequent calls are no-ops).
 * @returns void, or boolean indicating if unsubscription was successful
 */
export type Unsubscriber = () => void | boolean;

/**
 * Custom error handler for subscriber errors.
 * Called when a subscriber throws an error during publish.
 * @param error - The error that was thrown by the subscriber
 * @param topic - The topic that was being published to
 * @param isWildcard - True if the error came from a wildcard ("*") subscriber
 */
export type ErrorHandler = (error: Error, topic: string, isWildcard: boolean) => void;

/**
 * Configuration options for PubSub instance.
 */
export interface PubSubOptions {
	/**
	 * Custom error handler for subscriber errors.
	 * By default, errors are logged to console.error.
	 * Set to `() => {}` for silent mode (errors are caught but not logged).
	 * @default console.error
	 */
	onError?: ErrorHandler;
}

/**
 * A lightweight, type-safe publish-subscribe implementation.
 *
 * Supports topic-based subscriptions with wildcard ("*") support for listening to all events.
 * Subscriber errors are caught and handled without breaking other subscribers.
 * Empty topics are automatically cleaned up when all subscribers are removed.
 *
 * @example
 * ```ts
 * const pubsub = new PubSub();
 * const unsub = pubsub.subscribe('user:login', (data) => console.log(data));
 * pubsub.publish('user:login', { userId: 123 });
 * unsub();
 * ```
 */
export class PubSub {
	#subs = new Map<string, Set<Subscriber>>();
	#onError: ErrorHandler;

	/**
	 * Creates a new PubSub instance.
	 * @param options - Optional configuration options
	 */
	constructor(options?: PubSubOptions) {
		this.#onError = options?.onError ?? this.#defaultErrorHandler;
	}

	#defaultErrorHandler(error: Error, topic: string, isWildcard: boolean): void {
		const prefix = isWildcard ? "wildcard subscriber" : "subscriber";
		console.error(`Error in ${prefix} for topic "${topic}":`, error);
	}

	/**
	 * Publishes data to all subscribers of a topic.
	 *
	 * Subscribers are called synchronously in the order they were added.
	 * If a subscriber throws an error, it is caught and passed to the error handler,
	 * and remaining subscribers continue to execute.
	 *
	 * Wildcard ("*") subscribers also receive the data wrapped in an envelope:
	 * `{ event: string, data: any }`.
	 *
	 * @param topic - The topic/event name to publish to
	 * @param data - Optional data to pass to subscribers
	 * @returns `true` if the topic has direct subscribers, `false` otherwise
	 *
	 * @example
	 * ```ts
	 * pubsub.publish('user:login', { userId: 123 });
	 * pubsub.publish('notification'); // data is optional
	 * ```
	 */
	publish(topic: string, data?: any): boolean {
		this.#subs.get(topic)?.forEach((cb) => {
			try {
				cb(data);
			} catch (error) {
				this.#onError(error as Error, topic, false);
			}
		});

		// wildcard special case
		if (topic !== "*") {
			// we need to create an envelope here to know what the source event/topic was
			// (using word "event" instead of "topic" here, feels more correct and expected)
			this.#subs.get("*")?.forEach((cb) => {
				try {
					cb({ event: topic, data });
				} catch (error) {
					this.#onError(error as Error, topic, true);
				}
			});
		}

		return this.#subs.has(topic);
	}

	/**
	 * Subscribes a callback to a topic.
	 *
	 * Use the special topic `"*"` to subscribe to all events (wildcard subscription).
	 * Wildcard subscribers receive an envelope: `{ event: string, data: any }`.
	 *
	 * @param topic - The topic/event name to subscribe to, or "*" for all events
	 * @param cb - The callback function to invoke when the topic is published
	 * @returns An unsubscribe function that removes this subscription when called
	 *
	 * @example
	 * ```ts
	 * // Regular subscription
	 * const unsub = pubsub.subscribe('foo', (data) => console.log(data));
	 *
	 * // Wildcard subscription
	 * pubsub.subscribe('*', ({ event, data }) => console.log(event, data));
	 *
	 * // Unsubscribe
	 * unsub();
	 * ```
	 */
	subscribe(topic: string, cb: Subscriber): Unsubscriber {
		if (!this.#subs.has(topic)) {
			this.#subs.set(topic, new Set<Subscriber>());
		}

		this.#subs.get(topic)!.add(cb);

		return () => this.unsubscribe(topic, cb);
	}

	/**
	 * Unsubscribes a specific callback from a topic.
	 *
	 * If no callback is provided, all subscribers for the topic are removed.
	 * Empty topics are automatically cleaned up after the last subscriber is removed.
	 *
	 * @param topic - The topic to unsubscribe from
	 * @param cb - Optional specific callback to remove. If omitted, all subscribers are removed.
	 * @returns `true` if the callback was found and removed, `false` otherwise
	 *
	 * @example
	 * ```ts
	 * // Unsubscribe specific callback
	 * pubsub.unsubscribe('foo', myCallback);
	 *
	 * // Unsubscribe all from topic
	 * pubsub.unsubscribe('foo');
	 * ```
	 */
	unsubscribe(topic: string, cb?: Subscriber): boolean {
		if (!this.#subs.has(topic)) return false;

		const subscribers = this.#subs.get(topic);
		let removed = true;

		if (typeof cb === "function") {
			removed = subscribers!.delete(cb);
			// Clean up empty topics
			if (subscribers?.size === 0) {
				this.#subs.delete(topic);
			}
		} else {
			this.#subs.delete(topic);
		}

		return removed;
	}

	/**
	 * Subscribes to a topic for only the first published event.
	 *
	 * The subscription is automatically removed after the callback is invoked once.
	 * The callback is unsubscribed even if it throws an error.
	 *
	 * @param topic - The topic/event name to subscribe to
	 * @param cb - The callback function to invoke once
	 * @returns An unsubscribe function that can be used to cancel before the event fires
	 *
	 * @example
	 * ```ts
	 * pubsub.subscribeOnce('init', (data) => {
	 *   console.log('Initialized:', data);
	 * });
	 *
	 * pubsub.publish('init', { ready: true }); // logs once
	 * pubsub.publish('init', { ready: true }); // no effect
	 * ```
	 */
	subscribeOnce(topic: string, cb: Subscriber): Unsubscriber {
		const onceWrapper = (data: any) => {
			try {
				cb(data);
			} finally {
				// Always unsubscribe, even if the callback throws
				this.unsubscribe(topic, onceWrapper);
			}
		};
		return this.subscribe(topic, onceWrapper);
	}

	/**
	 * Unsubscribes all callbacks from a specific topic, or from all topics.
	 *
	 * @param topic - Optional topic to clear. If omitted, all topics are cleared.
	 * @returns `true` if any subscriptions were removed, `false` if the topic didn't exist
	 *
	 * @example
	 * ```ts
	 * // Clear all subscribers from a specific topic
	 * pubsub.unsubscribeAll('foo');
	 *
	 * // Clear all subscribers from all topics
	 * pubsub.unsubscribeAll();
	 * ```
	 */
	unsubscribeAll(topic?: string): boolean {
		// If topic is provided, clear only that topic
		if (topic) {
			if (!this.#subs.has(topic)) {
				return false;
			}
			this.#subs.delete(topic);
			return true;
		}

		// Otherwise, clear all topics
		this.#subs.clear();
		return true;
	}

	/**
	 * Checks if a callback is subscribed to a topic.
	 *
	 * By default, also considers wildcard ("*") subscriptions. A callback subscribed
	 * to "*" is considered subscribed to all topics.
	 *
	 * @param topic - The topic to check
	 * @param cb - The callback to look for
	 * @param considerWildcard - Whether to include wildcard subscriptions in the check (default: true)
	 * @returns `true` if the callback is subscribed to the topic, `false` otherwise
	 *
	 * @example
	 * ```ts
	 * pubsub.subscribe('*', myCallback);
	 * pubsub.isSubscribed('foo', myCallback);        // true (via wildcard)
	 * pubsub.isSubscribed('foo', myCallback, false); // false (excluding wildcard)
	 * ```
	 */
	isSubscribed(
		topic: string,
		cb: Subscriber,
		considerWildcard = true
	): boolean {
		let has = !!this.#subs.get(topic)?.has(cb);
		if (considerWildcard) {
			has ||= !!this.#subs.get("*")?.has(cb);
		}
		return has;
	}

	/**
	 * Returns a snapshot of all current subscriptions for debugging purposes.
	 *
	 * @returns An object mapping topic names to their subscriber sets
	 * @internal This method is intended for debugging and testing only
	 */
	__dump(): Record<string, Set<Subscriber>> {
		return Object.fromEntries(this.#subs.entries());
	}
}

/**
 * Factory function to create a new PubSub instance.
 *
 * This is a convenience function equivalent to `new PubSub(options)`.
 *
 * @param options - Optional configuration options
 * @returns A new PubSub instance
 *
 * @example
 * ```ts
 * const pubsub = createPubSub();
 *
 * // With custom error handling
 * const pubsub = createPubSub({
 *   onError: (error, topic) => myLogger.error(error, { topic })
 * });
 * ```
 */
export function createPubSub(options?: PubSubOptions): PubSub {
	return new PubSub(options);
}
