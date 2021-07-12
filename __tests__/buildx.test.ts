import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as buildx from '../src/buildx';
import * as context from '../src/context';
import * as semver from 'semver';
import * as exec from '@actions/exec';

jest.spyOn(context, 'tmpDir').mockImplementation((): string => {
  const tmpDir = path.join('/tmp/.docker-setup-buildx-jest').split(path.sep).join(path.posix.sep);
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, {recursive: true});
  }
  return tmpDir;
});

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
        return !res.stdout.trim().includes(' ') && res.exitCode == 0;
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
    ['github.com/docker/buildx v0.4.2 fb7b670b764764dc4716df3eba07ffdae4cc47b2', '0.4.2'],
    ['github.com/docker/buildx f117971 f11797113e5a9b86bd976329c5dbb8a8bfdfadfa', 'f117971']
  ])('given %p', async (stdout, expected) => {
    expect(buildx.parseVersion(stdout)).toEqual(expected);
  });
});

describe('satisfies', () => {
  test.each([
    ['0.4.1', '>=0.3.2', true],
    ['bda4882a65349ca359216b135896bddc1d92461c', '>0.1.0', false],
    ['f117971', '>0.6.0', true]
  ])('given %p', async (version, range, expected) => {
    expect(buildx.satisfies(version, range)).toBe(expected);
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
        return !res.stdout.trim().includes(' ') && res.exitCode == 0;
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

describe('build', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-buildx-'));
  it.skip('builds refs/pull/648/head', async () => {
    const buildxBin = await buildx.build('https://github.com/docker/buildx.git#refs/pull/648/head', tmpDir);
    console.log(buildxBin);
    expect(fs.existsSync(buildxBin)).toBe(true);
  }, 100000);
  it.skip('builds 67bd6f4dc82a9cd96f34133dab3f6f7af803bb14', async () => {
    const buildxBin = await buildx.build('https://github.com/docker/buildx.git#67bd6f4dc82a9cd96f34133dab3f6f7af803bb14', tmpDir);
    console.log(buildxBin);
    expect(fs.existsSync(buildxBin)).toBe(true);
  }, 100000);
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
