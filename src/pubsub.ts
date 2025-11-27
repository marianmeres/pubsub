/** The subscribe callback */
export type Subscriber = (detail: any) => void;

/** The unsubscribe callback */
export type Unsubscriber = () => void | boolean;

/** Error handler callback */
export type ErrorHandler = (error: Error, topic: string, isWildcard: boolean) => void;

/** PubSub configuration options */
export interface PubSubOptions {
	/** Custom error handler for subscriber errors. Defaults to console.error. Set to () => {} for silent mode. */
	onError?: ErrorHandler;
}

/**
 * Basic publish-subscribe.
 *
 * "topic" and "event" are considered as synonyms.
 */
export class PubSub {
	#subs = new Map<string, Set<Subscriber>>();
	#onError: ErrorHandler;

	constructor(options?: PubSubOptions) {
		this.#onError = options?.onError ?? this.#defaultErrorHandler;
	}

	#defaultErrorHandler(error: Error, topic: string, isWildcard: boolean): void {
		const prefix = isWildcard ? "wildcard subscriber" : "subscriber";
		console.error(`Error in ${prefix} for topic "${topic}":`, error);
	}

	/** Publish an event with optional data to all subscribers of a topic */
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

	/** Subscribe to a topic */
	subscribe(topic: string, cb: Subscriber): Unsubscriber {
		if (!this.#subs.has(topic)) {
			this.#subs.set(topic, new Set<Subscriber>());
		}

		this.#subs.get(topic)!.add(cb);

		return () => this.unsubscribe(topic, cb);
	}

	/** Unsubscribe given subscriber from a topic.
	 * If not subscriber is given, unsubscribe all from given topic. */
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

	/** Subscribe to a topic only for the first published topic */
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

	/** Unsubscribe all callbacks from a specific topic.
	 * If no topic is provided, unsubscribe from all topics. */
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

	/** Will check if give topic+cb exists */
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

	/** For debugging */
	__dump(): Record<string, Set<Subscriber>> {
		return Object.fromEntries(this.#subs.entries());
	}
}

/** Export factory fn for convenience as well */
export function createPubSub(options?: PubSubOptions): PubSub {
	return new PubSub(options);
}
