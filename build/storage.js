import Keyv from 'keyv';
import { KeyvFile } from 'keyv-file';
import * as sha512 from "hash.js/lib/hash/sha/512.js";
import * as path from "path";
import { DATA_PATH, KEYV_BACKEND, KEYV_URL } from './env.js';
/**
 * A storage provider that uses the disk to store information.
 * @category Storage providers
 */
export class KeyvStorageProvider {
    /**
     * Creates a new simple file system storage provider.
     * @param {Keyv} keyvStore A Keyv instance for storing data.
     */
    constructor(namespace, trackTransactionsInMemory = true, maxInMemoryTransactions = 20) {
        this.trackTransactionsInMemory = trackTransactionsInMemory;
        this.maxInMemoryTransactions = maxInMemoryTransactions;
        this.completedTransactions = [];
        if (KEYV_BACKEND === 'file') {
            this.db = new Keyv({ store: new KeyvFile({ filename: path.join(DATA_PATH, `${namespace}.json`), }) });
        }
        else {
            this.db = new Keyv(KEYV_URL, { namespace: namespace });
        }
        this.db.set('syncToken', null);
        this.db.set('filter', null);
        this.db.set('appserviceUsers', {}); // userIdHash => { data }
        this.db.set('appserviceTransactions', {}); // txnIdHash => { data }
        this.db.set('kvStore', {}); // key => value (str)
    }
    setSyncToken(token) {
        this.db.set('syncToken', token);
    }
    getSyncToken() {
        return this.db.get('syncToken');
    }
    setFilter(filter) {
        this.db.set('filter', filter);
    }
    getFilter() {
        return this.db.get('filter');
    }
    addRegisteredUser(userId) {
        const key = sha512().update(userId).digest('hex');
        this.db.set(`appserviceUsers.${key}.userId`, userId);
        this.db.set(`appserviceUsers.${key}.registered`, true);
    }
    isUserRegistered(userId) {
        const key = sha512().update(userId).digest('hex');
        return this.db.get(`appserviceUsers.${key}.registered`);
    }
    isTransactionCompleted(transactionId) {
        if (this.trackTransactionsInMemory) {
            return this.completedTransactions.indexOf(transactionId) !== -1;
        }
        const key = sha512().update(transactionId).digest('hex');
        return this.db.get(`appserviceTransactions.${key}.completed`);
    }
    setTransactionCompleted(transactionId) {
        if (this.trackTransactionsInMemory) {
            if (this.completedTransactions.indexOf(transactionId) === -1) {
                this.completedTransactions.push(transactionId);
            }
            if (this.completedTransactions.length > this.maxInMemoryTransactions) {
                this.completedTransactions = this.completedTransactions.reverse().slice(0, this.maxInMemoryTransactions).reverse();
            }
            return;
        }
        const key = sha512().update(transactionId).digest('hex');
        this.db.set(`appserviceTransactions.${key}.txnId`, transactionId);
        this.db.set(`appserviceTransactions.${key}.completed`, true);
    }
    readValue(key) {
        return this.db.get(key);
    }
    storeValue(key, value) {
        this.db.set(key, value);
    }
    storageForUser(userId) {
        return new NamespacedKeyvProvider(userId, this);
    }
}
/**
 * A namespaced storage provider that uses the disk to store information.
 * @category Storage providers
 */
class NamespacedKeyvProvider {
    constructor(prefix, parent) {
        this.prefix = prefix;
        this.parent = parent;
    }
    setFilter(filter) {
        return this.parent.storeValue(`${this.prefix}_int_filter`, JSON.stringify(filter));
    }
    getFilter() {
        return Promise.resolve(this.parent.readValue(`${this.prefix}_int_filter`)).then(r => r ? JSON.parse(r) : r);
    }
    setSyncToken(token) {
        return this.parent.storeValue(`${this.prefix}_int_syncToken`, token || "");
    }
    getSyncToken() {
        return Promise.resolve(this.parent.readValue(`${this.prefix}_int_syncToken`)).then(r => r ?? null);
    }
    readValue(key) {
        return this.parent.readValue(`${this.prefix}_kv_${key}`);
    }
    storeValue(key, value) {
        return this.parent.storeValue(`${this.prefix}_kv_${key}`, value);
    }
}
