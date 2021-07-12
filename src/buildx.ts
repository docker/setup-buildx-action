import * as fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';
import * as util from 'util';
import * as context from './context';
import * as git from './git';
import * as github from './github';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as tc from '@actions/tool-cache';

export type Builder = {
  name?: string;
  driver?: string;
  node_name?: string;
  node_endpoint?: string;
  node_status?: string;
  node_flags?: string;
  node_platforms?: string;
};

export async function isAvailable(): Promise<Boolean> {
  return await exec
    .getExecOutput('docker', ['buildx'], {
      ignoreReturnCode: true,
      silent: true
    })
    .then(res => {
      if (res.stderr.length > 0 && res.exitCode != 0) {
        return false;
      }
      return res.exitCode == 0;
    });
}

export async function getVersion(): Promise<string> {
  return await exec
    .getExecOutput('docker', ['buildx', 'version'], {
      ignoreReturnCode: true,
      silent: true
    })
    .then(res => {
      if (res.stderr.length > 0 && res.exitCode != 0) {
        throw new Error(res.stderr.trim());
      }
      return parseVersion(res.stdout.trim());
    });
}

export function parseVersion(stdout: string): string {
  const matches = /\sv?([0-9a-f]{7}|[0-9.]+)/.exec(stdout);
  if (!matches) {
    throw new Error(`Cannot parse buildx version`);
  }
  return matches[1];
}

export function satisfies(version: string, range: string): boolean {
  return semver.satisfies(version, range) || /^[0-9a-f]{7}$/.exec(version) !== null;
}

export async function inspect(name: string): Promise<Builder> {
  return await exec
    .getExecOutput(`docker`, ['buildx', 'inspect', name], {
      ignoreReturnCode: true,
      silent: true
    })
    .then(res => {
      if (res.stderr.length > 0 && res.exitCode != 0) {
        throw new Error(res.stderr.trim());
      }
      const builder: Builder = {};
      itlines: for (const line of res.stdout.trim().split(`\n`)) {
        const [key, ...rest] = line.split(':');
        const value = rest.map(v => v.trim()).join(':');
        if (key.length == 0 || value.length == 0) {
          continue;
        }
        switch (key) {
          case 'Name': {
            if (builder.name == undefined) {
              builder.name = value;
            } else {
              builder.node_name = value;
            }
            break;
          }
          case 'Driver': {
            builder.driver = value;
            break;
          }
          case 'Endpoint': {
            builder.node_endpoint = value;
            break;
          }
          case 'Status': {
            builder.node_status = value;
            break;
          }
          case 'Flags': {
            builder.node_flags = value;
            break;
          }
          case 'Platforms': {
            builder.node_platforms = value.replace(/\s/g, '');
            break itlines;
          }
        }
      }
      return builder;
    });
}

export async function build(inputBuildRef: string, dockerConfigHome: string): Promise<string> {
  let [repo, ref] = inputBuildRef.split('#');
  if (ref.length == 0) {
    ref = 'master';
  }

  let vspec: string;
  if (ref.match(/^[0-9a-fA-F]{40}$/)) {
    vspec = ref;
  } else {
    vspec = await git.getRemoteSha(repo, ref);
  }
  core.debug(`Tool version spec ${vspec}`);

  let toolPath: string;
  toolPath = tc.find('buildx', vspec);
  if (!toolPath) {
    const outFolder = path.join(context.tmpDir(), 'out').split(path.sep).join(path.posix.sep);
    toolPath = await exec
      .getExecOutput('docker', ['buildx', 'build', '--target', 'binaries', '--build-arg', 'BUILDKIT_CONTEXT_KEEP_GIT_DIR=1', '--output', `type=local,dest=${outFolder}`, inputBuildRef], {
        ignoreReturnCode: true
      })
      .then(res => {
        if (res.stderr.length > 0 && res.exitCode != 0) {
          core.warning(res.stderr.trim());
        }
        return tc.cacheFile(`${outFolder}/buildx`, context.osPlat == 'win32' ? 'docker-buildx.exe' : 'docker-buildx', 'buildx', vspec);
      });
  }

  return setPlugin(toolPath, dockerConfigHome);
}

