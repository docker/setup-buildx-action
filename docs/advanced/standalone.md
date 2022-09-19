# Standalone mode

If you don't have the Docker CLI installed on the GitHub Runner, Buildx binary
is invoked directly, instead of calling it as a docker plugin. This can be
useful if you want to use the `kubernetes` driver in your self-hosted runner:

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
          driver: kubernetes
      -
        name: Build
        run: |
          buildx build .
```
