'use strict';

/**
 * Error handling for async functions.
 * @param {Promise} promise
 * @returns {Promise}
 * 
 * Usage:
 * 
 *   async function foo () {
 *     let [err, res] = await to(fnThatReturnsPromise());
 * 
 *     if (err) {
 *       throw err;
 *     }
 *   }
 */
function awaitTo (promise) {
  return promise
    .then(data => [null, data])
    .catch(error => [error, undefined]);
}

module.exports = {
  awaitTo
}
