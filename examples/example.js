'use strict'

/**
 * Module dependencies.
 * @private
 */
const Redis = require('ioredis');
const fastify = require('fastify');
const fastifyProperLimiter = require('../src/plugin');

const server = fastify();
const redisClient = new Redis();

// RedisStore for the limiter.
const redisStore = new fastifyProperLimiter.RedisStore(redisClient);

server.register(
  fastifyProperLimiter,

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

server.get(
  '/not-limited',

  (request, reply) => {
    reply.send({ hello: 'world', requests_to_this_route: 'are not limited' });
  }
);

server.get(
  '/limited-default',

  {
    config: {
      limiter: {}
    }
  },

  (request, reply) => {
    reply.send({ hello: 'world', default_limiter_settings: 'are used' });
  }
);

server.get(
  '/basic',

  {
    config: {
      limiter: {
        max: 3,
        per: 60
      }
    }
  },

  (request, reply) => {
    reply.send({ hello: 'world', limit: '3 req/minute' });
  }
);

server.get(
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

  (request, reply) => {
    reply.send({ hello: 'world', limit: '10 req/minute' });
  }
);

server.get(
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

  (request, reply) => {
    reply.send({ hello: 'world', custom_error: true });
  }
);

server.listen(3000, error => {
  if (error) {
    throw error;
  }

  console.log('Server is listening at http://localhost:3000');
});