import * as util from '../src/util';

describe('isValidUrl', () => {
  test.each([
    ['https://github.com/docker/buildx.git', true],
    ['https://github.com/docker/buildx.git#refs/pull/648/head', true],
    ['v0.4.1', false]
  ])('given %p', async (url, expected) => {
    expect(util.isValidUrl(url)).toEqual(expected);
  });
});
