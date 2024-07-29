import * as core from '@actions/core';

export const IsDebug = !!process.env['STATE_isDebug'];
export const standalone = /true/i.test(process.env['STATE_standalone'] || '');
export const builderName = process.env['STATE_builderName'] || '';
export const builderDriver = process.env['STATE_builderDriver'] || '';
export const containerName = process.env['STATE_containerName'] || '';
export const certsDir = process.env['STATE_certsDir'] || '';
export const tmpDockerContext = process.env['STATE_tmpDockerContext'] || '';
export const cleanup = /true/i.test(process.env['STATE_cleanup'] || '');

export function setDebug(debug: string) {
  core.saveState('isDebug', debug);
}

export function setStandalone(standalone: boolean) {
  core.saveState('standalone', standalone);
}

export function setBuilderName(builderName: string) {
  core.saveState('builderName', builderName);
}

export function setBuilderDriver(builderDriver: string) {
  core.saveState('builderDriver', builderDriver);
}

export function setContainerName(containerName: string) {
  core.saveState('containerName', containerName);
}

export function setCertsDir(certsDir: string) {
  core.saveState('certsDir', certsDir);
}

export function setTmpDockerContext(tmpDockerContext: string) {
  core.saveState('tmpDockerContext', tmpDockerContext);
}

export function setCleanup(cleanup: boolean) {
  core.saveState('cleanup', cleanup);
}
