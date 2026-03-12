import * as crypto from 'crypto';
import * as core from '@actions/core';

import * as TOML from '@iarna/toml';

import {Docker} from '@docker/actions-toolkit/lib/docker/docker';
import {Util} from '@docker/actions-toolkit/lib/util';
import {Toolkit} from '@docker/actions-toolkit/lib/toolkit';

import {Node} from '@docker/actions-toolkit/lib/types/buildx/builder';
import path from 'path';
import * as fs from 'fs';

export const builderNodeEnvPrefix = 'BUILDER_NODE';
const defaultBuildkitdFlags = '--allow-insecure-entitlement security.insecure --allow-insecure-entitlement network.host';

export interface Inputs {
  buildpulseBuilder: string;
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
}

export async function getInputs(): Promise<Inputs> {
  return {
    buildpulseBuilder: core.getInput('buildpulse-builder'),
    version: core.getInput('version'),
    name: core.getInput('name') || (await getBuilderName(core.getInput('driver') || 'docker-container')),
    driver: core.getInput('driver') || 'docker-container',
    driverOpts: Util.getInputList('driver-opts', {ignoreComma: true, quote: false}),
    buildkitdFlags: core.getInput('buildkitd-flags'),
    platforms: Util.getInputList('platforms'),
    install: core.getBooleanInput('install'),
    use: core.getBooleanInput('use'),
    endpoint: core.getInput('endpoint'),
    buildkitdConfig: core.getInput('buildkitd-config') || core.getInput('config'),
    buildkitdConfigInline: core.getInput('buildkitd-config-inline') || core.getInput('config-inline'),
    append: core.getInput('append'),
    cacheBinary: core.getBooleanInput('cache-binary'),
    cleanup: core.getBooleanInput('cleanup')
  };
}

export async function getBuilderName(driver: string): Promise<string> {
  return driver == 'docker' ? await Docker.context() : `builder-${crypto.randomUUID()}`;
}

export async function getCreateArgs(inputs: Inputs, toolkit: Toolkit): Promise<Array<string>> {
  const remoteBuilderEnabled = inputs.buildpulseBuilder && inputs.buildpulseBuilder.length > 0;

  // if remote builder is enabled, use 'kubernetes' driver
  const driverInput = remoteBuilderEnabled ? 'kubernetes' : inputs.driver;
  const args: Array<string> = ['create', '--name', inputs.name, '--driver', driverInput];
  if (await toolkit.buildx.versionSatisfies('>=0.3.0')) {
    await Util.asyncForEach(inputs.driverOpts, async (driverOpt: string) => {
      args.push('--driver-opt', driverOpt);
    });

    // if remote builder is enabled, specify which runner type to use
    if (remoteBuilderEnabled) {
      const arch = inputs.buildpulseBuilder.includes('arm64') ? 'arm64' : 'x64';
      const remoteBuilderDriverOpt = `nodeselector=eks.amazonaws.com/nodegroup=eks-nodegroup-${inputs.buildpulseBuilder},namespace=${inputs.buildpulseBuilder},image=796224758921.dkr.ecr.us-east-1.amazonaws.com/moby/buildkit:buildx-stable-1-${arch}`;
      args.push('--driver-opt', remoteBuilderDriverOpt);
    }

    if (inputs.buildkitdFlags) {
      args.push('--buildkitd-flags', inputs.buildkitdFlags);
    } else if (driverSupportsBuildkitdFlags(inputs.driver)) {
      args.push('--buildkitd-flags', defaultBuildkitdFlags);
    }
  }
  if (inputs.platforms.length > 0) {
    args.push('--platform', inputs.platforms.join(','));
  }
  if (inputs.use) {
    args.push('--use');
  }

  // modify BuildKit config to include local registry
  if (inputs.buildkitdConfig) {
    const newBuildkitConfigPath = await addClusterLocalRegistryConfigFile(inputs.buildkitdConfig);

    args.push('--config', toolkit.buildkit.config.resolveFromFile(newBuildkitConfigPath));
  } else {
    const startingConfig = inputs.buildkitdConfigInline || '';
    const newBuildKitToml = addClusterLocalRegistryConfig(startingConfig);

    args.push('--config', toolkit.buildkit.config.resolveFromString(newBuildKitToml));
  }

  if (inputs.endpoint) {
    args.push(inputs.endpoint);
  }
  return args;
}

async function addClusterLocalRegistryConfigFile(buildkitConfigPath: string): Promise<string> {
  const configDir = path.dirname(buildkitConfigPath);
  const newBuildkitConfigPath = path.join(configDir, 'buildpulse_buildkit.toml');

  const buildkitConfigContent = await fs.promises.readFile(buildkitConfigPath, 'utf-8');
  const newBuildkitConfigContent = addClusterLocalRegistryConfig(buildkitConfigContent);
  await fs.promises.writeFile(newBuildkitConfigPath, newBuildkitConfigContent);

  return newBuildkitConfigPath;
}

function addClusterLocalRegistryConfig(buildkitConfig: string): string {
  const inlineToml = TOML.parse(buildkitConfig);
  if (!inlineToml['registry']) {
    inlineToml['registry'] = {};
  }

  const buildpulseDockerRegistry = process.env.BP_DOCKER_REGISTRY;
  if (buildpulseDockerRegistry && buildpulseDockerRegistry.length && !inlineToml['registry'][buildpulseDockerRegistry]) {
    inlineToml['registry'][buildpulseDockerRegistry] = {
      http: true,
      insecure: true
    };
  }

  const dockerhubProxy = process.env.BP_DOCKERHUB_PROXY;
  if (dockerhubProxy && dockerhubProxy.length) {
    if (!inlineToml['registry']['docker.io']) {
      inlineToml['registry']['docker.io'] = {};
    }
    inlineToml['registry']['docker.io']['mirrors'] = [dockerhubProxy];

    if (!inlineToml['registry'][dockerhubProxy]) {
      inlineToml['registry'][dockerhubProxy] = {};
    }
    inlineToml['registry'][dockerhubProxy]['http'] = true;
    inlineToml['registry'][dockerhubProxy]['insecure'] = true;
  }

  return TOML.stringify(inlineToml);
}

export async function getAppendArgs(inputs: Inputs, node: Node, toolkit: Toolkit): Promise<Array<string>> {
  const args: Array<string> = ['create', '--name', inputs.name, '--append'];
  if (node.name) {
    args.push('--node', node.name);
  } else if (inputs.driver == 'kubernetes' && (await toolkit.buildx.versionSatisfies('<0.11.0'))) {
    args.push('--node', `node-${crypto.randomUUID()}`);
  }
  if (node['driver-opts'] && (await toolkit.buildx.versionSatisfies('>=0.3.0'))) {
    await Util.asyncForEach(node['driver-opts'], async (driverOpt: string) => {
      args.push('--driver-opt', driverOpt);
    });
    if (node['buildkitd-flags']) {
      args.push('--buildkitd-flags', node['buildkitd-flags']);
    } else if (driverSupportsBuildkitdFlags(inputs.driver)) {
      args.push('--buildkitd-flags', defaultBuildkitdFlags);
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

function driverSupportsBuildkitdFlags(driver: string): boolean {
  return driver == '' || driver == 'docker-container' || driver == 'docker' || driver == 'kubernetes';
}

export function getVersion(inputs: Inputs): string {
  const version = inputs.version;
  if (inputs.driver === 'cloud') {
    if (!version || version === 'latest') {
      return 'cloud:latest';
    }
    if (version.startsWith('cloud:') || version.startsWith('lab:')) {
      return version;
    }
    return `cloud:${version}`;
  }
  return version;
}
