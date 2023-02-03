import * as fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';
import * as util from 'util';
import * as context from './context';
import * as git from './git';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as tc from '@actions/tool-cache';
import {Install as BuildxInstall} from '@docker/actions-toolkit/lib/buildx/install';
import {GitHubRelease} from '@docker/actions-toolkit/lib/types/github';

export type Builder = {
  name?: string;
  driver?: string;
  nodes: Node[];
};

export type Node = {
  name?: string;
  endpoint?: string;
  'driver-opts'?: Array<string>;
  status?: string;
  'buildkitd-flags'?: string;
  buildkit?: string;
  platforms?: string;
};

export async function getConfigInline(s: string): Promise<string> {
  return getConfig(s, false);
}

export async function getConfigFile(s: string): Promise<string> {
  return getConfig(s, true);
}

export async function getConfig(s: string, file: boolean): Promise<string> {
  if (file) {
    if (!fs.existsSync(s)) {
      throw new Error(`config file ${s} not found`);
    }
    s = fs.readFileSync(s, {encoding: 'utf-8'});
  }
  const configFile = context.tmpNameSync({
    tmpdir: context.tmpDir()
  });
  fs.writeFileSync(configFile, s);
  return configFile;
}

export async function isAvailable(standalone?: boolean): Promise<boolean> {
  const cmd = getCommand([], standalone);
  return await exec
    .getExecOutput(cmd.commandLine, cmd.args, {
      ignoreReturnCode: true,
      silent: true
    })
    .then(res => {
      if (res.stderr.length > 0 && res.exitCode != 0) {
        return false;
      }
      return res.exitCode == 0;
    })
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .catch(error => {
      return false;
    });
}

