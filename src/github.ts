import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';
import * as buildx from './buildx';
import * as context from './context';
import * as github from '@actions/github';
import * as httpm from '@actions/http-client';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';

export interface GitHubRelease {
  id: number;
  tag_name: string;
}

const buildxRepo = {owner: 'docker', repo: 'buildx'};
const buildxWorkflow = 'build.yml';
const buildxArtifactName = 'buildx';

export const getRelease = async (version: string): Promise<GitHubRelease | null> => {
  const url: string = `https://github.com/docker/buildx/releases/${version}`;
  const http: httpm.HttpClient = new httpm.HttpClient('setup-buildx');
  return (await http.getJson<GitHubRelease>(url)).result;
};

export const getPullRunID = async (prNumber: number, token: string): Promise<number> => {
  const octokit = github.getOctokit(token);
  return octokit.rest.pulls
    .get({
      ...buildxRepo,
      pull_number: prNumber
    })
    .then(response => {
      return octokit
        .paginate(octokit.rest.actions.listWorkflowRuns, {
          ...buildxRepo,
          workflow_id: buildxWorkflow,
          status: 'completed'
        })
        .then(runs => {
          return runs.filter(run => run.head_sha === response.data.head.sha)[0].run_number;
        })
        .catch(error => {
          throw new Error(
            `Cannot find a completed workflow run for https://github.com/${buildxRepo.owner}/${buildxRepo.repo}/pull/${prNumber}: ${error.message}`
          );
        });
    });
};

export const downloadArtifact = async (runID: number, token: string): Promise<string> => {
  const octokit = github.getOctokit(token);
  return octokit
    .paginate(octokit.rest.actions.listWorkflowRunArtifacts, {
      ...buildxRepo,
      run_id: runID
    })
    .then(artifacts => {
      const artifact = artifacts.find(artifact => artifact.name == buildxArtifactName);
      if (!artifact) {
        throw new Error(
          `Cannot find ${buildxArtifactName} artifact in https://github.com/${buildxRepo.owner}/${buildxRepo.repo}/actions/runs/${runID} workflow`
        );
      }
      core.info(
        `Downloading ${artifact.id} artifact in https://github.com/${buildxRepo.owner}/${buildxRepo.repo}/actions/runs/${runID} workflow`
      );
      return octokit.rest.actions
        .downloadArtifact({
          ...buildxRepo,
          artifact_id: artifact.id,
          archive_format: 'zip'
        })
        .then(downloadArtifact => {
          const archivePath = path.join(context.tmpDir(), 'buildx.zip').split(path.sep).join(path.posix.sep);
          fs.writeFileSync(archivePath, Buffer.from(downloadArtifact.data as ArrayBuffer), 'binary');
          core.info(`Extracting ${archivePath}`);
          return tc.extractZip(archivePath).then(extPath => {
            const binSuffixName = buildx.filename(runID.toString()).split(',').pop();
            return glob(
              `*${binSuffixName}`,
              {
                root: extPath,
                absolute: true
              },
              (err, binFiles) => {
                if (err) {
                  throw new Error(`Cannot find buildx binary *${binSuffixName}: ${err}`);
                }
                return tc.cacheFile(
                  binFiles[0],
                  context.osPlat == 'win32' ? 'docker-buildx.exe' : 'docker-buildx',
                  'buildx',
                  runID.toString()
                );
              }
            );
          });
        })
        .catch(error => {
          throw new Error(`Cannot download ${artifact.id} artifact: ${error.message}`);
        });
    })
    .catch(error => {
      throw new Error(
        `Cannot find ${buildxArtifactName} artifact in https://github.com/${buildxRepo.owner}/${buildxRepo.repo}/actions/runs/${runID} workflow: ${error.message}`
      );
    });
};
