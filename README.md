[![GitHub release](https://img.shields.io/github/release/docker/setup-buildx-action.svg?style=flat-square)](https://github.com/docker/setup-buildx-action/releases/latest)
[![GitHub marketplace](https://img.shields.io/badge/marketplace-docker--setup--buildx-blue?logo=github&style=flat-square)](https://github.com/marketplace/actions/docker-setup-buildx)
[![CI workflow](https://img.shields.io/github/workflow/status/docker/setup-buildx-action/ci?label=ci&logo=github&style=flat-square)](https://github.com/docker/setup-buildx-action/actions?workflow=ci)
[![Test workflow](https://img.shields.io/github/workflow/status/docker/setup-buildx-action/test?label=test&logo=github&style=flat-square)](https://github.com/docker/setup-buildx-action/actions?workflow=test)
[![Codecov](https://img.shields.io/codecov/c/github/docker/setup-buildx-action?logo=codecov&style=flat-square)](https://codecov.io/gh/docker/setup-buildx-action)

## About

GitHub Action to set up Docker [Buildx](https://github.com/docker/buildx).

> :bulb: See also our [build-push](https://github.com/docker/build-push-action)
> and [setup-qemu](https://github.com/docker/setup-qemu-action) actions

![Screenshot](.github/setup-buildx-action.png)

___

* [Usage](#usage)
  * [Quick start](#quick-start)
  * [With QEMU](#with-qemu)
* [Customizing](#customizing)
  * [inputs](#inputs)
  * [outputs](#outputs)
  * [environment variables](#environment-variables)
* [Keep up-to-date with GitHub Dependabot](#keep-up-to-date-with-github-dependabot)
* [Limitation](#limitation)

## Usage

### Quick start

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
        uses: actions/checkout@v2
      -
        name: Set up Docker Buildx
        id: buildx
        uses: docker/setup-buildx-action@master
        with:
          version: latest
      -
        name: Builder instance name
        run: echo ${{ steps.buildx.outputs.name }}
      -
        name: Available platforms
        run: echo ${{ steps.buildx.outputs.platforms }}
```

### With QEMU

If you want support for more platforms you can use our [setup-qemu](https://github.com/docker/setup-qemu-action) action:

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
        uses: actions/checkout@v2
      -
        name: Set up QEMU
        uses: docker/setup-qemu-action@master
        with:
          platforms: all
      -
        name: Set up Docker Buildx
        id: buildx
        uses: docker/setup-buildx-action@master
        with:
          version: latest
      -
        name: Available platforms
        run: echo ${{ steps.buildx.outputs.platforms }}
```

## Customizing

### inputs

Following inputs can be used as `step.with` keys

| Name               | Type    | Description                       |
|--------------------|---------|-----------------------------------|
| `version`          | String  | [Buildx](https://github.com/docker/buildx) version. (e.g. `v0.3.0`, `latest`) |
| `driver`           | String  | Sets the [builder driver](https://github.com/docker/buildx#--driver-driver) to be used (default `docker-container`) |
| `driver-opt`       | String  | Passes additional [driver-specific options](https://github.com/docker/buildx#--driver-opt-options) |
| `buildkitd-flags`  | String  | [Flags for buildkitd](https://github.com/moby/buildkit/blob/master/docs/buildkitd.toml.md) daemon |
| `install`          | Bool    | Sets up `docker build` command as an alias to `docker buildx` (default `false`) |
| `use`              | Bool    | Switch to this builder instance (default `true`) |

### outputs

Following outputs are available

| Name          | Type    | Description                           |
|---------------|---------|---------------------------------------|
| `name`        | String  | Builder instance name |
| `platforms`   | String  | Available platforms (comma separated) |

### environment variables

The following [official docker environment variables](https://docs.docker.com/engine/reference/commandline/cli/#environment-variables) are supported:

| Name            | Type    | Default      | Description                                    |
|-----------------|---------|-------------|-------------------------------------------------|
| `DOCKER_CONFIG` | String  | `~/.docker` | The location of your client configuration files |

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

## Limitation

This action is only available for Linux [virtual environments](https://docs.github.com/en/actions/reference/virtual-environments-for-github-hosted-runners#supported-virtual-environments-and-hardware-resources).