export async function getVersion(standalone?: boolean): Promise<string> {
  const cmd = getCommand(['version'], standalone);
  return await exec
    .getExecOutput(cmd.commandLine, cmd.args, {
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

export async function inspect(name: string, standalone?: boolean): Promise<Builder> {
  const cmd = getCommand(['inspect', name], standalone);
  return await exec
    .getExecOutput(cmd.commandLine, cmd.args, {
      ignoreReturnCode: true,
      silent: true
    })
    .then(res => {
      if (res.stderr.length > 0 && res.exitCode != 0) {
        throw new Error(res.stderr.trim());
      }
      return parseInspect(res.stdout);
    });
}

export async function parseInspect(data: string): Promise<Builder> {
  const builder: Builder = {
    nodes: []
  };
  let node: Node = {};
  for (const line of data.trim().split(`\n`)) {
    const [key, ...rest] = line.split(':');
    const value = rest.map(v => v.trim()).join(':');
    if (key.length == 0 || value.length == 0) {
      continue;
    }
    switch (key.toLowerCase()) {
      case 'name': {
        if (builder.name == undefined) {
          builder.name = value;
        } else {
          if (Object.keys(node).length > 0) {
            builder.nodes.push(node);
            node = {};
          }
          node.name = value;
        }
        break;
      }
      case 'driver': {
        builder.driver = value;
        break;
      }
      case 'endpoint': {
        node.endpoint = value;
        break;
      }
      case 'driver options': {
        node['driver-opts'] = (value.match(/(\w+)="([^"]*)"/g) || []).map(v => v.replace(/^(.*)="(.*)"$/g, '$1=$2'));
        break;
      }
      case 'status': {
        node.status = value;
        break;
      }
      case 'flags': {
        node['buildkitd-flags'] = value;
        break;
      }
      case 'buildkit': {
        node.buildkit = value;
        break;
      }
      case 'platforms': {
        let platforms: Array<string> = [];
        // if a preferred platform is being set then use only these
        // https://docs.docker.com/engine/reference/commandline/buildx_inspect/#get-information-about-a-builder-instance
        if (value.includes('*')) {
          for (const platform of value.split(', ')) {
            if (platform.includes('*')) {
              platforms.push(platform.replace('*', ''));
            }
          }
        } else {
          // otherwise set all platforms available
          platforms = value.split(', ');
        }
        node.platforms = platforms.join(',');
        break;
      }
    }
  }
  if (Object.keys(node).length > 0) {
    builder.nodes.push(node);
  }
  return builder;
}

export async function build(inputBuildRef: string, dest: string, standalone: boolean): Promise<string> {
  // eslint-disable-next-line prefer-const
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
    let buildWithStandalone = false;
    const standaloneFound = await isAvailable(true);
    const pluginFound = await isAvailable(false);
    if (standalone && standaloneFound) {
      core.debug(`Buildx standalone found, build with it`);
      buildWithStandalone = true;
    } else if (!standalone && pluginFound) {
      core.debug(`Buildx plugin found, build with it`);
      buildWithStandalone = false;
    } else if (standaloneFound) {
      core.debug(`Buildx plugin not found, but standalone found so trying to build with it`);
      buildWithStandalone = true;
    } else if (pluginFound) {
      core.debug(`Buildx standalone not found, but plugin found so trying to build with it`);
      buildWithStandalone = false;
    } else {
      throw new Error(`Neither buildx standalone or plugin have been found to build from ref`);
    }
    const buildCmd = getCommand(['build', '--target', 'binaries', '--build-arg', 'BUILDKIT_CONTEXT_KEEP_GIT_DIR=1', '--output', `type=local,dest=${outFolder}`, inputBuildRef], buildWithStandalone);
    toolPath = await exec
      .getExecOutput(buildCmd.commandLine, buildCmd.args, {
        ignoreReturnCode: true
      })
      .then(res => {
        if (res.stderr.length > 0 && res.exitCode != 0) {
          core.warning(res.stderr.trim());
        }
        return tc.cacheFile(`${outFolder}/buildx`, context.osPlat == 'win32' ? 'docker-buildx.exe' : 'docker-buildx', 'buildx', vspec);
      });
  }

  if (standalone) {
    return setStandalone(toolPath, dest);
  }
  return setPlugin(toolPath, dest);
}

export async function install(inputVersion: string, dest: string, standalone: boolean): Promise<string> {
  const release: GitHubRelease = await BuildxInstall.getRelease(inputVersion);
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

  if (standalone) {
    return setStandalone(toolPath, dest);
  }
  return setPlugin(toolPath, dest);
}

async function setStandalone(toolPath: string, dest: string): Promise<string> {
  core.info('Standalone mode');
  const toolBinPath = path.join(toolPath, context.osPlat == 'win32' ? 'docker-buildx.exe' : 'docker-buildx');

  const binDir = path.join(dest, 'bin');
  core.debug(`Bin dir is ${binDir}`);
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, {recursive: true});
  }

  const filename: string = context.osPlat == 'win32' ? 'buildx.exe' : 'buildx';
  const buildxPath: string = path.join(binDir, filename);
  core.debug(`Bin path is ${buildxPath}`);
  fs.copyFileSync(toolBinPath, buildxPath);

  core.info('Fixing perms');
  fs.chmodSync(buildxPath, '0755');

  core.addPath(binDir);
  core.info('Added buildx to the path');

  return buildxPath;
}

async function setPlugin(toolPath: string, dockerConfigHome: string): Promise<string> {
  core.info('Docker plugin mode');
  const toolBinPath = path.join(toolPath, context.osPlat == 'win32' ? 'docker-buildx.exe' : 'docker-buildx');

  const pluginsDir: string = path.join(dockerConfigHome, 'cli-plugins');
  core.debug(`Plugins dir is ${pluginsDir}`);
  if (!fs.existsSync(pluginsDir)) {
    fs.mkdirSync(pluginsDir, {recursive: true});
  }

  const filename: string = context.osPlat == 'win32' ? 'docker-buildx.exe' : 'docker-buildx';
  const pluginPath: string = path.join(pluginsDir, filename);
  core.debug(`Plugin path is ${pluginPath}`);
  fs.copyFileSync(toolBinPath, pluginPath);

  core.info('Fixing perms');
  fs.chmodSync(pluginPath, '0755');

  return pluginPath;
}

async function download(version: string): Promise<string> {
  const targetFile: string = context.osPlat == 'win32' ? 'docker-buildx.exe' : 'docker-buildx';
  const downloadUrl = util.format('https://github.com/docker/buildx/releases/download/v%s/%s', version, await filename(version));
  core.info(`Downloading ${downloadUrl}`);
  const downloadPath = await tc.downloadTool(downloadUrl);
  core.debug(`Downloaded to ${downloadPath}`);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

export function getCommand(args: Array<string>, standalone?: boolean) {
  return {
    commandLine: standalone ? 'buildx' : 'docker',
    args: standalone ? args : ['buildx', ...args]
  };
}
