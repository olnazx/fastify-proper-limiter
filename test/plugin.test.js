'use strict';

const fastifyFactory = require('fastify');
const fastifySymbols = require('fastify/lib/symbols');
const plugin = require('../src/plugin');

let fastify;

beforeEach(() => {
  fastify = fastifyFactory();
});

describe('Configuration', () => {
  class NoopTestStore {
    async increment () {
      return 0;
    }
  }

  const noopTestStore = new NoopTestStore();

  test('should not apply rate limiting when no route-level config provided', async () => {
    fastify.register(plugin);

    const preHandlerArray = [];

    fastify.get(
      '/test',

      {
        preHandler: preHandlerArray,

        // "config: { limiter: {} }" is missing
      },

      (request, reply) => {
        reply.send('hello world');
      }
    );

    await fastify.ready();

    expect(preHandlerArray.length).toEqual(0);
  });

  test('should throw if `config.limiter` is not an object or a boolean', async () => {
    fastify.register(plugin);

    fastify.get(
      '/test',

      {
        config: {
          limiter: 'invalid_value'
        }
      },

      (request, reply) => {
        reply.send('hello world');
      }
    );

    expect.assertions(1);

    try {
      await fastify.ready();
    } catch (err) {
      expect(err.message).toEqual('`config.limiter` should be an object or a boolean.');
    }
  });

  test('should throw if `limiter.store` is not provided', async () => {
    fastify.register(plugin);

    fastify.get(
      '/test',

      {
        config: {
          limiter: {
            store: null
          }
        }
      },

      (request, reply) => {
        reply.send('hello world');
      }
    );

    expect.assertions(1);

    try {
      await fastify.ready();
    } catch (err) {
      expect(err.message).toEqual('`limiter.store` is required.');
    }
  });

  test('should throw if custom `limiter.errorResponseGenerator` is not a function', async () => {
    fastify.register(plugin, { store: noopTestStore });

    fastify.get(
      '/test',

      {
        config: {
          limiter: {
            errorResponseGenerator: 'not_a_function'
          }
        }
      },

      (request, reply) => {
        reply.send('hello world');
      }
    );

    expect.assertions(1);

    try {
      await fastify.ready();
    } catch (err) {
      expect(err.message).toEqual('`limiter.errorResponseGenerator` should be a function.');
    }
  });

  test('should throw if `limiter.ignore` is not a function', async () => {
    fastify.register(plugin, { store: noopTestStore });

    fastify.get(
      '/test',

      {
        config: {
          limiter: {
            ignore: 'not_a_function'
          }
        }
      },

      (request, reply) => {
        reply.send('hello world');
      }
    );

    expect.assertions(1);

    try {
      await fastify.ready();
    } catch (err) {
      expect(err.message).toEqual('`limiter.ignore` should be a function.');
    }
  });

  test('should throw if `limiter.max` is not a number', async () => {
    fastify.register(plugin, { store: noopTestStore });

    fastify.get(
      '/test',

      {
        config: {
          limiter: {
            max: 'not_a_number'
          }
        }
      },

      (request, reply) => {
        reply.send('hello world');
      }
    );

    expect.assertions(1);

    try {
      await fastify.ready();
    } catch (err) {
      expect(err.message).toEqual('`limiter.max` should be a number.');
    }
  });

  test('should throw if `limiter.per` is not a number', async () => {
    fastify.register(plugin, { store: noopTestStore });

    fastify.get(
      '/test',

      {
        config: {
          limiter: {
            per: 'not_a_number'
          }
        }
      },

      (request, reply) => {
        reply.send('hello world');
      }
    );

    expect.assertions(1);

    try {
      await fastify.ready();
    } catch (err) {
      expect(err.message).toEqual('`limiter.per` should be a number.');
    }
  });

  test('should throw if custom `limiter.storeKeyGenerator` is not a function', async () => {
    fastify.register(plugin, { store: noopTestStore });

    fastify.get(
      '/test',

      {
        config: {
          limiter: {
            storeKeyGenerator: 'not_a_function'
          }
        }
      },

      (request, reply) => {
        reply.send('hello world');
      }
    );

    expect.assertions(1);

    try {
      await fastify.ready();
    } catch (err) {
      expect(err.message).toEqual('`limiter.storeKeyGenerator` should be a function.');
    }
  });

  test('should not override existing "preHandler"', async () => {
    fastify.register(plugin, { store: noopTestStore });

    const preHandlerMock = jest.fn();

    fastify.get(
      '/test',

      {
        preHandler: async function (request, reply) {
          preHandlerMock();
        },

        config: {
          limiter: {
            max: 1,
            per: 10
          }
        }
      },

      (request, reply) => {
        reply.send('hello world');
      }
    );

    let res = await fastify.inject('/test');

    expect(res.statusCode).toEqual(200);
    expect(preHandlerMock).toHaveBeenCalled();
  });

  test('should not override existing "preHandler" array', async () => {
    fastify.register(plugin, { store: noopTestStore });

    const preHandlerMock = jest.fn();

    fastify.get(
      '/test',

      {
        preHandler: [
          async function (request, reply) {
            preHandlerMock();
          }
        ],

        config: {
          limiter: {
            max: 1,
            per: 10
          }
        }
      },

      (request, reply) => {
        reply.send('hello world');
      }
    );

    let res = await fastify.inject('/test');

    expect(res.statusCode).toEqual(200);
    expect(preHandlerMock).toHaveBeenCalled();
  });
});

