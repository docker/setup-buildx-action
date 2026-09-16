import * as crypto from 'crypto';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as core from '@actions/core';
import * as actionsToolkit from '@docker/actions-toolkit';

import {Buildx} from '@docker/actions-toolkit/lib/buildx/buildx.js';
import {Builder} from '@docker/actions-toolkit/lib/buildx/builder.js';
import {Docker} from '@docker/actions-toolkit/lib/docker/docker.js';
import {Exec} from '@docker/actions-toolkit/lib/exec.js';
import {Toolkit} from '@docker/actions-toolkit/lib/toolkit.js';
import {Util} from '@docker/actions-toolkit/lib/util.js';

import {Node} from '@docker/actions-toolkit/lib/types/buildx/builder.js';
import {ContextInfo} from '@docker/actions-toolkit/lib/types/docker/docker.js';

import * as context from './context.js';
import * as stateHelper from './state-helper.js';

actionsToolkit.run(
  // main
  async () => {
    const inputs: context.Inputs = await context.getInputs();
    stateHelper.setCleanup(inputs.cleanup);

    const toolkit = new Toolkit();
    const standalone = await toolkit.buildx.isStandalone();
    stateHelper.setStandalone(standalone);

    if (inputs.keepState && inputs.driver !== 'docker-container') {
      // https://docs.docker.com/reference/cli/docker/buildx/rm/#keep-state
      throw new Error(`Cannot use keep-state with ${inputs.driver} driver`);
    }
    stateHelper.setKeepState(inputs.keepState);

    await core.group(`Docker info`, async () => {
      try {
        await Docker.printVersion();
        await Docker.printInfo();
      } catch (e) {
        core.info(e.message);
      }
    });

    let toolPath;
    if (Util.isValidRef(inputs.version)) {
      if (standalone) {
        throw new Error(`Cannot build from source without the Docker CLI`);
      }
      await core.group(`Build buildx from source`, async () => {
        toolPath = await toolkit.buildxInstall.build(inputs.version, !inputs.cacheBinary);
      });
    } else if (!(await toolkit.buildx.isAvailable()) || inputs.version || (inputs.driver === 'cloud' && !inputs.version && !(await toolkit.buildx.versionSatisfies('>=0.37.0-0')))) {
      await core.group(`Download buildx from GitHub Releases`, async () => {
        toolPath = await toolkit.buildxInstall.download({
          version: inputs.version || 'latest',
          ghaNoCache: !inputs.cacheBinary
        });
      });
    }
    if (toolPath) {
      await core.group(`Install buildx`, async () => {
        if (standalone) {
          await toolkit.buildxInstall.installStandalone(toolPath);
        } else {
          await toolkit.buildxInstall.installPlugin(toolPath);
        }
      });
    }

    await core.group(`Buildx version`, async () => {
      await toolkit.buildx.printVersion();
    });

    core.setOutput('name', inputs.name);
    stateHelper.setBuilderName(inputs.name);
    stateHelper.setBuilderDriver(inputs.driver);

    fs.mkdirSync(Buildx.certsDir, {recursive: true});
    stateHelper.setCertsDir(Buildx.certsDir);

    // if the default context has TLS data loaded and endpoint is not set, then
    // we create a temporary docker context only if driver is docker-container
    // https://github.com/docker/buildx/blob/b96ad59f64d40873e4959336d294b648bb3937fe/builder/builder.go#L489
    // https://github.com/docker/setup-buildx-action/issues/105
    if (!standalone && inputs.driver == 'docker-container' && (await Docker.context()) == 'default' && inputs.endpoint.length == 0) {
      let defaultContextWithTLS: boolean = false;
      await core.group(`Inspecting default docker context`, async () => {
        await Docker.getExecOutput(['context', 'inspect', '--format=json', 'default'], {
          ignoreReturnCode: true,
          silent: true
        }).then(res => {
          if (res.exitCode != 0) {
            core.info(`Cannot inspect default docker context: ${Docker.getErrorMessage(res.stderr)}`);
          } else {
            try {
              const contextInfo = (<Array<ContextInfo>>JSON.parse(res.stdout.trim()))[0];
              core.info(JSON.stringify(JSON.parse(res.stdout.trim()), undefined, 2));
              const hasTLSData = Object.keys(contextInfo.Endpoints).length > 0 && Object.values(contextInfo.Endpoints)[0].TLSData !== undefined;
              const hasTLSMaterial = Object.keys(contextInfo.TLSMaterial).length > 0 && Object.values(contextInfo.TLSMaterial)[0].length > 0;
              defaultContextWithTLS = hasTLSData || hasTLSMaterial;
            } catch (e) {
              core.info(`Unable to parse default docker context info: ${e}`);
              core.info(res.stdout.trim());
            }
          }
        });
      });
      if (defaultContextWithTLS) {
        const tmpDockerContext = `buildx-${crypto.randomUUID()}`;
        await core.group(`Creating temp docker context (TLS data loaded in default one)`, async () => {
          await Docker.getExecOutput(['context', 'create', tmpDockerContext], {
            ignoreReturnCode: true
          }).then(res => {
            if (res.exitCode != 0) {
              core.warning(`Cannot create docker context ${tmpDockerContext}: ${Docker.getErrorMessage(res.stderr)}`);
            } else {
              core.info(`Setting builder endpoint to ${tmpDockerContext} context`);
              inputs.endpoint = tmpDockerContext;
              stateHelper.setTmpDockerContext(tmpDockerContext);
            }
          });
        });
      }
    }

    let builderExists = false;
    if (inputs.driver !== 'docker') {
      builderExists = await toolkit.builder.exists(inputs.name);
    }

    const appendNodes = inputs.append ? (yaml.load(inputs.append) as Node[]) : [];

    if (!standalone && inputs.driver == 'docker-container') {
      const buildkitImages = new Set<string>();
      if (!builderExists && !inputs.endpoint) {
        buildkitImages.add(resolveBuildKitImage(inputs.driverOpts));
      }
      for (const node of appendNodes) {
        if (!node.endpoint) {
          buildkitImages.add(resolveBuildKitImage(node['driver-opts']));
        }
      }
      if (buildkitImages.size > 0) {
        await core.group(`Pulling BuildKit image(s)`, async () => {
          for (const image of buildkitImages) {
            await Docker.pull(image);
          }
        });
      }
    }

    if (inputs.driver !== 'docker') {
      await core.group(`Creating a new builder instance`, async () => {
        if (builderExists) {
          core.info(`Builder ${inputs.name} already exists, skipping creation`);
        } else {
          const certsDriverOpts = Buildx.resolveCertsDriverOpts(inputs.driver, inputs.endpoint, {
            cacert: process.env[`${context.builderNodeEnvPrefix}_0_AUTH_TLS_CACERT`],
            cert: process.env[`${context.builderNodeEnvPrefix}_0_AUTH_TLS_CERT`],
            key: process.env[`${context.builderNodeEnvPrefix}_0_AUTH_TLS_KEY`]
          });
          if (certsDriverOpts.length > 0) {
            inputs.driverOpts = [...inputs.driverOpts, ...certsDriverOpts];
          }
          const createCmd = await toolkit.buildx.getCommand(await context.getCreateArgs(inputs, toolkit));
          await Exec.getExecOutput(createCmd.command, createCmd.args, {
            ignoreReturnCode: true
          }).then(res => {
            if (res.exitCode != 0) {
              throw new Error(`Failed to create builder ${inputs.name}: ${Buildx.getErrorMessage(res.stderr)}`);
            }
          });
        }
      });
    }

    if (appendNodes.length > 0) {
      await core.group(`Appending node(s) to builder`, async () => {
        let nodeIndex = 1;
        for (const node of appendNodes) {
          const certsDriverOpts = Buildx.resolveCertsDriverOpts(inputs.driver, `${node.endpoint}`, {
            cacert: process.env[`${context.builderNodeEnvPrefix}_${nodeIndex}_AUTH_TLS_CACERT`],
            cert: process.env[`${context.builderNodeEnvPrefix}_${nodeIndex}_AUTH_TLS_CERT`],
            key: process.env[`${context.builderNodeEnvPrefix}_${nodeIndex}_AUTH_TLS_KEY`]
          });
          if (certsDriverOpts.length > 0) {
            node['driver-opts'] = [...(node['driver-opts'] || []), ...certsDriverOpts];
          }
          const appendCmd = await toolkit.buildx.getCommand(await context.getAppendArgs(inputs, node, toolkit));
          await Exec.getExecOutput(appendCmd.command, appendCmd.args, {
            ignoreReturnCode: true
          }).then(res => {
            if (res.exitCode != 0) {
              throw new Error(`Failed to append node ${node.name}: ${Buildx.getErrorMessage(res.stderr)}`);
            }
          });
          nodeIndex++;
        }
      });
    }

    await core.group(`Booting builder`, async () => {
      const inspectCmd = await toolkit.buildx.getCommand(await context.getInspectArgs(inputs, toolkit));
      await Exec.getExecOutput(inspectCmd.command, inspectCmd.args, {
        ignoreReturnCode: true
      }).then(res => {
        if (res.exitCode != 0) {
          throw new Error(`Failed to boot builder: ${Buildx.getErrorMessage(res.stderr)}`);
        }
      });
    });

    const builderInspect = await toolkit.builder.inspect(inputs.name);
    const firstNode = builderInspect.nodes[0];

    await core.group(`Inspect builder`, async () => {
      const reducedPlatforms: Array<string> = [];
      for (const node of builderInspect.nodes) {
        for (const platform of node.platforms?.split(',') || []) {
          if (reducedPlatforms.indexOf(platform) > -1) {
            continue;
          }
          reducedPlatforms.push(platform);
        }
      }
      core.info(JSON.stringify(builderInspect, undefined, 2));
      core.setOutput('driver', builderInspect.driver);
      core.setOutput('platforms', reducedPlatforms.join(','));
      core.setOutput('nodes', JSON.stringify(builderInspect.nodes, undefined, 2));
    });

    if (!standalone && builderInspect.driver == 'docker-container') {
      stateHelper.setContainerName(`${Buildx.containerNamePrefix}${firstNode.name}`);
      await core.group(`BuildKit version`, async () => {
        for (const node of builderInspect.nodes) {
          const buildkitVersion = await toolkit.buildkit.getVersion(node);
          core.info(`${node.name}: ${buildkitVersion}`);
        }
      });
    }
    if (core.isDebug() || firstNode['buildkitd-flags']?.includes('--debug')) {
      stateHelper.setDebug('true');
    }
  },
  // post
  async () => {
    if (stateHelper.IsDebug && stateHelper.containerName.length > 0) {
      await core.group(`BuildKit container logs`, async () => {
        await Docker.getExecOutput(['logs', `${stateHelper.containerName}`], {
          ignoreReturnCode: true
        }).then(res => {
          if (res.exitCode != 0) {
            core.warning(`Failed to display BuildKit logs: ${Docker.getErrorMessage(res.stderr)}`);
          }
        });
      });
    }

    if (!stateHelper.cleanup) {
      return;
    }

    if (stateHelper.builderDriver != 'docker' && stateHelper.builderName.length > 0) {
      await core.group(`Removing builder`, async () => {
        const buildx = new Buildx({standalone: stateHelper.standalone});
        const builder = new Builder({buildx: buildx});
        if (await builder.exists(stateHelper.builderName)) {
          const rmCmd = await buildx.getCommand(['rm', stateHelper.builderName, ...(stateHelper.keepState ? ['--keep-state'] : [])]);
          await Exec.getExecOutput(rmCmd.command, rmCmd.args, {
            ignoreReturnCode: true
          }).then(res => {
            if (res.exitCode != 0) {
              core.warning(`Failed to remove builder ${stateHelper.builderName}: ${Buildx.getErrorMessage(res.stderr)}`);
            }
          });
        } else {
          core.info(`${stateHelper.builderName} does not exist`);
        }
      });
    }

    if (stateHelper.tmpDockerContext) {
      await core.group(`Removing temp docker context`, async () => {
        await Exec.getExecOutput('docker', ['context', 'rm', '-f', stateHelper.tmpDockerContext], {
          ignoreReturnCode: true
        }).then(res => {
          if (res.exitCode != 0) {
            core.warning(`Failed to remove temp docker context ${stateHelper.tmpDockerContext}: ${Docker.getErrorMessage(res.stderr)}`);
          }
        });
      });
    }

    if (stateHelper.certsDir.length > 0 && fs.existsSync(stateHelper.certsDir)) {
      await core.group(`Cleaning up certificates`, async () => {
        fs.rmSync(stateHelper.certsDir, {recursive: true});
      });
    }
  }
);

function resolveBuildKitImage(driverOpts: string[] = []): string {
  return (
    driverOpts
      .find(driverOpt => driverOpt.trim().startsWith('image='))
      ?.trim()
      .substring('image='.length) || 'moby/buildkit:buildx-stable-1'
  );
}
