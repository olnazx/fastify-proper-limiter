'use strict'

/**
 * Module dependencies.
 * @private
 */
const { awaitTo: to } = require('../util');

/**
 * Local constants.
 * @private
 */
const REDIS_CMD_NAME = 'increxpr';

class RedisStore {
  /**
   * Constructor.
   * @param {ioredis} redis ioredis instance
   */
  constructor (redis) {
    if (!redis) {
      throw new Error('`redis` must be an instance of "ioredis".');
    }

    // Define lua script for atomic increment and expire.
    if (!redis[REDIS_CMD_NAME]) {
      redis.defineCommand(
        REDIS_CMD_NAME,

        {
          numberOfKeys: 1,

          lua: `
            local current = redis.call('incr', KEYS[1])

            if tonumber(current) == 1 then
              redis.call('expire', KEYS[1], ARGV[1])
            end

            return current
          `
        }
      );
    }

    /**
     * Redis Client (ioredis).
     * @type {ioredis.Client}
     */
    this._redis = redis;
  }

  /**
   * Increments value by key.
   * @param {String} key Key to increment
   * @param {Integer} ttl Key time-to-live (seconds)
   * @returns {Integer} Current value
   */
  async increment (key, ttl) {
    let [err, current] = await to(this._redis[REDIS_CMD_NAME](key, ttl));

    if (err) {
      throw err;
    }

    return current;
  }
}

module.exports = RedisStore;
module.exports.REDIS_CMD_NAME = REDIS_CMD_NAME;