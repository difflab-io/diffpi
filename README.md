# @difflab/pi

Tools and skills for the [Pi coding agent](https://github.com/badlogic/pi-mono). Diffpi adds file-based planning, code review, and reusable agent profiles.

## Install

```bash
pi install npm:@difflab/pi
```

Run `/skill:diffpi-setup` in Pi to configure the required tools. The setup skill asks before it changes your system or user configuration.

## Use

- `/plan` creates and checks plans in `.diffpi/plan/`.
- `/review` manages GitHub, GitLab, and local code reviews.
- `/mode` selects an inline agent profile.

See the [user guide](docs/user-guide.md) for commands and the [package guide](packages/pi/README.md) for setup details.

## Develop

```bash
mise install
mise run install
mise run //packages/pi:lint
mise run //packages/pi:test
mise run //packages/pi:build
```

See the [development guide](docs/development-guide.md) for tasks and evaluations. Releases run from `main` when the squash commit has a release-triggering conventional subject such as `fix:` or `feat:`.
