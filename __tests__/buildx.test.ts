import fs = require('fs');
import * as docker from '../src/docker';
import * as buildx from '../src/buildx';
import * as path from 'path';
import * as os from 'os';
import * as semver from 'semver';
import * as exec from '@actions/exec';

describe('getVersion', () => {
  it('valid', async () => {
    await exec.exec('docker', ['buildx', 'version']);
    const version = await buildx.getVersion();
    console.log(`version: ${version}`);
    expect(semver.valid(version)).not.toBeNull();
  }, 100000);
});

describe('parseVersion', () => {
  test.each([
    ['github.com/docker/buildx 0.4.1+azure bda4882a65349ca359216b135896bddc1d92461c', '0.4.1'],
    ['github.com/docker/buildx v0.4.1 bda4882a65349ca359216b135896bddc1d92461c', '0.4.1'],
    ['github.com/docker/buildx v0.4.2 fb7b670b764764dc4716df3eba07ffdae4cc47b2', '0.4.2']
  ])('given %p', async (stdout, expected) => {
    expect(await buildx.parseVersion(stdout)).toEqual(expected);
  });
});

describe('platforms', () => {
  async function isDaemonRunning() {
    return await docker.isDaemonRunning();
  }
  (isDaemonRunning() ? it : it.skip)(
    'valid',
    async () => {
      const platforms = buildx.platforms();
      console.log(`platforms: ${platforms}`);
      expect(platforms).not.toBeUndefined();
      expect(platforms).not.toEqual('');
    },
    100000
  );
});

describe('install', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-buildx-'));
  it('acquires v0.4.1 version of buildx', async () => {
    const buildxBin = await buildx.install('v0.4.1', tmpDir);
    console.log(buildxBin);
    expect(fs.existsSync(buildxBin)).toBe(true);
  }, 100000);
  it('acquires latest version of buildx', async () => {
    const buildxBin = await buildx.install('latest', tmpDir);
    console.log(buildxBin);
    expect(fs.existsSync(buildxBin)).toBe(true);
  }, 100000);
});
