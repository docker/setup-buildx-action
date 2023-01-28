import {describe, expect, it} from '@jest/globals';
import * as github from '../src/github';

describe('github', () => {
  it('returns latest buildx GitHub release', async () => {
    const release = await github.getLatestRelease(process.env.GITHUB_TOKEN || '');
    expect(release).not.toBeNull();
    expect(release?.tag_name).not.toEqual('');
  });

  it('returns v0.2.2 buildx GitHub release', async () => {
    const release = await github.getReleaseTag('v0.2.2', process.env.GITHUB_TOKEN || '');
    expect(release).not.toBeNull();
    expect(release?.tag_name).toEqual('v0.2.2');
  });

  it('unknown release', async () => {
    await expect(github.getReleaseTag('foo', process.env.GITHUB_TOKEN || '')).rejects.toThrowError(new Error('Cannot get release foo: HttpError: Not Found'));
  });
});
