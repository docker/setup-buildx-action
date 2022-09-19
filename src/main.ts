import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as auth from './auth';
import * as buildx from './buildx';
import * as context from './context';
import * as docker from './docker';
import * as stateHelper from './state-helper';
import * as util from './util';
import * as core from '@actions/core';
import * as exec from '@actions/exec';

async function run(): Promise<void> {
  try {
    const inputs: context.Inputs = await context.getInputs();
    const dockerConfigHome: string = process.env.DOCKER_CONFIG || path.join(os.homedir(), '.docker');

    // standalone if docker cli not available
    const standalone = !(await docker.isAvailable());
    stateHelper.setStandalone(standalone);

    core.startGroup(`Docker info`);
    if (standalone) {
      core.info(`Docker info skipped in standalone mode`);
    } else {
      await exec.exec('docker', ['version'], {
        failOnStdErr: false
      });
      await exec.exec('docker', ['info'], {
        failOnStdErr: false
      });
    }
    core.endGroup();

    if (util.isValidUrl(inputs.version)) {
      if (standalone) {
        throw new Error(`Cannot build from source without the Docker CLI`);
      }
      core.startGroup(`Build and install buildx`);
      await buildx.build(inputs.version, dockerConfigHome, standalone);
      core.endGroup();
    } else if (!(await buildx.isAvailable(standalone)) || inputs.version) {
      core.startGroup(`Download and install buildx`);
      await buildx.install(inputs.version || 'latest', standalone ? context.tmpDir() : dockerConfigHome, standalone);
      core.endGroup();
    }

    const buildxVersion = await buildx.getVersion(standalone);
    await core.group(`Buildx version`, async () => {
      const versionCmd = buildx.getCommand(['version'], standalone);
      await exec.exec(versionCmd.commandLine, versionCmd.args, {
        failOnStdErr: false
      });
    });

    context.setOutput('name', inputs.name);
    stateHelper.setBuilderName(inputs.name);

    const credsdir = path.join(dockerConfigHome, 'buildx', 'creds', inputs.name);
    fs.mkdirSync(credsdir, {recursive: true});
    stateHelper.setCredsDir(credsdir);

    if (inputs.driver !== 'docker') {
      core.startGroup(`Creating a new builder instance`);
      const authOpts = auth.setCredentials(credsdir, 0, inputs.driver, inputs.endpoint);
      if (authOpts.length > 0) {
        inputs.driverOpts = [...inputs.driverOpts, ...authOpts];
      }
      const createCmd = buildx.getCommand(await context.getCreateArgs(inputs, buildxVersion), standalone);
      await exec.exec(createCmd.commandLine, createCmd.args);
      core.endGroup();
    }

    core.startGroup(`Booting builder`);
    const inspectCmd = buildx.getCommand(await context.getInspectArgs(inputs, buildxVersion), standalone);
    await exec.exec(inspectCmd.commandLine, inspectCmd.args);
    core.endGroup();

    if (inputs.install) {
      if (standalone) {
        throw new Error(`Cannot set buildx as default builder without the Docker CLI`);
      }
      core.startGroup(`Setting buildx as default builder`);
      await exec.exec('docker', ['buildx', 'install']);
      core.endGroup();
    }

    core.startGroup(`Inspect builder`);
    const builder = await buildx.inspect(inputs.name, standalone);
    const firstNode = builder.nodes[0];
    core.info(JSON.stringify(builder, undefined, 2));
    context.setOutput('driver', builder.driver);
    context.setOutput('platforms', firstNode.platforms);
    context.setOutput('nodes', JSON.stringify(builder.nodes, undefined, 2));
    context.setOutput('endpoint', firstNode.endpoint); // TODO: deprecated, to be removed in a later version
    context.setOutput('status', firstNode.status); // TODO: deprecated, to be removed in a later version
    context.setOutput('flags', firstNode['buildkitd-flags']); // TODO: deprecated, to be removed in a later version
    core.endGroup();

    if (!standalone && builder.driver == 'docker-container') {
      stateHelper.setContainerName(`buildx_buildkit_${firstNode.name}`);
      core.startGroup(`BuildKit version`);
      for (const node of builder.nodes) {
        const bkvers = await buildx.getBuildKitVersion(`buildx_buildkit_${node.name}`);
        core.info(`${node.name}: ${bkvers}`);
      }
      core.endGroup();
    }
    if (core.isDebug() || firstNode['buildkitd-flags']?.includes('--debug')) {
      stateHelper.setDebug('true');
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function cleanup(): Promise<void> {
  if (stateHelper.IsDebug && stateHelper.containerName.length > 0) {
    core.startGroup(`BuildKit container logs`);
    await exec
      .getExecOutput('docker', ['logs', `${stateHelper.containerName}`], {
        ignoreReturnCode: true
      })
      .then(res => {
        if (res.stderr.length > 0 && res.exitCode != 0) {
          core.warning(res.stderr.trim());
        }
      });
    core.endGroup();
  }

  if (stateHelper.builderName.length > 0) {
    core.startGroup(`Removing builder`);
    const rmCmd = buildx.getCommand(['rm', stateHelper.builderName], /true/i.test(stateHelper.standalone));
    await exec
      .getExecOutput(rmCmd.commandLine, rmCmd.args, {
        ignoreReturnCode: true
      })
      .then(res => {
        if (res.stderr.length > 0 && res.exitCode != 0) {
          core.warning(res.stderr.trim());
        }
      });
    core.endGroup();
  }

  if (stateHelper.credsDir.length > 0 && fs.existsSync(stateHelper.credsDir)) {
    core.info(`Cleaning up credentials`);
    fs.rmdirSync(stateHelper.credsDir, {recursive: true});
  }
}

if (!stateHelper.IsPost) {
  run();
} else {
  cleanup();
}
