import * as github from '@actions/github';

export interface Release {
  id: number;
  tag_name: string;
}

const [owner, repo] = 'docker/buildx'.split('/');

export const getReleaseTag = async (tag: string, githubToken: string): Promise<Release> => {
  return (
    await github
      .getOctokit(githubToken, {
        baseUrl: 'https://api.github.com'
      })
      .rest.repos.getReleaseByTag({
        owner,
        repo,
        tag
      })
      .catch(error => {
        throw new Error(`Cannot get release ${tag}: ${error}`);
      })
  ).data as Release;
};

export const getLatestRelease = async (githubToken: string): Promise<Release> => {
  return (
    await github
      .getOctokit(githubToken, {
        baseUrl: 'https://api.github.com'
      })
      .rest.repos.getLatestRelease({
        owner,
        repo
      })
      .catch(error => {
        throw new Error(`Cannot get latest release: ${error}`);
      })
  ).data as Release;
};
