'use strict'

/**
 * Module dependencies.
 * @private
 */
const fp = require('fastify-plugin');
const RedisStore = require('./stores/RedisStore');
const { awaitTo: to } = require('./util');

/**
 * Plugin.
 * @param {fastify} fastify fastify instance
 * @param {Object<LimiterConfig>} options
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
       *   @param {Object<LimiterConfig>} limiterConfig
       *   @returns {Any}
       */
      errorResponseGenerator: (request, limiterConfig) => {
        return {
          error: 'Too Many Requests',
          message: 'Rate limit exceeded for this route. Try again later.',
          statusCode: 403
        }
      },

      /**
       * Allows to ignore rate limiting per request for the current route.
       * @type {Function}
       *   @param {fastify.Request} request
       *   @param {String} storeKey
       *   @returns {Boolean}
       * 
       * * Function should return `true` if rate limiting should be ignored.
       */
      ignore: null,

      /**
       * Maximum number of requests allowed.
       * @type {Integer}
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
       *   @param {Object<RouteConfig>} routeConfig
       *   @returns {String}
       */
      storeKeyGenerator: (request, { method, url }) => `fastify-proper-limiter:${method}:${url}:${request.ip}`
    },

    options
  );

  // Use 'onRoute' hook to inject 'preHandler' for rate limiting.
  fastify.addHook('onRoute', routeOptions => {
    /**
     * Per-route options for limiter.
     * @type {Object}
     */
    const limiterOptions = routeOptions.config && routeOptions.config.limiter;

    // Limiter should be configured per route. If it was not configured,
    // we will not apply rate limiting to the current route.
    if (!limiterOptions) {
      return;
    }

    if (typeof limiterOptions !== 'object') {
      throw new TypeError('`config.limiter` should be an object.');
    }

    /**
     * Final limiter config.
     * @type {Object}
     */
    const config = Object.assign({ ...globalOptions }, limiterOptions);

    if (typeof errorResponseGenerator !== 'function') {
      throw new TypeError('`limiter.errorResponseGenerator` should be a function.');
    }

    if (
      config.ignore &&
      typeof config.ignore !== 'function'
    ) {
      throw new TyprError('`limiter.ignore` should be a function.');
    }

    if (typeof config.max !== 'number') {
      throw new TypeError('`limiter.max` should be a number.');
    }

    if (typeof config.per !== 'number') {
      throw new TypeError('`limiter.per` should be a number.');
    }

    if (!config.store) {
      throw new Error('`limiter.store` is required.');
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
 * @param {Object<LimiterConfig>} config Limiter config
 * @param {Object<RouteConfig>} routeConfig
 * @returns {AsyncFunction}
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
    if (
      config.ignore &&
      config.ignore(request, storeKey)
    ) {
      return;
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

    // Limit is not reached yet.
    if (current <= config.max) {
      return;
    }

    // Route error to the fastify error handler.
    throw config.errorResponseGenerator(request, config);
  }
}

// Plugin.
module.exports = fp(properLimiterPlugin, {
  fastify: '>=2.12.x',
  name: 'fastify-proper-limiter'
});

// Stores.
module.exports.RedisStore = RedisStore;