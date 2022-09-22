import {describe, expect, jest, test, beforeEach} from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as auth from '../src/auth';

const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'docker-setup-buildx-jest')).split(path.sep).join(path.posix.sep);
const dockerConfigHome = path.join(tmpdir, '.docker');
const credsdir = path.join(dockerConfigHome, 'buildx', 'creds');

describe('setCredentials', () => {
  beforeEach(() => {
    process.env = Object.keys(process.env).reduce((object, key) => {
      if (!key.startsWith(auth.envPrefix)) {
        object[key] = process.env[key];
      }
      return object;
    }, {});
  });

  // prettier-ignore
  test.each([
    [
      'mycontext',
      'docker-container',
      {},
      [],
      []
    ],
    [
      'docker-container://mycontainer',
      'docker-container',
      {},
      [],
      []
    ],
    [
      'tcp://graviton2:1234',
      'remote',
      {},
      [],
      []
    ],
    [
      'tcp://graviton2:1234',
      'remote',
      {
        'BUILDER_NODE_0_AUTH_TLS_CACERT': 'foo',
        'BUILDER_NODE_0_AUTH_TLS_CERT': 'foo',
        'BUILDER_NODE_0_AUTH_TLS_KEY': 'foo'
      },
      [
        path.join(credsdir, 'cacert_graviton2-1234.pem'),
        path.join(credsdir, 'cert_graviton2-1234.pem'),
        path.join(credsdir, 'key_graviton2-1234.pem')
      ],
      [
        `cacert=${path.join(credsdir, 'cacert_graviton2-1234.pem')}`,
        `cert=${path.join(credsdir, 'cert_graviton2-1234.pem')}`,
        `key=${path.join(credsdir, 'key_graviton2-1234.pem')}`
      ]
    ],
    [
      'tcp://graviton2:1234',
      'docker-container',
      {
        'BUILDER_NODE_0_AUTH_TLS_CACERT': 'foo',
        'BUILDER_NODE_0_AUTH_TLS_CERT': 'foo',
        'BUILDER_NODE_0_AUTH_TLS_KEY': 'foo'
      },
      [
        path.join(credsdir, 'cacert_graviton2-1234.pem'),
        path.join(credsdir, 'cert_graviton2-1234.pem'),
        path.join(credsdir, 'key_graviton2-1234.pem')
      ],
      []
    ],
  ])('given %p endpoint', async (endpoint: string, driver: string, envs: Record<string, string>, expectedFiles: Array<string>, expectedOpts: Array<string>) => {
    fs.mkdirSync(credsdir, {recursive: true});
    for (const [key, value] of Object.entries(envs)) {
      process.env[key] = value;
    }
    expect(auth.setCredentials(credsdir, 0, driver, endpoint)).toEqual(expectedOpts);
    expectedFiles.forEach( (file) => {
      expect(fs.existsSync(file)).toBe(true);
    });
  });
});
