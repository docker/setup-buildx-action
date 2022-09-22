# Authentication support

## SSH authentication

To be able to connect to an SSH endpoint using the [`docker-container` driver](https://docs.docker.com/build/building/drivers/docker-container/),
you have to set up the SSH private key and configuration on the GitHub Runner:

```yaml
name: ci

on:
  push:

jobs:
  buildx:
    runs-on: ubuntu-latest
    steps:
      -
        name: Set up SSH
        uses: MrSquaare/ssh-setup-action@523473d91581ccbf89565e12b40faba93f2708bd # v1.1.0
        with:
          host: graviton2
          private-key: ${{ secrets.SSH_PRIVATE_KEY }}
          private-key-name: aws_graviton2
      -
        name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
        with:
          endpoint: ssh://me@graviton2
```

## TLS authentication

You can also [set up a remote BuildKit instance](https://docs.docker.com/build/building/drivers/remote/#remote-buildkit-in-docker-container)
using the remote driver. To ease the integration in your workflow, we put in
place environment variables that will set up authentication using the BuildKit
client certificates for the `tcp://` endpoint where `<idx>` is the position of
the node in the list of nodes:

* `BUILDER_NODE_<idx>_AUTH_TLS_CACERT`
* `BUILDER_NODE_<idx>_AUTH_TLS_CERT`
* `BUILDER_NODE_<idx>_AUTH_TLS_KEY`

> **Note**
> 
> The index is always `0` at the moment as we don't support (yet) appending new
> nodes with this action.

```yaml
name: ci

on:
  push:

jobs:
  buildx:
    runs-on: ubuntu-latest
    steps:
      -
        name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
        with:
          driver: remote
          endpoint: tcp://graviton2:1234
        env:
          BUILDER_NODE_0_AUTH_TLS_CACERT: ${{ secrets.GRAVITON2_CA }}
          BUILDER_NODE_0_AUTH_TLS_CERT: ${{ secrets.GRAVITON2_CERT }}
          BUILDER_NODE_0_AUTH_TLS_KEY: ${{ secrets.GRAVITON2_KEY }}
```
