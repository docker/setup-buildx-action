import fs = require('fs');
import * as buildx from '../src/buildx';
import * as path from 'path';
import * as os from 'os';
import * as semver from 'semver';
import * as exec from '@actions/exec';

describe('isAvailable', () => {
  const execSpy: jest.SpyInstance = jest.spyOn(exec, 'getExecOutput');
  buildx.isAvailable();

  expect(execSpy).toHaveBeenCalledWith(`docker`, ['buildx'], {
    silent: true,
    ignoreReturnCode: true
  });
});

describe('getVersion', () => {
  async function isDaemonRunning() {
    return await exec
      .getExecOutput(`docker`, ['version', '--format', '{{.Server.Os}}'], {
        ignoreReturnCode: true,
        silent: true
      })
      .then(res => {
        return !res.stdout.includes(' ') && res.exitCode == 0;
      });
  }
  (isDaemonRunning() ? it : it.skip)(
    'valid',
    async () => {
      const version = await buildx.getVersion();
      console.log(`version: ${version}`);
      expect(semver.valid(version)).not.toBeNull();
    },
    100000
  );
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

describe('inspect', () => {
  async function isDaemonRunning() {
    return await exec
      .getExecOutput(`docker`, ['version', '--format', '{{.Server.Os}}'], {
        ignoreReturnCode: true,
        silent: true
      })
      .then(res => {
        return !res.stdout.includes(' ') && res.exitCode == 0;
      });
  }
  (isDaemonRunning() ? it : it.skip)(
    'valid',
    async () => {
      const builder = await buildx.inspect('');
      console.log('builder', builder);
      expect(builder).not.toBeUndefined();
      expect(builder.name).not.toEqual('');
      expect(builder.driver).not.toEqual('');
      expect(builder.node_platforms).not.toEqual('');
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
