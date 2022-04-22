import * as fs from 'fs';
import * as path from 'path';
import * as uuid from 'uuid';
import * as context from './context';
import * as exec from '@actions/exec';

export async function volumeCreate(dir: string, name: string): Promise<void> {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {recursive: true});
  }
  return await exec
    .getExecOutput(`docker`, ['volume', 'create', '--name', `${name}`, '--driver', 'local', '--opt', `o=bind,acl`, '--opt', 'type=none', '--opt', `device=${dir}`], {
      ignoreReturnCode: true
    })
    .then(res => {
      if (res.stderr.length > 0 && res.exitCode != 0) {
        throw new Error(res.stderr.trim());
      }
    });
}

export async function volumeRemove(name: string): Promise<void> {
  return await exec
    .getExecOutput(`docker`, ['volume', 'rm', '-f', `${name}`], {
      ignoreReturnCode: true
    })
    .then(res => {
      if (res.stderr.length > 0 && res.exitCode != 0) {
        throw new Error(res.stderr.trim());
      }
    });
}

export async function containerCreate(image: string, volume: string): Promise<string> {
  return await exec
    .getExecOutput(`docker`, ['create', '--rm', '-v', `${volume}`, `${image}`], {
      ignoreReturnCode: true
    })
    .then(res => {
      if (res.stderr.length > 0 && res.exitCode != 0) {
        throw new Error(res.stderr.trim());
      }
      return res.stdout.trim();
    });
}

export async function containerCopy(ctnid: string, src: string): Promise<string> {
  const outdir = path.join(context.tmpDir(), `ctn-copy-${uuid.v4()}`).split(path.sep).join(path.posix.sep);
  return await exec
    .getExecOutput(`docker`, ['cp', '-a', `${src}`, `${outdir}`], {
      ignoreReturnCode: true
    })
    .then(res => {
      if (res.stderr.length > 0 && res.exitCode != 0) {
        throw new Error(res.stderr.trim());
      }
      return outdir;
    });
}

export async function containerRemove(ctnid: string): Promise<void> {
  return await exec
    .getExecOutput(`docker`, ['rm', '-f', '-v', `${ctnid}`], {
      ignoreReturnCode: true
    })
    .then(res => {
      if (res.stderr.length > 0 && res.exitCode != 0) {
        throw new Error(res.stderr.trim());
      }
    });
}
