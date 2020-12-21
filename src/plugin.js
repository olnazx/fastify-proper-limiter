'use strict'

/**
 * Module dependencies.
 * @private
 */
const util = require('util');
const fp = require('fastify-plugin');
const LocalStore = require('./stores/LocalStore');
const RedisStore = require('./stores/RedisStore');
const { awaitTo: to } = require('./util');

/**
 * Plugin.
 * @param {fastify} fastify fastify instance
 * @param {Object} options
 *   @property {Function} errorResponseGenerator
 *   @property {Function|AsyncFunction} ignore
 *   @property {Integer|Function|AsyncFunction} max
 *   @property {Integer} per
 *   @property {Boolean} skipOnError
 *   @property {Store} store
 *   @property {Function} storeKeyGenerator
 * @returns {void}
 */
async function properLimiterPlugin (fastify, options) {
  /**
   * Global options.
   * @type {Object}
   */
  const globalOptions = Object.assign(
    {
      /**
       * Error response generator.
       * @type {Function}
       *   @param {fastify.Request} request
       *   @param {Object} context
       *     @property {Integer} max
       *     @property {Integer} per
       *     @property {String} method
       *     @property {String} url
       *   @returns {Any}
       */
      errorResponseGenerator: (request, context) => {
        let error = new Error('Rate limit exceeded for this route. Try again later.');

        error.error = 'Too Many Requests';
        error.statusCode = 403;

        return error;
      },

      /**
       * Allows to ignore rate limiting per request for the current route.
       * @type {Function|AsyncFunction}
       *   @param {fastify.Request} request
       *   @param {String} storeKey
       *   @returns {Boolean}
       * 
       * * Function should return `true` if rate limiting should be ignored.
       */
      ignore: null,

      /**
       * Maximum number of requests allowed.
       * @type {Integer|Function|AsyncFunction}
       *   @param {fastify.Request} request
       *   @param {String} storeKey
       *   @returns {Integer}
       */
      max: 300,

      /**
       * Time window (seconds).
       * @type {Integer}
       */
      per: 60,

      /**
       * Ignore limiter if an error occurred.
       * @type {Boolean}
       */
      skipOnError: false,

      /**
       * Store.
       * @type {Store}
       */
      store: null,

      /**
       * Store key generator.
       * @type {Function}
       *   @param {fastify.Request} request
       *   @param {Object} routeConfig
       *     @property {String} method
       *     @property {String} url
       *   @returns {String}
       */
      storeKeyGenerator: (request, { method, url }) => `fastify-proper-limiter:${method}:${url}:${request.ip}`
    },

    options
  );

  if (!globalOptions.store) {
    globalOptions.store = new LocalStore();
  }

  // Use 'onRoute' hook to inject 'preHandler' for rate limiting.
  fastify.addHook('onRoute', routeOptions => {
    /**
     * Per-route options for limiter.
     * @type {Object|Boolean}
     */
    const limiterOptions = routeOptions.config && routeOptions.config.limiter;

    // Limiter should be configured per route. If it was not configured,
    // we will not apply rate limiting to the current route.
    if (!limiterOptions) {
      return;
    }

    if (
      typeof limiterOptions !== 'object' &&
      typeof limiterOptions !== 'boolean'
    ) {
      throw new TypeError('`config.limiter` should be an object or a boolean.');
    }

    /**
     * Final limiter config.
     * @type {Object}
     */
    const config = Object.assign({ ...globalOptions }, limiterOptions);

    if (!config.store) {
      throw new Error('`limiter.store` is required.');
    }

    if (typeof config.errorResponseGenerator !== 'function') {
      throw new TypeError('`limiter.errorResponseGenerator` should be a function.');
    }

    if (
      config.ignore &&
      typeof config.ignore !== 'function'
    ) {
      throw new TypeError('`limiter.ignore` should be a function.');
    }

    if (
      typeof config.max !== 'number' &&
      typeof config.max !== 'function'
    ) {
      throw new TypeError('`limiter.max` should be a number or a function.');
    }

    if (typeof config.per !== 'number') {
      throw new TypeError('`limiter.per` should be a number.');
    }

    if (typeof config.storeKeyGenerator !== 'function') {
      throw new TypeError('`limiter.storeKeyGenerator` should be a function.');
    }

    /**
     * Rate limiter preHandler.
     * @type {AsyncFunction}
     */
    const limiterPreHandler = properLimiterPreHandlerFactory(
      config,

      {
        method: routeOptions.method,
        url: routeOptions.url
      }
    );

    // Add a rate limiter preHandler.
    if (Array.isArray(routeOptions.preHandler)) {
      routeOptions.preHandler.push(limiterPreHandler);
    } else if (typeof routeOptions.preHandler === 'function') {
      routeOptions.preHandler = [routeOptions.preHandler, limiterPreHandler];
    } else {
      routeOptions.preHandler = [limiterPreHandler];
    }
  });
}

/**
 * Limiter preHandler function factory.
 * @param {Object} config Limiter final config
 *   @property {Function} errorResponseGenerator
 *   @property {Function|AsyncFunction} ignore
 *   @property {Integer|Function|AsyncFunction} max
 *   @property {Integer} per
 *   @property {Boolean} skipOnError
 *   @property {Store} store
 *   @property {Function} storeKeyGenerator
 * @param {Object} routeConfig
 *   @property {String} method
 *   @property {String} url
 * @returns {AsyncFunction}
 * @private
 */
function properLimiterPreHandlerFactory (config, routeConfig) {
  /**
   * Rate limiter preHandler.
   * @param {fastify.Request} request
   * @param {fastify.Reply} reply
   * @returns {void}
   */
  return async function properLimiterPreHandler (request, reply) {
    /**
     * Store key for current request.
     * @type {String}
     */
    const storeKey = config.storeKeyGenerator(request, routeConfig);

    // Support "whitelisting".
    if (config.ignore) {
      let isWhitelisted = config.ignore(request, storeKey);

      if (util.types.isPromise(isWhitelisted)) {
        [, isWhitelisted] = await to(isWhitelisted);
      }

      if (isWhitelisted) {
        return;
      }
    }

    let [
      /**
       * Error, if any.
       * @type {Error}
       */
      err,

      /**
       * Current request number in the time window.
       * @type {Integer}
       */
      current
    ] = await to(config.store.increment(storeKey, config.per));

    if (err) {
      if (config.skipOnError) {
        return;
      }

      throw err;
    }

    /**
     * Max number of allowed requests.
     * @type {Integer}
     */
    let max;

    if (typeof config.max === 'number') {
      max = config.max;
    } else {
      max = config.max(request, storeKey);

      if (util.types.isPromise(max)) {
        [, max] = await to(max);
      }
    }

    // Limit is not reached yet.
    if (current <= max) {
      return;
    }

    // Route error to the fastify error handler.
    throw config.errorResponseGenerator(
      request,

      {
        max,
        per: config.per,

        ...routeConfig
      }
    );
  }
}

// Plugin.
module.exports = fp(properLimiterPlugin, {
  fastify: '>=3',
  name: 'fastify-proper-limiter'
});

// Stores.
module.exports.LocalStore = LocalStore;
module.exports.RedisStore = RedisStore;
