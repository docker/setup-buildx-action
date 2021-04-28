import * as fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';
import * as util from 'util';
import * as context from './context';
import * as exec from './exec';
import * as github from './github';
import * as core from '@actions/core';
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

export async function getVersion(): Promise<string> {
  return await exec.exec(`docker`, ['buildx', 'version'], true).then(res => {
    if (res.stderr.length > 0 && !res.success) {
      throw new Error(res.stderr);
    }
    return parseVersion(res.stdout);
  });
}

export async function parseVersion(stdout: string): Promise<string> {
  const matches = /\sv?([0-9.]+)/.exec(stdout);
  if (!matches) {
    throw new Error(`Cannot parse Buildx version`);
  }
  return semver.clean(matches[1]);
}

export async function isAvailable(): Promise<Boolean> {
  return await exec.exec(`docker`, ['buildx'], true).then(res => {
    if (res.stderr.length > 0 && !res.success) {
      return false;
    }
    return res.success;
  });
}

export async function inspect(name: string): Promise<Builder> {
  return await exec.exec(`docker`, ['buildx', 'inspect', name], true).then(res => {
    if (res.stderr.length > 0 && !res.success) {
      throw new Error(res.stderr);
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
  const downloadUrl = util.format(
    'https://github.com/docker/buildx/releases/download/v%s/%s',
    version,
    await filename(version)
  );
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
  return exec.exec(`docker`, ['inspect', '--format', '{{.Config.Image}}', containerID], true).then(bkitimage => {
    if (bkitimage.success && bkitimage.stdout.length > 0) {
      return exec.exec(`docker`, ['run', '--rm', bkitimage.stdout, '--version'], true).then(bkitversion => {
        if (bkitversion.success && bkitversion.stdout.length > 0) {
          return `${bkitimage.stdout} => ${bkitversion.stdout}`;
        } else if (bkitversion.stderr.length > 0) {
          core.warning(bkitversion.stderr);
        }
        return bkitversion.stdout;
      });
    } else if (bkitimage.stderr.length > 0) {
      core.warning(bkitimage.stderr);
    }
    return bkitimage.stdout;
  });
}
