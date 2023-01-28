import {describe, expect, it, jest, test} from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as buildx from '../src/buildx';
import * as context from '../src/context';
import * as semver from 'semver';
import * as exec from '@actions/exec';

const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'docker-setup-buildx-')).split(path.sep).join(path.posix.sep);
jest.spyOn(context, 'tmpDir').mockImplementation((): string => {
  return tmpdir;
});

const tmpname = path.join(tmpdir, '.tmpname').split(path.sep).join(path.posix.sep);
jest.spyOn(context, 'tmpNameSync').mockImplementation((): string => {
  return tmpname;
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

describe('getRelease', () => {
  it('returns latest buildx GitHub release', async () => {
    const release = await buildx.getRelease('latest');
    expect(release).not.toBeNull();
    expect(release?.tag_name).not.toEqual('');
  });

  it('returns v0.10.1 buildx GitHub release', async () => {
    const release = await buildx.getRelease('v0.10.1');
    expect(release).not.toBeNull();
    expect(release?.id).toEqual(90346950);
    expect(release?.tag_name).toEqual('v0.10.1');
    expect(release?.html_url).toEqual('https://github.com/docker/buildx/releases/tag/v0.10.1');
  });

  it('returns v0.2.2 buildx GitHub release', async () => {
    const release = await buildx.getRelease('v0.2.2');
    expect(release).not.toBeNull();
    expect(release?.id).toEqual(17671545);
    expect(release?.tag_name).toEqual('v0.2.2');
    expect(release?.html_url).toEqual('https://github.com/docker/buildx/releases/tag/v0.2.2');
  });

  it('unknown release', async () => {
    await expect(buildx.getRelease('foo')).rejects.toThrowError(new Error('Cannot find Buildx release foo in https://raw.githubusercontent.com/docker/buildx/master/.github/releases.json'));
  });
});

describe('isAvailable standalone', () => {
  const execSpy = jest.spyOn(exec, 'getExecOutput');
  buildx.isAvailable(true);

  // eslint-disable-next-line jest/no-standalone-expect
  expect(execSpy).toHaveBeenCalledWith(`buildx`, [], {
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
    expect(builder.nodes).not.toEqual({});
  }, 100000);
});

describe('parseInspect', () => {
  // prettier-ignore
  test.each([
    [
     'inspect1.txt',
     {
       "nodes": [
         {
           "name": "builder-5cb467f7-0940-47e1-b94b-d51f54054d620",
           "endpoint": "unix:///var/run/docker.sock",
           "status": "running",
           "buildkitd-flags": "--allow-insecure-entitlement security.insecure --allow-insecure-entitlement network.host",
           "buildkit": "v0.10.4",
           "platforms": "linux/amd64,linux/amd64/v2,linux/amd64/v3,linux/amd64/v4,linux/arm64,linux/riscv64,linux/386,linux/arm/v7,linux/arm/v6"
         }
       ],
       "name": "builder-5cb467f7-0940-47e1-b94b-d51f54054d62",
       "driver": "docker-container"
     }
    ],
    [
     'inspect2.txt',
     {
       "nodes": [
         {
           "name": "builder-5f449644-ff29-48af-8344-abb0292d06730",
           "endpoint": "unix:///var/run/docker.sock",
           "driver-opts": [
             "image=moby/buildkit:latest"
           ],
           "status": "running",
           "buildkitd-flags": "--allow-insecure-entitlement security.insecure --allow-insecure-entitlement network.host",
           "buildkit": "v0.10.4",
           "platforms": "linux/amd64,linux/amd64/v2,linux/amd64/v3,linux/amd64/v4,linux/386"
         }
       ],
       "name": "builder-5f449644-ff29-48af-8344-abb0292d0673",
       "driver": "docker-container"
     }
    ],
    [
     'inspect3.txt',
     {
       "nodes": [
         {
           "name": "builder-9929e463-7954-4dc3-89cd-514cca29ff800",
           "endpoint": "unix:///var/run/docker.sock",
           "driver-opts": [
             "image=moby/buildkit:master",
             "network=host"
           ],
           "status": "running",
           "buildkitd-flags": "--allow-insecure-entitlement security.insecure --allow-insecure-entitlement network.host",
           "buildkit": "3fab389",
           "platforms": "linux/amd64,linux/amd64/v2,linux/amd64/v3,linux/amd64/v4,linux/386"
         }
       ],
       "name": "builder-9929e463-7954-4dc3-89cd-514cca29ff80",
       "driver": "docker-container"
     }
    ],
    [
     'inspect4.txt',
     {
       "nodes": [
         {
           "name": "default",
           "endpoint": "default",
           "status": "running",
           "buildkit": "20.10.17",
           "platforms": "linux/amd64,linux/arm64,linux/riscv64,linux/ppc64le,linux/s390x,linux/386,linux/arm/v7,linux/arm/v6"
         }
       ],
       "name": "default",
       "driver": "docker"
     }
    ],
    [
     'inspect5.txt',
     {
       "nodes": [
         {
           "name": "aws_graviton2",
           "endpoint": "tcp://1.23.45.67:1234",
           "driver-opts": [
             "cert=/home/user/.certs/aws_graviton2/cert.pem",
             "key=/home/user/.certs/aws_graviton2/key.pem",
             "cacert=/home/user/.certs/aws_graviton2/ca.pem"
           ],
           "status": "running",
           "platforms": "darwin/arm64,linux/arm64,linux/arm/v5,linux/arm/v6,linux/arm/v7,windows/arm64"
         }
       ],
       "name": "remote-builder",
       "driver": "remote"
     }
    ],
    [
     'inspect6.txt',
     {
       "nodes": [
         {
           "name": "builder-17cfff01-48d9-4c3d-9332-9992e308a5100",
           "endpoint": "unix:///var/run/docker.sock",
           "status": "running",
           "buildkitd-flags": "--allow-insecure-entitlement security.insecure --allow-insecure-entitlement network.host",
           "platforms": "linux/amd64,linux/amd64/v2,linux/amd64/v3,linux/386"
         }
       ],
       "name": "builder-17cfff01-48d9-4c3d-9332-9992e308a510",
       "driver": "docker-container"
     }
    ],
  ])('given %p', async (inspectFile, expected) => {
    expect(await buildx.parseInspect(fs.readFileSync(path.join(__dirname, 'fixtures', inspectFile)).toString())).toEqual(expected);
  });
});

describe('build', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-buildx-'));

  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('builds refs/pull/648/head', async () => {
    const buildxBin = await buildx.build('https://github.com/docker/buildx.git#refs/pull/648/head', tmpDir, false);
    expect(fs.existsSync(buildxBin)).toBe(true);
  }, 100000);

  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('builds 67bd6f4dc82a9cd96f34133dab3f6f7af803bb14', async () => {
    const buildxBin = await buildx.build('https://github.com/docker/buildx.git#67bd6f4dc82a9cd96f34133dab3f6f7af803bb14', tmpDir, false);
    expect(fs.existsSync(buildxBin)).toBe(true);
  }, 100000);
});

describe('install', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-buildx-'));
  test.each([
    ['v0.4.1', false],
    ['latest', false],
    ['v0.4.1', true],
    ['latest', true]
  ])(
    'acquires %p of buildx (standalone: %p)',
    async (version, standalone) => {
      const buildxBin = await buildx.install(version, tmpDir, standalone);
      expect(fs.existsSync(buildxBin)).toBe(true);
    },
    100000
  );
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
      expect(config).toEqual(tmpname);
      const configValue = fs.readFileSync(tmpname, 'utf-8');
      expect(configValue).toEqual(exValue);
    } catch (err) {
      // eslint-disable-next-line jest/no-conditional-expect
      expect(true).toBe(invalid);
    }
  });
});