describe('Runtime', () => {
  class LocalTestStore {
    constructor () {
      this.val = {};
      this.ts = {};
    }

    async increment (key, ttl) {
      let val = this.val[key];
      let ts = this.ts[key];
      let now = Date.now();

      if (
        val === undefined ||
        (now - ts) >= ttl * 1000
      ) {
        this.val[key] = 0;
        this.ts[key] = now;
      }

      this.val[key] += 1;

      return this.val[key];
    }
  }

  test('should work with default LocalStore', async () => {
    fastify.register(plugin);

    fastify.get(
      '/test',

      {
        config: {
          limiter: {
            max: 2,
            per: 10
          }
        }
      },

      (request, reply) => {
        reply.send('hello world');
      }
    );

    let res;
    res = await fastify.inject('/test');

    expect(res.statusCode).toEqual(200);

    res = await fastify.inject('/test');

    expect(res.statusCode).toEqual(200);

    res = await fastify.inject('/test');

    expect(res.statusCode).toEqual(403);
  });

  test('should work with Custom Store', async () => {
    expect.assertions(8);

    class LocalTestCustomStore {
      constructor () {
        this.val = {};
        this.ts = {};
      }

      async increment (key, ttl) {
        expect(key).toEqual('testStaticKey');
        expect(ttl).toEqual(10);

        let val = this.val[key];
        let ts = this.ts[key];
        let now = Date.now();

        if (
          val === undefined ||
          (now - ts) >= ttl * 1000
        ) {
          this.val[key] = 0;
          this.ts[key] = now;
        }

        this.val[key] += 1;

        return this.val[key];
      }
    }

    let customTestStore = new LocalTestCustomStore();

    fastify.register(plugin, {
      store: customTestStore,
      storeKeyGenerator: () => 'testStaticKey'
    });

    fastify.get(
      '/test',

      {
        config: {
          limiter: {
            max: 1,
            per: 10
          }
        }
      },

      (request, reply) => {
        reply.send('hello world');
      }
    );

    let res;
    res = await fastify.inject('/test');

    expect(res.statusCode).toEqual(200);
    expect(customTestStore.val['testStaticKey']).toEqual(1);

    res = await fastify.inject('/test');

    expect(res.statusCode).toEqual(403);
    expect(customTestStore.val['testStaticKey']).toEqual(2);
  });

  test('should override default "errorResponseGenerator"', async () => {
    expect.assertions(8);

    fastify.register(plugin, { store: new LocalTestStore() });

    fastify.get(
      '/test',

      {
        config: {
          limiter: {
            max: 1,
            per: 10,

            errorResponseGenerator: (request, context) => {
              expect(request).toBeInstanceOf(fastify[fastifySymbols.kRequest]);
              expect(context.max).toEqual(1);
              expect(context.per).toEqual(10);
              expect(context.url).toEqual('/test');
              expect(context.method).toEqual('GET');

              let err = new Error('Custom error message.');

              err.statusCode = 429;

              return err;
            }
          }
        }
      },

      (request, reply) => {
        reply.send('hello world');
      }
    );

    let res;
    res = await fastify.inject('/test');

    expect(res.statusCode).toEqual(200);

    res = await fastify.inject('/test');

    expect(res.statusCode).toEqual(429);
    expect(res.json().message).toEqual('Custom error message.');
  });

  test('should support "whitelisting" (ignore)', async () => {
    expect.assertions(12);

    fastify.register(plugin, { store: new LocalTestStore() });

    fastify.get(
      '/test',

      {
        config: {
          limiter: {
            max: 1,
            per: 10,

            storeKeyGenerator: () => 'testStaticKey',
            ignore: (request, storeKey) => {
              expect(request).toBeInstanceOf(fastify[fastifySymbols.kRequest]);
              expect(storeKey).toEqual('testStaticKey');

              return request.headers['x-skip-limiter'] !== undefined;
            }
          }
        }
      },

      (request, reply) => {
        reply.send('hello world');
      }
    );

    let res;
    res = await fastify.inject('/test');

    expect(res.statusCode).toEqual(200);

    res = await fastify.inject('/test');

    expect(res.statusCode).toEqual(403);

    res = await fastify.inject({
      url: '/test',
      headers: {
        'x-skip-limiter': '1'
      }
    });

    expect(res.statusCode).toEqual(200);

    res = await fastify.inject('/test');

    expect(res.statusCode).toEqual(403);
  });

  test('should support async "whitelisting" (ignore)', async () => {
    fastify.register(plugin, { store: new LocalTestStore() });

    fastify.get(
      '/test',

      {
        config: {
          limiter: {
            max: 1,
            per: 10,

            ignore: async (request) => {
              return request.headers['x-skip-limiter'] !== undefined;
            }
          }
        }
      },

      (request, reply) => {
        reply.send('hello world');
      }
    );

    let res;
    res = await fastify.inject('/test');

    expect(res.statusCode).toEqual(200);

    res = await fastify.inject('/test');

    expect(res.statusCode).toEqual(403);

    res = await fastify.inject({
      url: '/test',
      headers: {
        'x-skip-limiter': '1'
      }
    });

    expect(res.statusCode).toEqual(200);

    res = await fastify.inject('/test');

    expect(res.statusCode).toEqual(403);
  });

  test('should work with some basic "max" and "per" values', async () => {
    fastify.register(plugin, { store: new LocalTestStore() });

    fastify.get(
      '/test',

      {
        config: {
          limiter: {
            max: 2,
            per: 10
          }
        }
      },

      (request, reply) => {
        reply.send('hello world');
      }
    );

    let res;
    res = await fastify.inject('/test');

    expect(res.statusCode).toEqual(200);

    res = await fastify.inject('/test');

    expect(res.statusCode).toEqual(200);

    res = await fastify.inject('/test');

    expect(res.statusCode).toEqual(403);
  });

  test('should override default "storeKeyGenerator"', async () => {
    expect.assertions(4);

    const localTestStore = new LocalTestStore();

    fastify.register(plugin, {
      store: localTestStore,

      storeKeyGenerator: (request, routeConfig) => {
        expect(request).toBeInstanceOf(fastify[fastifySymbols.kRequest]);
        expect(routeConfig.url).toEqual('/test');
        expect(routeConfig.method).toEqual('GET');

        return 'testKey';
      }
    });

    fastify.get(
      '/test',

      {
        config: {
          limiter: {
            max: 1,
            per: 10
          }
        }
      },

      (request, reply) => {
        reply.send('hello world');
      }
    );

    await fastify.inject('/test');

    expect(localTestStore.val['testKey']).toBeDefined();
  });

  test('should support skipping limiter if Store error occurred', async () => {
    class TestErrorStore {
      async increment () {
        throw new Error('Test "skipOnError"');
      }
    }

    fastify.register(plugin, { store: new TestErrorStore() });

    fastify.get(
      '/test',

      {
        config: {
          limiter: {
            max: 1,
            per: 10
          }
        }
      },

      (request, reply) => {
        reply.send('hello world');
      }
    );

    fastify.get(
      '/test-skip',

      {
        config: {
          limiter: {
            max: 1,
            per: 10,
            skipOnError: true
          }
        }
      },

      (request, reply) => {
        reply.send('hello world');
      }
    );

    let res;
    res = await fastify.inject('/test');

    expect(res.statusCode).toEqual(500);
    expect(res.json().message).toEqual('Test "skipOnError"');

    res = await fastify.inject('/test-skip');

    expect(res.statusCode).toEqual(200);
  });

  test('should use globally defined options when `limiter` is "true"', async () => {
    const localTestStore = new LocalTestStore();

    fastify.register(plugin, {
      store: localTestStore,
      storeKeyGenerator: () => 'testGlobalStaticKey'
    });

    fastify.get(
      '/test',

      {
        config: {
          limiter: true
        }
      },

      (request, reply) => {
        reply.send('hello world');
      }
    );

    await fastify.inject('/test');

    expect(localTestStore.val['testGlobalStaticKey']).toBeDefined();
  });
});