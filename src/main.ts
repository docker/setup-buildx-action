import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import * as buildx from './buildx';
import * as context from './context';
import * as mexec from './exec';
import * as stateHelper from './state-helper';

async function run(): Promise<void> {
  try {
    if (os.platform() !== 'linux') {
      core.setFailed('Only supported on linux platform');
      return;
    }

    const inputs: context.Inputs = await context.getInputs();
    const dockerConfigHome: string = process.env.DOCKER_CONFIG || path.join(os.homedir(), '.docker');

    if (!(await buildx.isAvailable()) || inputs.version) {
      await buildx.install(inputs.version || 'latest', dockerConfigHome);
    }

    const buildxVersion = await buildx.getVersion();
    core.info(`📣 Buildx version: ${buildxVersion}`);

    const builderName: string =
      inputs.driver == 'docker' ? 'default' : `builder-${process.env.GITHUB_JOB}-${(await buildx.countBuilders()) + 1}`;
    core.setOutput('name', builderName);
    stateHelper.setBuilderName(builderName);

    if (inputs.driver !== 'docker') {
      core.info('🔨 Creating a new builder instance...');
      let createArgs: Array<string> = ['buildx', 'create', '--name', builderName, '--driver', inputs.driver];
      if (semver.satisfies(buildxVersion, '>=0.3.0')) {
        let hasImageDriverOpt: boolean = false;
        await context.asyncForEach(inputs.driverOpts, async driverOpt => {
          if (driverOpt.startsWith('image=')) {
            hasImageDriverOpt = true;
          }
          createArgs.push('--driver-opt', driverOpt);
        });
        if (!hasImageDriverOpt) {
          //FIXME: Temporary fix (docker/build-push-action#154, docker/build-push-action#162)
          createArgs.push('--driver-opt', 'image=moby/buildkit:v0.8-beta');
        }
        if (inputs.buildkitdFlags) {
          createArgs.push('--buildkitd-flags', inputs.buildkitdFlags);
        }
      }
      if (inputs.use) {
        createArgs.push('--use');
      }
      if (inputs.endpoint) {
        createArgs.push(inputs.endpoint);
      }
      await exec.exec('docker', createArgs);

      core.info('🏃 Booting builder...');
      await exec.exec('docker', ['buildx', 'inspect', '--bootstrap']);
    }

    if (inputs.install) {
      core.info('🤝 Setting buildx as default builder...');
      await exec.exec('docker', ['buildx', 'install']);
    }

    core.info('🛒 Extracting available platforms...');
    const platforms = await buildx.platforms();
    core.info(`${platforms}`);
    core.setOutput('platforms', platforms);
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function cleanup(): Promise<void> {
  if (stateHelper.builderName.length == 0) {
    return;
  }
  await mexec.exec('docker', ['buildx', 'rm', `${stateHelper.builderName}`], false).then(res => {
    if (res.stderr != '' && !res.success) {
      core.warning(res.stderr);
    }
  });
}

if (!stateHelper.IsPost) {
  run();
} else {
  cleanup();
}
