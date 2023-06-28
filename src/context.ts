import * as uuid from 'uuid';
import * as core from '@actions/core';
import {Docker} from '@docker/actions-toolkit/lib/docker/docker';
import {Util} from '@docker/actions-toolkit/lib/util';
import {Toolkit} from '@docker/actions-toolkit/lib/toolkit';
import {Node} from '@docker/actions-toolkit/lib/types/builder';

export const builderNodeEnvPrefix = 'BUILDER_NODE';

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
  cleanup: boolean;
}

export async function getInputs(): Promise<Inputs> {
  return {
    version: core.getInput('version'),
    name: await getBuilderName(core.getInput('driver') || 'docker-container'),
    driver: core.getInput('driver') || 'docker-container',
    driverOpts: Util.getInputList('driver-opts', {ignoreComma: true, quote: false}),
    buildkitdFlags: core.getInput('buildkitd-flags') || '--allow-insecure-entitlement security.insecure --allow-insecure-entitlement network.host',
    platforms: Util.getInputList('platforms'),
    install: core.getBooleanInput('install'),
    use: core.getBooleanInput('use'),
    endpoint: core.getInput('endpoint'),
    config: core.getInput('config'),
    configInline: core.getInput('config-inline'),
    append: core.getInput('append'),
    cleanup: core.getBooleanInput('cleanup')
  };
}

export async function getBuilderName(driver: string): Promise<string> {
  return driver == 'docker' ? await Docker.context() : `builder-${uuid.v4()}`;
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
    if (inputs.config) {
      args.push('--config', toolkit.buildkit.config.resolveFromFile(inputs.config));
    } else if (inputs.configInline) {
      args.push('--config', toolkit.buildkit.config.resolveFromString(inputs.configInline));
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
