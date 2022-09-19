# BuildKit daemon configuration

You can provide a [BuildKit configuration](https://github.com/moby/buildkit/blob/master/docs/buildkitd.toml.md)
to your builder if you're using the [`docker-container` driver](https://docs.docker.com/build/building/drivers/docker-container/)
(default) with the `config` or `config-inline` inputs:

## Registry mirror

You can configure a registry mirror using an inline block directly in your
workflow with the `config-inline` input:

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
        name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
        with:
          config-inline: |
            [registry."docker.io"]
              mirrors = ["mirror.gcr.io"]
```

## Max parallelism

You can limit the parallelism of the BuildKit solver which is particularly
useful for low-powered machines.

You can use the `config-inline` input like the previous example, or you can use
a dedicated BuildKit config file from your repo if you want with the
`config` input:

```toml
# .github/buildkitd.toml
[worker.oci]
  max-parallelism = 4
```

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
        name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
        with:
          config: .github/buildkitd.toml
```
