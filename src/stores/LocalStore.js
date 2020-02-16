'use strict'

class LocalStore {
  /**
   * Constructor.
   * @param {Integer} [max=5000] Cache maximum size
   */
  constructor (max = 5000) {
    this._max = max;

    /**
     * Current size of cache.
     * @type {Integer}
     */
    this._size = 0;

    /**
     * Cache.
     * @type {Map}
     */
    this._cache = new Map();
    this._oldCache = new Map();
  }

  /**
   * Returns an item from a cache.
   * @param {String} key
   * @returns {Any}
   */
  _get (key) {
    if (this._cache.has(key)) {
      return this._cache.get(key);
    }

    if (this._oldCache.has(key)) {
      const value = this._oldCache.get(key);

      this._oldCache.delete(key);
      this._set(key, value);

      return value;
    }
  }

  /**
   * Puts an item into a cache.
   * @param {String} key
   * @param {Any} value
   * @returns {void}
   */
  _set (key, value) {
    if (this._cache.has(key)) {
      this._cache.set(key, value);

      return;
    }

    this._cache.set(key, value);
    this._size++;

    if (this._size >= this._max) {
      this._size = 0;
      this._oldCache = this._cache;
      this._cache = new Map();
    }
  }

  /**
   * Increments value by key.
   * @param {String} key Key to increment
   * @param {Integer} ttl Key time-to-live (seconds)
   * @returns {Integer} Current value
   */
  async increment (key, ttl) {
    let counter = this._get(key);

    if (
      !counter ||
      (now - counter.createdAt) >= ttl * 1000
    ) {
      counter = {
        value: 1,
        createdAt: Date.now()
      }

      this._set(key, counter);
    } else {
      counter.value += 1;
    }

    return counter.value;
  }
}

module.exports = LocalStore;