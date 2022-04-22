import * as core from '@actions/core';

export const IsPost = !!process.env['STATE_isPost'];
export const IsDebug = !!process.env['STATE_isDebug'];

export const builderName = process.env['STATE_builderName'] || '';
export const containerName = process.env['STATE_containerName'] || '';
export const stateDir = process.env['STATE_stateDir'] || '';

export function setDebug(debug: string) {
  core.saveState('isDebug', debug);
}

export function setBuilderName(builderName: string) {
  core.saveState('builderName', builderName);
}

export function setContainerName(containerName: string) {
  core.saveState('containerName', containerName);
}

export function setStateDir(stateDir: string) {
  core.saveState('stateDir', stateDir);
}

if (!IsPost) {
  core.saveState('isPost', 'true');
}
