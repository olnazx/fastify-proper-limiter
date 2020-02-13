'use strict';

const Redis = require('ioredis');
const RedisStore = require('../src/stores/RedisStore');

let redisClient;

beforeEach(() => {
  redisClient = new Redis();
});

describe('Configuration', () => {
  test('should throw if `redis` is not provided', () => {
    try {
      const store = new RedisStore();
    } catch (err) {
      expect(err.message).toEqual('`redis` must be an instance of "ioredis".');
    }
  });

  test('should define a new atomic command for the redis client', () => {
    expect(redisClient[RedisStore.REDIS_CMD_NAME]).toBeUndefined();

    const store = new RedisStore(redisClient);

    expect(redisClient[RedisStore.REDIS_CMD_NAME]).toBeDefined();
  });
});