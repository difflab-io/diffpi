# pizen

pizen is [add your project description here].

## Features

- [List key features of your project]

## Requirements

- bash 3.2+
- [mise](https://mise.jdx.dev/getting-started.html)

Run `mise install` to install all tools, then `mise run install` for any additional dependencies.

## Quick Start

```bash
git clone <your-repo>
cd pizen
mise install
```

Type `mise tasks --all` to see all available tasks:

```bash
❯ mise tasks --all
//:install                       Install npm dependencies
//:clean                         Remove build artifacts
//:upversion                     Create new version based on commits (semantic-release)
//:version                       Print current version
//:version:next                  Preview next semantic-release version
//packages/pizen:build     Compile TypeScript to dist/
//packages/pizen:test      Run bun test suite
...
```

Build, run, and test with `mise run` (package tasks are namespaced under the monorepo root):

```bash
mise run //packages/pizen:test
mise run //packages/pizen:run
# or cd into the package and use short names
cd packages/pizen && mise run test
```

Repo-wide tasks keep root names: `mise run install`, `mise run upversion`, `mise run clean`.

Task dependencies run automatically — `mise run //packages/pizen:test` runs `//:install` first!

Commit using conventional commits (`feat:`, `fix:`, `docs:`). Merge/push to main and CI/CD will run automatically bumping your project version and publishing a package.

## Documentation

- [User Guide](docs/user-guide.md) - Complete setup and usage guide
- [Architecture](docs/architecture.md) - Design and implementation details
- [Infrastructure](docs/infrastructure.md) - Infrastructure and CI/CD details

## References

- [mise - dev tool manager](https://mise.jdx.dev/)
- [semantic-release](https://semantic-release.gitbook.io/)
- [bats-core bash testing](https://bats-core.readthedocs.io/)
- [Google Shell Style Guide](https://google.github.io/styleguide/shellguide.html)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [GitHub Actions](https://docs.github.com/en/actions)

---

**Template**: mise-lib-template v2.15.0
