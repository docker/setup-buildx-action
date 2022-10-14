# Append additional nodes to the builder

Buildx also supports running builds on multiple machines. This is useful for
building [multi-platform images](https://docs.docker.com/build/building/multi-platform/)
on native nodes for more complicated cases that are not handled by QEMU and
generally have better performance or for distributing the build across multiple
machines.

You can append nodes to the builder that is going to be created with the
`append` input in the form of a YAML string document to remove limitations
intrinsically linked to GitHub Actions (only string format is handled in the
input fields):

| Name              | Type   | Description                                                                                                                                                                                                                                                                           |
|-------------------|--------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `name`            | String | [Name of the node](https://docs.docker.com/engine/reference/commandline/buildx_create/#node). If empty, it is the name of the builder it belongs to, with an index number suffix. This is useful to set it if you want to modify/remove a node in an underlying step of you workflow. |
| `endpoint`        | String | [Docker context or endpoint](https://docs.docker.com/engine/reference/commandline/buildx_create/#description) of the node to add to the builder                                                                                                                                       |
| `driver-opts`     | List   | List of additional [driver-specific options](https://docs.docker.com/engine/reference/commandline/buildx_create/#driver-opt)                                                                                                                                                          |
| `buildkitd-flags` | String | [Flags for buildkitd](https://docs.docker.com/engine/reference/commandline/buildx_create/#buildkitd-flags) daemon                                                                                                                                                                     |
| `platforms`       | String | Fixed [platforms](https://docs.docker.com/engine/reference/commandline/buildx_create/#platform) for the node. If not empty, values take priority over the detected ones.                                                                                                              |

Here is an example using remote nodes with the [`remote` driver](https://docs.docker.com/build/building/drivers/remote/)
and [TLS authentication](auth.md#tls-authentication):

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
          endpoint: tcp://oneprovider:1234
          append: |
            - endpoint: tcp://graviton2:1234
              platforms: linux/arm64
            - endpoint: tcp://linuxone:1234
              platforms: linux/s390x
        env:
          BUILDER_NODE_0_AUTH_TLS_CACERT: ${{ secrets.ONEPROVIDER_CA }}
          BUILDER_NODE_0_AUTH_TLS_CERT: ${{ secrets.ONEPROVIDER_CERT }}
          BUILDER_NODE_0_AUTH_TLS_KEY: ${{ secrets.ONEPROVIDER_KEY }}
          BUILDER_NODE_1_AUTH_TLS_CACERT: ${{ secrets.GRAVITON2_CA }}
          BUILDER_NODE_1_AUTH_TLS_CERT: ${{ secrets.GRAVITON2_CERT }}
          BUILDER_NODE_1_AUTH_TLS_KEY: ${{ secrets.GRAVITON2_KEY }}
          BUILDER_NODE_2_AUTH_TLS_CACERT: ${{ secrets.LINUXONE_CA }}
          BUILDER_NODE_2_AUTH_TLS_CERT: ${{ secrets.LINUXONE_CERT }}
          BUILDER_NODE_2_AUTH_TLS_KEY: ${{ secrets.LINUXONE_KEY }}
```
