# .github

- `workflows/deploy.yml` runs `make verify` and publishes the built app to GitHub Pages. It is meant to run on every push to `main` and can be started by hand (`make deploy`, the GitHub API or the Actions tab). Only the built app is published; there is no server and no data.
- `workflows/verify.yml` runs `make verify` on every push to another branch and on every pull request, so a broken change shows up before it is merged.
- Actions are pinned to major versions that run on Node 24.
