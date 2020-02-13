'use strict'

/**
 * Module dependencies.
 * @private
 */
const Redis = require('ioredis');
const fastify = require('fastify')();
const limiter = require('../src/plugin');

const redisClient = new Redis();

// Redis Store for the limiter.
const redisStore = new limiter.RedisStore(redisClient);

fastify.register(
  limiter,

  {
    // Ignore limiter if user is an admin (pseudo example).
    ignore: async function (request, storeKey) {
      const user = { isAdmin: true }; // await UserModel.findById(request.user.id);

      if (user.isAdmin) {
        return true;
      }

      return false;
    },

    skipOnError: true,
    store: redisStore,

    storeKeyGenerator: (request, routeConfig) => {
      return `limited-request:${routeConfig.method}:${routeConfig.url}:${request.ip}`;
    }
  }
);

fastify.get(
  '/not-limited',

  async (request, reply) => {
    return {
      hello: 'world',
      requests_to_this_route: 'are not limited'
    }
  }
);

fastify.get(
  '/limited-default',

  {
    config: {
      limiter: {}
    }
  },

  async (request, reply) => {
    return {
      hello: 'world',
      default_limiter_settings: 'are used'
    }
  }
);

fastify.get(
  '/basic',

  {
    config: {
      limiter: {
        max: 3,
        per: 60
      }
    }
  },

  async (request, reply) => {
    return {
      hello: 'world',
      limit: '3 requests / 1 minute'
    }
  }
);

fastify.get(
  '/local-ignore',

  {
    config: {
      limiter: {
        max: 10,
        per: 60,

        // Override global 'ignore' function.
        ignore: request => {
          if (request.ip === '127.0.0.1') {
            return true;
          }

          return false;
        }
      }
    }
  },

  async (request, reply) => {
    return {
      hello: 'world',
      limit: '10 req/minute'
    }
  }
);

fastify.get(
  '/custom-error',

  {
    config: {
      limiter: {
        max: 2,
        per: 10,

        errorResponseGenerator: (request, context) => {
          let err = new Error(`Rate limit for "${context.method} ${context.url}" exceeded (${context.max} requests per ${context.per} seconds allowed).`);

          err.statusCode = 403;

          return err;
        }
      }
    }
  },

  async (request, reply) => {
    return {
      hello: 'world',
      custom_error: true
    }
  }
);

fastify.listen(3000, error => {
  if (error) {
    throw error;
  }

  console.log('Server is listening at http://localhost:3000/');
});