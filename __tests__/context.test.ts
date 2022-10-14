import {beforeEach, describe, expect, it, jest, test} from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as uuid from 'uuid';
import * as context from '../src/context';
import * as nodes from '../src/nodes';

const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'docker-setup-buildx-')).split(path.sep).join(path.posix.sep);
jest.spyOn(context, 'tmpDir').mockImplementation((): string => {
  return tmpdir;
});

jest.spyOn(context, 'tmpNameSync').mockImplementation((): string => {
  return path.join(tmpdir, '.tmpname').split(path.sep).join(path.posix.sep);
});

jest.mock('uuid');
jest.spyOn(uuid, 'v4').mockReturnValue('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d');

describe('getCreateArgs', () => {
  beforeEach(() => {
    process.env = Object.keys(process.env).reduce((object, key) => {
      if (!key.startsWith('INPUT_')) {
        object[key] = process.env[key];
      }
      return object;
    }, {});
  });

  // prettier-ignore
  test.each([
    [
      0,
      new Map<string, string>([
        ['install', 'false'],
        ['use', 'true'],
      ]),
      [
        'create',
        '--name', 'builder-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        '--driver', 'docker-container',
        '--buildkitd-flags', '--allow-insecure-entitlement security.insecure --allow-insecure-entitlement network.host',
        '--use'
      ]
    ],
    [
      1,
      new Map<string, string>([
        ['driver', 'docker'],
        ['install', 'false'],
        ['use', 'true'],
      ]),
      [
        'create',
        '--name', 'default',
        '--driver', 'docker',
        '--buildkitd-flags', '--allow-insecure-entitlement security.insecure --allow-insecure-entitlement network.host',
        '--use'
      ]
    ],
    [
      2,
      new Map<string, string>([
        ['install', 'false'],
        ['use', 'false'],
        ['driver-opts', 'image=moby/buildkit:master\nnetwork=host'],
      ]),
      [
        'create',
        '--name', 'builder-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        '--driver', 'docker-container',
        '--driver-opt', 'image=moby/buildkit:master',
        '--driver-opt', 'network=host',
        '--buildkitd-flags', '--allow-insecure-entitlement security.insecure --allow-insecure-entitlement network.host'
      ]
    ],
    [
      3,
      new Map<string, string>([
        ['driver', 'remote'],
        ['endpoint', 'tls://foo:1234'],
        ['install', 'false'],
        ['use', 'true'],
      ]),
      [
        'create',
        '--name', 'builder-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        '--driver', 'remote',
        '--use',
        'tls://foo:1234'
      ]
    ],
    [
      4,
      new Map<string, string>([
        ['driver', 'remote'],
        ['platforms', 'linux/arm64,linux/arm/v7'],
        ['endpoint', 'tls://foo:1234'],
        ['install', 'false'],
        ['use', 'true'],
      ]),
      [
        'create',
        '--name', 'builder-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        '--driver', 'remote',
        '--platform', 'linux/arm64,linux/arm/v7',
        '--use',
        'tls://foo:1234'
      ]
    ],
  ])(
    '[%d] given %p as inputs, returns %p',
    async (num: number, inputs: Map<string, string>, expected: Array<string>) => {
      inputs.forEach((value: string, name: string) => {
        setInput(name, value);
      });
      const inp = await context.getInputs();
      const res = await context.getCreateArgs(inp, '0.9.0');
      expect(res).toEqual(expected);
    }
  );
});

describe('getAppendArgs', () => {
  beforeEach(() => {
    process.env = Object.keys(process.env).reduce((object, key) => {
      if (!key.startsWith('INPUT_')) {
        object[key] = process.env[key];
      }
      return object;
    }, {});
  });

  // prettier-ignore
  test.each([
    [
      0,
      new Map<string, string>([
        ['install', 'false'],
        ['use', 'true'],
      ]),
      {
        "name": "aws_graviton2",
        "endpoint": "ssh://me@graviton2",
        "driver-opts": [
          "image=moby/buildkit:latest"
        ],
        "buildkitd-flags": "--allow-insecure-entitlement security.insecure --allow-insecure-entitlement network.host",
        "platforms": "linux/arm64"
      },
      [
        'create',
        '--name', 'builder-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        '--append',
        '--node', 'aws_graviton2',
        '--driver-opt', 'image=moby/buildkit:latest',
        '--buildkitd-flags', '--allow-insecure-entitlement security.insecure --allow-insecure-entitlement network.host',
        '--platform', 'linux/arm64',
        'ssh://me@graviton2'
      ]
    ]
  ])(
    '[%d] given %p as inputs, returns %p',
    async (num: number, inputs: Map<string, string>, node: nodes.Node, expected: Array<string>) => {
      inputs.forEach((value: string, name: string) => {
        setInput(name, value);
      });
      const inp = await context.getInputs();
      const res = await context.getAppendArgs(inp, node, '0.9.0');
      expect(res).toEqual(expected);
    }
  );
});

describe('getInputList', () => {
  it('handles single line correctly', async () => {
    await setInput('foo', 'bar');
    const res = await context.getInputList('foo');
    expect(res).toEqual(['bar']);
  });

  it('handles multiple lines correctly', async () => {
    setInput('foo', 'bar\nbaz');
    const res = await context.getInputList('foo');
    expect(res).toEqual(['bar', 'baz']);
  });

  it('remove empty lines correctly', async () => {
    setInput('foo', 'bar\n\nbaz');
    const res = await context.getInputList('foo');
    expect(res).toEqual(['bar', 'baz']);
  });

  it('handles comma correctly', async () => {
    setInput('foo', 'bar,baz');
    const res = await context.getInputList('foo');
    expect(res).toEqual(['bar', 'baz']);
  });

  it('remove empty result correctly', async () => {
    setInput('foo', 'bar,baz,');
    const res = await context.getInputList('foo');
    expect(res).toEqual(['bar', 'baz']);
  });

  it('handles different new lines correctly', async () => {
    setInput('foo', 'bar\r\nbaz');
    const res = await context.getInputList('foo');
    expect(res).toEqual(['bar', 'baz']);
  });

  it('handles different new lines and comma correctly', async () => {
    setInput('foo', 'bar\r\nbaz,bat');
    const res = await context.getInputList('foo');
    expect(res).toEqual(['bar', 'baz', 'bat']);
  });

  it('handles multiple lines and ignoring comma correctly', async () => {
    setInput('driver-opts', 'image=moby/buildkit:master\nnetwork=host');
    const res = await context.getInputList('driver-opts', true);
    expect(res).toEqual(['image=moby/buildkit:master', 'network=host']);
  });

  it('handles different new lines and ignoring comma correctly', async () => {
    setInput('driver-opts', 'image=moby/buildkit:master\r\nnetwork=host');
    const res = await context.getInputList('driver-opts', true);
    expect(res).toEqual(['image=moby/buildkit:master', 'network=host']);
  });
});

describe('asyncForEach', () => {
  it('executes async tasks sequentially', async () => {
    const testValues = [1, 2, 3, 4, 5];
    const results: number[] = [];

    await context.asyncForEach(testValues, async value => {
      results.push(value);
    });

    expect(results).toEqual(testValues);
  });
});

// See: https://github.com/actions/toolkit/blob/master/packages/core/src/core.ts#L67
function getInputName(name: string): string {
  return `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
}

function setInput(name: string, value: string): void {
  process.env[getInputName(name)] = value;
}
