[![GitHub release](https://img.shields.io/github/release/docker/setup-buildx-action.svg?style=flat-square)](https://github.com/docker/setup-buildx-action/releases/latest)
[![GitHub marketplace](https://img.shields.io/badge/marketplace-docker--setup--buildx-blue?logo=github&style=flat-square)](https://github.com/marketplace/actions/docker-setup-buildx)
[![CI workflow](https://img.shields.io/github/workflow/status/docker/setup-buildx-action/ci?label=ci&logo=github&style=flat-square)](https://github.com/docker/setup-buildx-action/actions?workflow=ci)
[![Test workflow](https://img.shields.io/github/workflow/status/docker/setup-buildx-action/test?label=test&logo=github&style=flat-square)](https://github.com/docker/setup-buildx-action/actions?workflow=test)
[![Codecov](https://img.shields.io/codecov/c/github/docker/setup-buildx-action?logo=codecov&style=flat-square)](https://codecov.io/gh/docker/setup-buildx-action)

## About

GitHub Action to set up Docker [Buildx](https://github.com/docker/buildx).

This action will create and boot a builder that can be used in the following
steps of your workflow if you're using Buildx or the [`build-push` action](https://github.com/docker/build-push-action/).
By default, the [`docker-container` driver](https://docs.docker.com/build/building/drivers/docker-container/)
will be used to be able to build multi-platform images and export cache using
a [BuildKit](https://github.com/moby/buildkit) container.

![Screenshot](.github/setup-buildx-action.png)

___

* [Usage](#usage)
* [Advanced usage](#advanced-usage)
  * [Authentication support](docs/advanced/auth.md)
  * [Install by default](docs/advanced/install-default.md)
  * [BuildKit daemon configuration](docs/advanced/buildkit-config.md)
  * [Standalone mode](docs/advanced/standalone.md)
* [Customizing](#customizing)
  * [inputs](#inputs)
  * [outputs](#outputs)
  * [environment variables](#environment-variables)
* [Notes](#notes)
  * [BuildKit container logs](#buildkit-container-logs)
* [Keep up-to-date with GitHub Dependabot](#keep-up-to-date-with-github-dependabot)

## Usage

```yaml
name: ci

on:
  push:

jobs:
  buildx:
    runs-on: ubuntu-latest
    steps:
      -
        name: Checkout
        uses: actions/checkout@v3
      -
        # Add support for more platforms with QEMU (optional)
        # https://github.com/docker/setup-qemu-action
        name: Set up QEMU
        uses: docker/setup-qemu-action@v2
      -
        name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
```

## Advanced usage

* [Authentication support](docs/advanced/auth.md)
* [Install by default](docs/advanced/install-default.md)
* [BuildKit daemon configuration](docs/advanced/buildkit-config.md)
* [Standalone mode](docs/advanced/standalone.md)

## Customizing

### inputs

Following inputs can be used as `step.with` keys

| Name              | Type   | Description                                                                                                                                                                                     |
|-------------------|--------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `version`         | String | [Buildx](https://github.com/docker/buildx) version. (eg. `v0.3.0`, `latest`, `https://github.com/docker/buildx.git#master`)                                                                     |
| `driver`          | String | Sets the [builder driver](https://docs.docker.com/engine/reference/commandline/buildx_create/#driver) to be used (default `docker-container`)                                                   |
| `driver-opts`     | CSV    | List of additional [driver-specific options](https://docs.docker.com/engine/reference/commandline/buildx_create/#driver-opt) (eg. `image=moby/buildkit:master`)                                 |
| `buildkitd-flags` | String | [Flags for buildkitd](https://docs.docker.com/engine/reference/commandline/buildx_create/#buildkitd-flags) daemon (since [buildx v0.3.0](https://github.com/docker/buildx/releases/tag/v0.3.0)) |
| `install`         | Bool   | Sets up `docker build` command as an alias to `docker buildx` (default `false`)                                                                                                                 |
| `use`             | Bool   | Switch to this builder instance (default `true`)                                                                                                                                                |
| `endpoint`        | String | [Optional address for docker socket](https://docs.docker.com/engine/reference/commandline/buildx_create/#description) or context from `docker context ls`                                       |
| `config`¹         | String | [BuildKit config file](https://docs.docker.com/engine/reference/commandline/buildx_create/#config)                                                                                              |
| `config-inline`¹  | String | Same as `config` but inline                                                                                                                                                                     |

> * ¹ `config` and `config-inline` are mutually exclusive

> `CSV` type must be a newline-delimited string
> ```yaml
> driver-opts: image=moby/buildkit:master
> ```
> ```yaml
> driver-opts: |
>   image=moby/buildkit:master
>   network=host
> ```

### outputs

Following outputs are available

| Name          | Type    | Description                           |
|---------------|---------|---------------------------------------|
| `name`        | String  | Builder name |
| `driver`      | String  | Builder driver |
| `endpoint`    | String  | Builder node endpoint |
| `status`      | String  | Builder node status |
| `flags`       | String  | Builder node flags (if applicable) |
| `platforms`   | String  | Builder node platforms available (comma separated) |

### environment variables

The following [official docker environment variables](https://docs.docker.com/engine/reference/commandline/cli/#environment-variables) are supported:

| Name            | Type   | Default     | Description                                     |
|-----------------|--------|-------------|-------------------------------------------------|
| `DOCKER_CONFIG` | String | `~/.docker` | The location of your client configuration files |

## Notes

### BuildKit container logs

To display BuildKit container logs (when `docker-container` driver is used) you have to [enable step debug logging](https://docs.github.com/en/actions/managing-workflow-runs/enabling-debug-logging#enabling-step-debug-logging),
or you can also enable debugging in the [setup-buildx action step](https://github.com/docker/setup-buildx-action):

```yaml
  -
    name: Set up Docker Buildx
    uses: docker/setup-buildx-action@v2
    with:
      buildkitd-flags: --debug
```

Logs will be available at the end of a job:

![BuildKit container logs](.github/buildkit-container-logs.png)

## Keep up-to-date with GitHub Dependabot

Since [Dependabot](https://docs.github.com/en/github/administering-a-repository/keeping-your-actions-up-to-date-with-github-dependabot)
has [native GitHub Actions support](https://docs.github.com/en/github/administering-a-repository/configuration-options-for-dependency-updates#package-ecosystem),
to enable it on your GitHub repo all you need to do is add the `.github/dependabot.yml` file:

```yaml
version: 2
updates:
  # Maintain dependencies for GitHub Actions
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "daily"
```
