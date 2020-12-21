'use strict';

const Redis = require('ioredis');
const RedisStore = require('../src/stores/RedisStore');

let redisClient;

beforeEach(() => {
  redisClient = new Redis({ host: process.env.GITLAB_CI ? 'redis-ci': 'localhost' });
});

afterEach(async () => {
  if (redisClient) {
    await redisClient.disconnect();
  }
});

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

test('should increment value by key', async () => {
  const store = new RedisStore(redisClient);

  let cur;
  cur = await store.increment('test-key', 2);

  expect(cur).toEqual(1);

  cur = await store.increment('test-key', 2);

  expect(cur).toEqual(2);

  await new Promise(resolve => setTimeout(() => resolve(), 3000));

  let val = await redisClient.get('test-key');

  expect(val).toBeNull();
});

test('should throw if redis is unavailable', async () => {
  const store = new RedisStore(redisClient);

  await redisClient.disconnect();

  return expect(store.increment('test-key', 2)).rejects.toThrow();
});
