'use strict';

const LocalStore = require('../src/stores/LocalStore');

test('does set() and get()', () => {
  const store = new LocalStore();

  store._set('key', 'value');
  expect(store._get('key')).toEqual('value');
  expect(store._size).toEqual(1);

  store._set('key', 'value_new');
  expect(store._get('key')).toEqual('value_new');
  expect(store._size).toEqual(1);

  store._set('key2', 'value');
  expect(store._get('key2')).toEqual('value');
  expect(store._size).toEqual(2);
});

test('lru-cache algorithm should work as expected with "max" parameter', () => {
  const store = new LocalStore(2);

  expect(store._max).toEqual(2);

  store._set('key', 'value');
  expect(store._size).toEqual(1);
  expect(store._cache.size).toEqual(1);
  expect(store._oldCache.size).toEqual(0);

  store._set('key2', 'value');
  expect(store._size).toEqual(0);
  expect(store._cache.size).toEqual(0);
  expect(store._oldCache.size).toEqual(2);

  expect(store._get('key2')).toEqual('value');
  expect(store._size).toEqual(1);
  expect(store._cache.size).toEqual(1);
  expect(store._oldCache.size).toEqual(1);
});

test('should increment value by key', async () => {
  const store = new LocalStore();

  let cur;
  cur = await store.increment('key', 2);

  expect(cur).toEqual(1);

  cur = await store.increment('key', 2);

  expect(cur).toEqual(2);

  await new Promise(resolve => setTimeout(() => resolve(), 3000));

  cur = await store.increment('key', 2);

  expect(cur).toEqual(1);
});