export async function install(inputVersion: string, dockerConfigHome: string): Promise<string> {
  const release: github.GitHubRelease | null = await github.getRelease(inputVersion);
  if (!release) {
    throw new Error(`Cannot find buildx ${inputVersion} release`);
  }
  core.debug(`Release ${release.tag_name} found`);
  const version = release.tag_name.replace(/^v+|v+$/g, '');

  let toolPath: string;
  toolPath = tc.find('buildx', version);
  if (!toolPath) {
    const c = semver.clean(version) || '';
    if (!semver.valid(c)) {
      throw new Error(`Invalid Buildx version "${version}".`);
    }
    toolPath = await download(version);
  }

  return setPlugin(toolPath, dockerConfigHome);
}

async function setPlugin(toolPath: string, dockerConfigHome: string): Promise<string> {
  const pluginsDir: string = path.join(dockerConfigHome, 'cli-plugins');
  core.debug(`Plugins dir is ${pluginsDir}`);
  if (!fs.existsSync(pluginsDir)) {
    fs.mkdirSync(pluginsDir, {recursive: true});
  }

  const filename: string = context.osPlat == 'win32' ? 'docker-buildx.exe' : 'docker-buildx';
  const pluginPath: string = path.join(pluginsDir, filename);
  core.debug(`Plugin path is ${pluginPath}`);
  fs.copyFileSync(path.join(toolPath, filename), pluginPath);

  core.info('Fixing perms');
  fs.chmodSync(pluginPath, '0755');

  return pluginPath;
}

async function download(version: string): Promise<string> {
  const targetFile: string = context.osPlat == 'win32' ? 'docker-buildx.exe' : 'docker-buildx';
  const downloadUrl = util.format('https://github.com/docker/buildx/releases/download/v%s/%s', version, await filename(version));
  let downloadPath: string;

  try {
    core.info(`Downloading ${downloadUrl}`);
    downloadPath = await tc.downloadTool(downloadUrl);
    core.debug(`Downloaded to ${downloadPath}`);
  } catch (error) {
    throw error;
  }

  return await tc.cacheFile(downloadPath, targetFile, 'buildx', version);
}

async function filename(version: string): Promise<string> {
  let arch: string;
  switch (context.osArch) {
    case 'x64': {
      arch = 'amd64';
      break;
    }
    case 'ppc64': {
      arch = 'ppc64le';
      break;
    }
    case 'arm': {
      const arm_version = (process.config.variables as any).arm_version;
      arch = arm_version ? 'arm-v' + arm_version : 'arm';
      break;
    }
    default: {
      arch = context.osArch;
      break;
    }
  }
  const platform: string = context.osPlat == 'win32' ? 'windows' : context.osPlat;
  const ext: string = context.osPlat == 'win32' ? '.exe' : '';
  return util.format('buildx-v%s.%s-%s%s', version, platform, arch, ext);
}

export async function getBuildKitVersion(containerID: string): Promise<string> {
  return exec
    .getExecOutput(`docker`, ['inspect', '--format', '{{.Config.Image}}', containerID], {
      ignoreReturnCode: true,
      silent: true
    })
    .then(bkitimage => {
      if (bkitimage.exitCode == 0 && bkitimage.stdout.length > 0) {
        return exec
          .getExecOutput(`docker`, ['run', '--rm', bkitimage.stdout.trim(), '--version'], {
            ignoreReturnCode: true,
            silent: true
          })
          .then(bkitversion => {
            if (bkitversion.exitCode == 0 && bkitversion.stdout.length > 0) {
              return `${bkitimage.stdout.trim()} => ${bkitversion.stdout.trim()}`;
            } else if (bkitversion.stderr.length > 0) {
              core.warning(bkitversion.stderr.trim());
            }
            return bkitversion.stdout.trim();
          });
      } else if (bkitimage.stderr.length > 0) {
        core.warning(bkitimage.stderr.trim());
      }
      return bkitimage.stdout.trim();
    });
}
