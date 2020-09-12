import * as os from 'os';
import * as core from '@actions/core';

export const osPlat: string = os.platform();
export const osArch: string = os.arch();

export interface Inputs {
  version: string;
  driver: string;
  driverOpts: string[];
  buildkitdFlags: string;
  install: boolean;
  use: boolean;
  endpoint: string;
}

export async function getInputs(): Promise<Inputs> {
  return {
    version: core.getInput('version'),
    driver: core.getInput('driver') || 'docker-container',
    driverOpts: await getInputList('driver-opts', true),
    buildkitdFlags:
      core.getInput('buildkitd-flags') ||
      '--allow-insecure-entitlement security.insecure --allow-insecure-entitlement network.host',
    install: /true/i.test(core.getInput('install')),
    use: /true/i.test(core.getInput('use')),
    endpoint: core.getInput('endpoint')
  };
}

export async function getInputList(name: string, ignoreComma?: boolean): Promise<string[]> {
  const items = core.getInput(name);
  if (items == '') {
    return [];
  }
  return items
    .split(/\r?\n/)
    .filter(x => x)
    .reduce<string[]>(
      (acc, line) => acc.concat(!ignoreComma ? line.split(',').filter(x => x) : line).map(pat => pat.trim()),
      []
    );
}

export const asyncForEach = async (array, callback) => {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
};
