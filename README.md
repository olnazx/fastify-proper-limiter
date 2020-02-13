> Enhanced version of [fastify-rate-limit](https://github.com/fastify/fastify-rate-limit).

Rate limiter for Fastify `2.x`.

## Installation

```
npm i gitlab:olnazx/fastify-proper-limiter
```

## Example

Minimal example of rate limiting requests using Redis as a storage of temporary data.

```js
const fastify = require('fastify')();
const limiter = require('fastify-proper-limiter');
const Redis = require('ioredis');

const redisClient = new Redis();

fastify.register(limiter, {
  // Limiter does not provide a default Store.
  // You should explicitly set it.
  store: new limiter.RedisStore(redisClient)
});

fasitfy.route({
  url: '/',

  // Limiting should be configured for each route individually.
  // There is no "global" mode.
  config: {
    limiter: {
      // Allow 10 requests per 60 seconds.
      max: 10,
      per: 60
    }
  },

  handler: async (request, reply) => {
    return {
      hello: 'world'
    }
  }
});

fastify.listen(3000, error => {
  // All errors occurred during limiter configuration will be thrown here.
  if (error) {
    throw error;
  }

  console.log('Server is listening at http://localhost:3000/');
});
```

If a client reaches the maximum number of allowed requests, the `403 Forbidden` error will be thrown. This behaviour can be customized.

## Usage

**Plugin has *global* mode, so limiter has to be configured for each route individually.** See example below.

```js
const fastify = require('fastify')();
const limiter = require('fastify-proper-limiter');
const Redis = require('ioredis');

const redisClient = new Redis();

fastify.register(limiter, {
  max: 1,
  per: 1,
  skipOnError: true,
  store: new limiter.RedisStore(redisClient)
});

// Rate limiting won't happen because limiter config is missing
// from route options.
fastify.get(
  '/unlimited',

  async (request, reply) => {
    return {
      hello: 'world',
      limit: 'unlimited'
    }
  }
);

// This route will be rate limited.
// Global `max` and `per` will be overrided.
fastify.route({
  url: '/limited',

  config: {
    limiter: {
      max: 10,
      per: 60
    }
  },

  handler: async (request, reply) => {
    return {
      hello: 'world',
      limit: '10 requests / 1 minute'
    }
  }
});

// This route will be rate limited as well.
// Global parameters will be used.
fastify.route({
  url: '/limited-2',

  config: {
    limiter: {}
  },

  handler: async (request, reply) => {
    return {
      hello: 'world',
      limit: '1 request / 1 second'
    }
  }
});

fastify.listen(3000, error => {
  if (error) {
    throw error;
  }

  console.log('Server is listening at http://localhost:3000/');
});
```

Plugin uses Fastify's `onRoute` hook to inject `preHandler` function where rate limiting happens.

### Plugin Options

Globally defined options will be overrided with the local ones (`config.limiter`).

#### `store` (required)

* Default: `null`
* `Store`: [Custom Store](#custom-store)

#### `errorResponseGenerator`

* Default: `Function` [[Source Code ↗]](src/plugin.js#L43)
* `Function`: Custom function that takes two arguments (`request` and `context`) and should return an instance of Error.

  ```js
  /**
   * @param {Fastify.Request} request
   * @param {Object} context
   *   @property {Integer} max Max. number of requests allowed for the current route
   *   @property {Integer} per Time frame
   *   @property {String} url URL of the current route (at the moment of registering route)
   *   @property {String} method Method of the current route
   * @returns {Error}
   */
  function errorResponseGenerator (request, context) {
    let err = new Error('Rate limit exceeded.');

    err.statusCode = 429;

    // It is recommended (but not required) to return an
    // instance of Error, so Fastify can recognize this
    // object as Error and route it to the custom error
    // handler (fastify.setErrorHandler).
    return err;
  }
  ```

#### `ignore`

* Default: `null`
* `Function`: Custom function (can be also an async function) that takes two arguments (`request` and `storeKey`) and should return a Boolean.

  ```js
  /**
   * @param {Fastify.Request} request
   * @param {String} storeKey
   * @returns {Boolean}
   */
  function ignore (request, storeKey) {
    if (request.headers['x-ignore-limiter'] !== undefined) {
      return true;
    }

    return false;
  }
  ```

#### `max`

* Default: `300`
* `Number`: Maximum number of allowed requests per time frame.

#### `per`

* Default: `60`
* `Number`: Time frame (in seconds).

#### `skipOnError`

* Default: `false`
* `Boolean`: Set to `true` if you want to skip limiter when Store returns an error.

#### `storeKeyGenerator`

* Default: `Function` [[Source Code ↗]](src/plugin.js#L96)
* `Function`: Custom function that takes two arguments (`request` and `routeConfig`) and should return a String.

  ```js
  /**
   * @param {Fastify.Request} request
   * @param {Object} routeConfig
   *   @property {String} method
   *   @property {String} url
   * @returns {String}
   */
  function storeKeyGenerator (request, routeConfig) {
    // Make sure that key includes route method and URL so it will be differentiated from other routes.
    return `custom-store-key:${routeConfig.method}${routeConfig.url}:${request.ip}`;
  }
  ```

### Custom Store

You can use built-in Redis Store as shown in the exmaple above or use your own implementation.

Store Class should implement only one method: `increment`. This function takes two arguments (`key` and `ttl`) and should return a Promise that resolves to a current request number in a time frame (ttl). For example:

```js
class CustomStore {
  /**
   * @param {String} key Store key
   * @param {Integer} ttl Key time-to-live ("per" option from the limiter configuration)
   * @returns {Integer} Current request number in the time frame
   */
  async increment (key, ttl) {
    // Implementation
  }
}
```