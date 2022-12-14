export declare const createPubSub: () => {
    publish: (event: string, detail?: {}) => void;
    subscribe: (event: string, cb: Function) => () => any;
    subscribeOnce: (event: string, cb: Function) => () => any;
    unsubscribeAll: (event: string) => boolean;
};
