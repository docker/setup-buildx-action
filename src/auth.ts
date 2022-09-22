import * as fs from 'fs';

export const envPrefix = 'BUILDER_NODE';

export function setCredentials(credsdir: string, index: number, driver: string, endpoint: string): Array<string> {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch (e) {
    return [];
  }
  switch (url.protocol) {
    case 'tcp:': {
      return setBuildKitClientCerts(credsdir, index, driver, url);
    }
  }
  return [];
}

function setBuildKitClientCerts(credsdir: string, index: number, driver: string, endpoint: URL): Array<string> {
  const driverOpts: Array<string> = [];
  const buildkitCacert = process.env[`${envPrefix}_${index}_AUTH_TLS_CACERT`] || '';
  const buildkitCert = process.env[`${envPrefix}_${index}_AUTH_TLS_CERT`] || '';
  const buildkitKey = process.env[`${envPrefix}_${index}_AUTH_TLS_KEY`] || '';
  if (buildkitCacert.length == 0 && buildkitCert.length == 0 && buildkitKey.length == 0) {
    return driverOpts;
  }
  let host = endpoint.hostname;
  if (endpoint.port.length > 0) {
    host += `-${endpoint.port}`;
  }
  if (buildkitCacert.length > 0) {
    const cacertpath = `${credsdir}/cacert_${host}.pem`;
    fs.writeFileSync(cacertpath, buildkitCacert);
    driverOpts.push(`cacert=${cacertpath}`);
  }
  if (buildkitCert.length > 0) {
    const certpath = `${credsdir}/cert_${host}.pem`;
    fs.writeFileSync(certpath, buildkitCert);
    driverOpts.push(`cert=${certpath}`);
  }
  if (buildkitKey.length > 0) {
    const keypath = `${credsdir}/key_${host}.pem`;
    fs.writeFileSync(keypath, buildkitKey);
    driverOpts.push(`key=${keypath}`);
  }
  if (driver != 'remote') {
    return [];
  }
  return driverOpts;
}
