import {beforeEach, describe, expect, test, vi} from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {Buildx} from '@docker/actions-toolkit/lib/buildx/buildx.js';
import {Context} from '@docker/actions-toolkit/lib/context.js';
import {Docker} from '@docker/actions-toolkit/lib/docker/docker.js';
import {Toolkit} from '@docker/actions-toolkit/lib/toolkit.js';

import {Node} from '@docker/actions-toolkit/lib/types/buildx/builder.js';

import * as context from '../src/context.js';

const fixturesDir = path.join(__dirname, 'fixtures');
const tmpDir = fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'context-'));
const tmpName = path.join(tmpDir, '.tmpname-vi');

vi.spyOn(Context, 'tmpDir').mockImplementation((): string => {
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, {recursive: true});
  }
  return tmpDir;
});

vi.spyOn(Context, 'tmpName').mockImplementation((): string => {
  return tmpName;
});

vi.mock('crypto', async () => {
  return {
    ...(await vi.importActual('crypto')),
    randomUUID: vi.fn(() => '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d')
  };
});

vi.spyOn(Docker, 'context').mockImplementation((): Promise<string> => {
  return Promise.resolve('default');
});

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
      'v0.10.3',
      new Map<string, string>([
        ['use', 'true'],
        ['cache-binary', 'true'],
        ['cleanup', 'true'],
        ['keep-state', 'false']
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
      'v0.10.3',
      new Map<string, string>([
        ['driver', 'docker'],
        ['use', 'true'],
        ['cache-binary', 'true'],
        ['cleanup', 'true'],
        ['keep-state', 'false']
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
      'v0.10.3',
      new Map<string, string>([
        ['use', 'false'],
        ['driver-opts', 'image=moby/buildkit:master\nnetwork=host'],
        ['cache-binary', 'true'],
        ['cleanup', 'true'],
        ['keep-state', 'false']
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
      'v0.10.3',
      new Map<string, string>([
        ['driver', 'remote'],
        ['endpoint', 'tls://foo:1234'],
        ['use', 'true'],
        ['cache-binary', 'true'],
        ['cleanup', 'true'],
        ['keep-state', 'false']
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
      'v0.10.3',
      new Map<string, string>([
        ['driver', 'remote'],
        ['platforms', 'linux/arm64,linux/arm/v7'],
        ['endpoint', 'tls://foo:1234'],
        ['use', 'true'],
        ['cache-binary', 'true'],
        ['cleanup', 'true'],
        ['keep-state', 'false']
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
    [
      5,
      'v0.10.3',
      new Map<string, string>([
        ['use', 'false'],
        ['driver-opts', `"env.no_proxy=localhost,127.0.0.1,.mydomain"`],
        ['cache-binary', 'true'],
        ['cleanup', 'true'],
        ['keep-state', 'false'],
      ]),
      [
        'create',
        '--name', 'builder-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        '--driver', 'docker-container',
        '--driver-opt', '"env.no_proxy=localhost,127.0.0.1,.mydomain"',
        '--buildkitd-flags', '--allow-insecure-entitlement security.insecure --allow-insecure-entitlement network.host'
      ]
    ],
    [
      6,
      'v0.10.3',
      new Map<string, string>([
        ['use', 'false'],
        ['platforms', 'linux/amd64\n"linux/arm64,linux/arm/v7"'],
        ['cache-binary', 'true'],
        ['cleanup', 'true'],
        ['keep-state', 'false'],
      ]),
      [
        'create',
        '--name', 'builder-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        '--driver', 'docker-container',
        '--buildkitd-flags', '--allow-insecure-entitlement security.insecure --allow-insecure-entitlement network.host',
        '--platform', 'linux/amd64,linux/arm64,linux/arm/v7'
      ]
    ],
    [
      7,
      'v0.10.3',
      new Map<string, string>([
        ['use', 'false'],
        ['driver', 'unknown'],
        ['cache-binary', 'true'],
        ['cleanup', 'true'],
        ['keep-state', 'false'],
      ]),
      [
        'create',
        '--name', 'builder-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        '--driver', 'unknown',
      ]
    ],
    [
      8,
      'v0.10.3',
      new Map<string, string>([
        ['use', 'false'],
        ['buildkitd-config', path.join(fixturesDir, 'buildkitd.toml')],
        ['cache-binary', 'true'],
        ['cleanup', 'true'],
        ['keep-state', 'false'],
      ]),
      [
        'create',
        '--name', 'builder-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        '--driver', 'docker-container',
        '--buildkitd-flags', '--allow-insecure-entitlement security.insecure --allow-insecure-entitlement network.host',
        '--config', tmpName,
      ]
    ],
    [
      9,
      'v0.10.3',
      new Map<string, string>([
        ['use', 'false'],
        ['buildkitd-config-inline', 'debug = true'],
        ['cache-binary', 'true'],
        ['cleanup', 'true'],
        ['keep-state', 'false'],
      ]),
      [
        'create',
        '--name', 'builder-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        '--driver', 'docker-container',
        '--buildkitd-flags', '--allow-insecure-entitlement security.insecure --allow-insecure-entitlement network.host',
        '--config', tmpName,
      ]
    ],
    [
      10,
      'v0.37.0',
      new Map<string, string>([
        ['use', 'false'],
        ['driver', 'cloud'],
        ['buildkitd-flags', '--allow-insecure-entitlement network.host'],
        ['cache-binary', 'true'],
        ['cleanup', 'true'],
        ['keep-state', 'false'],
      ]),
      [
        'create',
        '--name', 'builder-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        '--driver', 'cloud',
        '--buildkitd-flags', '--allow-insecure-entitlement network.host',
      ]
    ],
    [
      11,
      'v0.10.3',
      new Map<string, string>([
        ['use', 'true'],
        ['cleanup', 'true'],
        ['cache-binary', 'true'],
        ['keep-state', 'false'],
        ['name', 'test-builder-name'],
      ]),
      [
        'create',
        '--name', 'test-builder-name',
        '--driver', 'docker-container',
        '--buildkitd-flags', '--allow-insecure-entitlement security.insecure --allow-insecure-entitlement network.host',
        '--use'
      ]
    ],
    [
      12,
      'v0.10.3',
      new Map<string, string>([
        ['use', 'true'],
        ['cleanup', 'true'],
        ['cache-binary', 'true'],
        ['keep-state', 'true'],
        ['name', 'test-builder-name'],
      ]),
      [
        'create',
        '--name', 'test-builder-name',
        '--driver', 'docker-container',
        '--buildkitd-flags', '--allow-insecure-entitlement security.insecure --allow-insecure-entitlement network.host',
        '--use',
      ]
    ],
  ])(
    '[%d] given buildx %o and %o as inputs, returns %o',
    async (num: number, buildxVersion: string, inputs: Map<string, string>, expected: Array<string>) => {
      inputs.forEach((value: string, name: string) => {
        setInput(name, value);
      });
      const toolkit = new Toolkit();
      vi.spyOn(Buildx.prototype, 'version').mockImplementation(async (): Promise<string> => {
        return buildxVersion;
      });
      const inp = await context.getInputs();
      const res = await context.getCreateArgs(inp, toolkit);
      expect(res).toEqual(expected);
    }
  );

  test('rejects cloud driver with unsupported official Buildx', async () => {
    setInput('version', 'v0.36.1');
    setInput('driver', 'cloud');
    setInput('use', 'true');
    setInput('cache-binary', 'true');
    setInput('cleanup', 'true');
    setInput('keep-state', 'false');
    const toolkit = new Toolkit();
    const versionSpy = vi.spyOn(Buildx.prototype, 'version').mockImplementation(async (): Promise<string> => {
      return 'v0.36.1';
    });
    try {
      const inp = await context.getInputs();
      await expect(context.getCreateArgs(inp, toolkit)).rejects.toThrow(/requires Buildx v0.37.0 or later/);
    } finally {
      versionSpy.mockRestore();
    }
  });
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
      'v0.10.3',
      new Map<string, string>([
        ['use', 'true'],
        ['cache-binary', 'true'],
        ['cleanup', 'true'],
        ['keep-state', 'false']
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
    '[%d] given buildx %o and %o as inputs, returns %o',
    async (num: number, buildxVersion: string, inputs: Map<string, string>, node: Node, expected: Array<string>) => {
      inputs.forEach((value: string, name: string) => {
        setInput(name, value);
      });
      const toolkit = new Toolkit();
      vi.spyOn(Buildx.prototype, 'version').mockImplementation(async (): Promise<string> => {
        return buildxVersion;
      });
      const inp = await context.getInputs();
      const res = await context.getAppendArgs(inp, node, toolkit);
      expect(res).toEqual(expected);
    }
  );
});

// See: https://github.com/actions/toolkit/blob/master/packages/core/src/core.ts#L67
function getInputName(name: string): string {
  return `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
}

function setInput(name: string, value: string): void {
  process.env[getInputName(name)] = value;
}
