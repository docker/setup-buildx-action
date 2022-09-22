import * as core from '@actions/core';

export const IsPost = !!process.env['STATE_isPost'];
export const IsDebug = !!process.env['STATE_isDebug'];
export const standalone = process.env['STATE_standalone'] || '';
export const builderName = process.env['STATE_builderName'] || '';
export const containerName = process.env['STATE_containerName'] || '';
export const credsDir = process.env['STATE_credsDir'] || '';

export function setDebug(debug: string) {
  core.saveState('isDebug', debug);
}

export function setStandalone(standalone: boolean) {
  core.saveState('standalone', standalone);
}

export function setBuilderName(builderName: string) {
  core.saveState('builderName', builderName);
}

export function setContainerName(containerName: string) {
  core.saveState('containerName', containerName);
}

export function setCredsDir(credsDir: string) {
  core.saveState('credsDir', credsDir);
}

if (!IsPost) {
  core.saveState('isPost', 'true');
}
