# Install by default

If you want set up the `docker build` command as an alias to
`docker buildx build`:

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
          install: true
      -
        name: Build
        run: |
          docker build . # will run buildx
```
