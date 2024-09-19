import * as uuid from 'uuid';
import * as core from '@actions/core';

import {Util} from '@docker/actions-toolkit/lib/util';
import {Toolkit} from '@docker/actions-toolkit/lib/toolkit';

import {Node} from '@docker/actions-toolkit/lib/types/buildx/builder';

export const builderNodeEnvPrefix = 'BUILDER_NODE';

export interface Inputs {
  version: string;
  name: string;
  driver: string;
  driverOpts: string[];
  buildkitdFlags: string;
  buildkitdConfig: string;
  buildkitdConfigInline: string;
  platforms: string[];
  install: boolean;
  use: boolean;
  endpoint: string;
  append: string;
  cacheBinary: boolean;
  cleanup: boolean;
  keepState: boolean;
}

export async function getInputs(): Promise<Inputs> {
  return {
    version: core.getInput('version'),
    name: getBuilderName(core.getInput('name'), core.getInput('driver') || 'docker-container'),
    driver: core.getInput('driver') || 'docker-container',
    driverOpts: Util.getInputList('driver-opts', {ignoreComma: true, quote: false}),
    buildkitdFlags: core.getInput('buildkitd-flags') || '--allow-insecure-entitlement security.insecure --allow-insecure-entitlement network.host',
    platforms: Util.getInputList('platforms'),
    install: core.getBooleanInput('install'),
    use: core.getBooleanInput('use'),
    endpoint: core.getInput('endpoint'),
    buildkitdConfig: core.getInput('buildkitd-config') || core.getInput('config'),
    buildkitdConfigInline: core.getInput('buildkitd-config-inline') || core.getInput('config-inline'),
    append: core.getInput('append'),
    cacheBinary: core.getBooleanInput('cache-binary'),
    cleanup: core.getBooleanInput('cleanup'),
    keepState: core.getBooleanInput('keep-state')
  };
}

export function getBuilderName(name: string, driver: string): string {
  if (name) {
    return name;
  }

  return driver == 'docker' ? 'default' : `builder-${uuid.v4()}`;
}

export async function getCreateArgs(inputs: Inputs, toolkit: Toolkit): Promise<Array<string>> {
  const args: Array<string> = ['create', '--name', inputs.name, '--driver', inputs.driver];
  if (await toolkit.buildx.versionSatisfies('>=0.3.0')) {
    await Util.asyncForEach(inputs.driverOpts, async driverOpt => {
      args.push('--driver-opt', driverOpt);
    });
    if (driverSupportsFlags(inputs.driver) && inputs.buildkitdFlags) {
      args.push('--buildkitd-flags', inputs.buildkitdFlags);
    }
  }
  if (inputs.platforms.length > 0) {
    args.push('--platform', inputs.platforms.join(','));
  }
  if (inputs.use) {
    args.push('--use');
  }
  if (driverSupportsFlags(inputs.driver)) {
    if (inputs.buildkitdConfig) {
      args.push('--config', toolkit.buildkit.config.resolveFromFile(inputs.buildkitdConfig));
    } else if (inputs.buildkitdConfigInline) {
      args.push('--config', toolkit.buildkit.config.resolveFromString(inputs.buildkitdConfigInline));
    }
  }
  if (inputs.endpoint) {
    args.push(inputs.endpoint);
  }
  return args;
}

export async function getAppendArgs(inputs: Inputs, node: Node, toolkit: Toolkit): Promise<Array<string>> {
  const args: Array<string> = ['create', '--name', inputs.name, '--append'];
  if (node.name) {
    args.push('--node', node.name);
  } else if (inputs.driver == 'kubernetes' && (await toolkit.buildx.versionSatisfies('<0.11.0'))) {
    args.push('--node', `node-${uuid.v4()}`);
  }
  if (node['driver-opts'] && (await toolkit.buildx.versionSatisfies('>=0.3.0'))) {
    await Util.asyncForEach(node['driver-opts'], async driverOpt => {
      args.push('--driver-opt', driverOpt);
    });
    if (driverSupportsFlags(inputs.driver) && node['buildkitd-flags']) {
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

export async function getInspectArgs(inputs: Inputs, toolkit: Toolkit): Promise<Array<string>> {
  const args: Array<string> = ['inspect', '--bootstrap'];
  if (await toolkit.buildx.versionSatisfies('>=0.4.0')) {
    args.push('--builder', inputs.name);
  }
  return args;
}

function driverSupportsFlags(driver: string): boolean {
  return driver == '' || driver == 'docker-container' || driver == 'docker' || driver == 'kubernetes';
}
