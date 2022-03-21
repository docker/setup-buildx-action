import {describe, expect, it, jest, test} from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as buildx from '../src/buildx';
import * as context from '../src/context';
import * as semver from 'semver';
import * as exec from '@actions/exec';

const tmpNameSync = path.join('/tmp/.docker-setup-buildx-jest', '.tmpname-jest').split(path.sep).join(path.posix.sep);

jest.spyOn(context, 'tmpDir').mockImplementation((): string => {
  const tmpDir = path.join('/tmp/.docker-setup-buildx-jest').split(path.sep).join(path.posix.sep);
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, {recursive: true});
  }
  return tmpDir;
});

jest.spyOn(context, 'tmpNameSync').mockImplementation((): string => {
  return tmpNameSync;
});

describe('isAvailable', () => {
  const execSpy = jest.spyOn(exec, 'getExecOutput');
  buildx.isAvailable();

  // eslint-disable-next-line jest/no-standalone-expect
  expect(execSpy).toHaveBeenCalledWith(`docker`, ['buildx'], {
    silent: true,
    ignoreReturnCode: true
  });
});

describe('getVersion', () => {
  it('valid', async () => {
    const version = await buildx.getVersion();
    expect(semver.valid(version)).not.toBeNull();
  });
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
  it('valid', async () => {
    const builder = await buildx.inspect('');
    expect(builder).not.toBeUndefined();
    expect(builder.name).not.toEqual('');
    expect(builder.driver).not.toEqual('');
    expect(builder.node_platforms).not.toEqual('');
  }, 100000);
});

describe('build', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-buildx-'));

  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('builds refs/pull/648/head', async () => {
    const buildxBin = await buildx.build('https://github.com/docker/buildx.git#refs/pull/648/head', tmpDir);
    expect(fs.existsSync(buildxBin)).toBe(true);
  }, 100000);

  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('builds 67bd6f4dc82a9cd96f34133dab3f6f7af803bb14', async () => {
    const buildxBin = await buildx.build('https://github.com/docker/buildx.git#67bd6f4dc82a9cd96f34133dab3f6f7af803bb14', tmpDir);
    expect(fs.existsSync(buildxBin)).toBe(true);
  }, 100000);
});

describe('install', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-buildx-'));

  it('acquires v0.4.1 version of buildx', async () => {
    const buildxBin = await buildx.install('v0.4.1', tmpDir);
    expect(fs.existsSync(buildxBin)).toBe(true);
  }, 100000);

  it('acquires latest version of buildx', async () => {
    const buildxBin = await buildx.install('latest', tmpDir);
    expect(fs.existsSync(buildxBin)).toBe(true);
  }, 100000);
});

describe('getConfig', () => {
  test.each([
    ['debug = true', false, 'debug = true', false],
    [`notfound.toml`, true, '', true],
    [
      `${path.join(__dirname, 'fixtures', 'buildkitd.toml').split(path.sep).join(path.posix.sep)}`,
      true,
      `debug = true
[registry."docker.io"]
  mirrors = ["mirror.gcr.io"]
`,
      false
    ]
  ])('given %p config', async (val, file, exValue, invalid) => {
    try {
      let config: string;
      if (file) {
        config = await buildx.getConfigFile(val);
      } else {
        config = await buildx.getConfigInline(val);
      }
      expect(true).toBe(!invalid);
      expect(config).toEqual(`${tmpNameSync}`);
      const configValue = fs.readFileSync(tmpNameSync, 'utf-8');
      expect(configValue).toEqual(exValue);
    } catch (err) {
      // eslint-disable-next-line jest/no-conditional-expect
      expect(true).toBe(invalid);
    }
  });
});
