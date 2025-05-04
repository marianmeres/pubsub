// deno-lint-ignore-file no-explicit-any

/** The subscribe callback */
export type Subscriber = (detail: any) => void;

/** The unsubscribe callback */
export type Unsubscriber = () => void;

/**
 * Basic publish-subscribe.
 *
 * "topic" and "event" are considered as synonyms.
 *
 */
export class PubSub {
	#subs = new Map<string, Set<Subscriber>>();

	/** Publish an event with optional data to all subscribers of a topic */
	publish(topic: string, data?: any): boolean {
		if (!this.#subs.has(topic)) return false;

		this.#subs.get(topic)!.forEach((cb) => cb(data));
		return true;
	}

	/** Subscribe to a topic */
	subscribe(topic: string, cb: Subscriber) {
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

	/** Subscribe to a topic only for the first publish event */
	subscribeOnce(topic: string, cb: Subscriber) {
		const onceWrapper = (data: any) => {
			cb(data);
			this.unsubscribe(topic, onceWrapper);
		};
		return this.subscribe(topic, onceWrapper);
	}

	/** Unsubscribe all callbacks from a specific topic.
	 * If no topic is provided, unsubscribe from all topics. */
	unsubscribeAll(topic?: string) {
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
}

/** Export factory fn for convenience as well */
export function createPubSub(): PubSub {
	return new PubSub();
}
