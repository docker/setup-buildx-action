import fs from 'fs';
import * as os from 'os';
import path from 'path';
import * as tmp from 'tmp';
import * as uuid from 'uuid';
import {parse} from 'csv-parse/sync';
import * as buildx from './buildx';
import * as nodes from './nodes';
import * as core from '@actions/core';

let _tmpDir: string;
export const osPlat: string = os.platform();
export const osArch: string = os.arch();

export function tmpDir(): string {
  if (!_tmpDir) {
    _tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docker-setup-buildx-')).split(path.sep).join(path.posix.sep);
  }
  return _tmpDir;
}

export function tmpNameSync(options?: tmp.TmpNameOptions): string {
  return tmp.tmpNameSync(options);
}

export interface Inputs {
  version: string;
  name: string;
  driver: string;
  driverOpts: string[];
  buildkitdFlags: string;
  platforms: string[];
  install: boolean;
  use: boolean;
  endpoint: string;
  config: string;
  configInline: string;
  append: string;
}

export async function getInputs(): Promise<Inputs> {
  return {
    version: core.getInput('version'),
    name: getBuilderName(core.getInput('driver') || 'docker-container'),
    driver: core.getInput('driver') || 'docker-container',
    driverOpts: await getInputList('driver-opts', true),
    buildkitdFlags: core.getInput('buildkitd-flags') || '--allow-insecure-entitlement security.insecure --allow-insecure-entitlement network.host',
    platforms: await getInputList('platforms', false, true),
    install: core.getBooleanInput('install'),
    use: core.getBooleanInput('use'),
    endpoint: core.getInput('endpoint'),
    config: core.getInput('config'),
    configInline: core.getInput('config-inline'),
    append: core.getInput('append')
  };
}

export function getBuilderName(driver: string): string {
  return driver == 'docker' ? 'default' : `builder-${uuid.v4()}`;
}

export async function getCreateArgs(inputs: Inputs, buildxVersion: string): Promise<Array<string>> {
  const args: Array<string> = ['create', '--name', inputs.name, '--driver', inputs.driver];
  if (buildx.satisfies(buildxVersion, '>=0.3.0')) {
    await asyncForEach(inputs.driverOpts, async driverOpt => {
      args.push('--driver-opt', driverOpt);
    });
    if (inputs.driver != 'remote' && inputs.buildkitdFlags) {
      args.push('--buildkitd-flags', inputs.buildkitdFlags);
    }
  }
  if (inputs.platforms.length > 0) {
    args.push('--platform', inputs.platforms.join(','));
  }
  if (inputs.use) {
    args.push('--use');
  }
  if (inputs.driver != 'remote') {
    if (inputs.config) {
      args.push('--config', await buildx.getConfigFile(inputs.config));
    } else if (inputs.configInline) {
      args.push('--config', await buildx.getConfigInline(inputs.configInline));
    }
  }
  if (inputs.endpoint) {
    args.push(inputs.endpoint);
  }
  return args;
}

export async function getAppendArgs(inputs: Inputs, node: nodes.Node, buildxVersion: string): Promise<Array<string>> {
  const args: Array<string> = ['create', '--name', inputs.name, '--append'];
  if (node.name) {
    args.push('--node', node.name);
  }
  if (node['driver-opts'] && buildx.satisfies(buildxVersion, '>=0.3.0')) {
    await asyncForEach(node['driver-opts'], async driverOpt => {
      args.push('--driver-opt', driverOpt);
    });
    if (inputs.driver != 'remote' && node['buildkitd-flags']) {
      args.push('--buildkitd-flags', node['buildkitd-flags']);
    }
  }
  if (node.platforms) {
    args.push('--platform', node.platforms);
  }
  if (node.endpoint) {
    args.push(node.endpoint);
  }
  return args;
}

export async function getInspectArgs(inputs: Inputs, buildxVersion: string): Promise<Array<string>> {
  const args: Array<string> = ['inspect', '--bootstrap'];
  if (buildx.satisfies(buildxVersion, '>=0.4.0')) {
    args.push('--builder', inputs.name);
  }
  return args;
}

export async function getInputList(name: string, ignoreComma?: boolean, escapeQuotes?: boolean): Promise<string[]> {
  const res: Array<string> = [];

  const items = core.getInput(name);
  if (items == '') {
    return res;
  }

  const records = parse(items, {
    columns: false,
    relaxQuotes: true,
    comment: '#',
    relaxColumnCount: true,
    skipEmptyLines: true,
    quote: escapeQuotes ? `"` : false
  });

  for (const record of records as Array<string[]>) {
    if (record.length == 1) {
      res.push(record[0]);
      continue;
    } else if (!ignoreComma) {
      res.push(...record);
      continue;
    }
    res.push(record.join(','));
  }

  return res.filter(item => item).map(pat => pat.trim());
}

export const asyncForEach = async (array, callback) => {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
};
