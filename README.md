# Kong Gateway Test Scheduler

This repository contains the Kong Gateway test scheduler.  Please have
a look at the [Overview](./OVERVIEW.md) document if you want to learn
what it does and how it does it.  This document describes how to set
up the development environment and how to manually run each step.

## Hacking

The scheduler is implemented in JavaScript and exposes its
functionality through GitHub actions.  To facilitate local development
and testing, a command-line interface is provided as well.

As GitHub actions need to have all their dependencies bundled in their
repository, the source file in `src/` need to be packaged into the
`dist/index.js` file which is then loaded by the action handlers.  The
packaging step can be initiated by running `npm package`.  The
packaged version needs to be checked in.  If you install the supplied
[pre-commit](./pre-commit) shell script in the `.git/hooks/`
directory, linting, reformatting and packaging will be done before
each commit so that you don't forget the build step.

### Setup

You will need to
[install Node.js](https://nodejs.org/en/download/package-manager) on
your development system.  You'll also want to have a
[local build of Kong Gateway](https://github.com/Kong/kong/blob/master/DEVELOPER.md#build-and-install-from-source)
be available if you want to run test runners.

With these out of the way, run `npm install` to install the
dependencies.

As the system interacts with the GitHub API at various points, you
will need to set the `GITHUB_TOKEN` environment variable.  If you have
the [GitHub CLI](https://cli.github.com/) installed, you can use these
commands to log in and set the environment variable

```shell
gh auth login
export GITHUB_TOKEN=$(gh auth token)
```

### Running Locally

Each of the steps that is normally invoked from GitHub Workflows can
also be invoked from the command-line in the development environment.
In this mode, parameters are passed as command-line arguments.  For
each of the commands, a sample invocation is presented below.

#### Runtime Prediction

To work on the runtime prediction part of the system, you will need to
have runtime statistics files available.  The GitHub action
automatically downloads them from the GitHub artifacts each time it is
run, but for local development, you'll probably want to have them in a
local cache.  You can download the data using a command like this:

```shell
npm run cli download-statistics Kong/kong build_and_test.yml \
    "^test-runtime-statistics-\\d+$" /tmp/workflow-statistics/
```

This will take a minute or two and report the number of files that it
has downloaded to the directory `/tmp/workflow-statistics/` or
whatever you chose instead.

With the runtime log files in place, you can run the process to
combine them into a prediction file like so:

```shell
npm run combine-statistics /tmp/workflow-statistics/ \
    /tmp/runtime-predictions.json
```

The file `/tmp/runtimes.json` (or whatever you specified) will contain
the prediction data.

#### Scheduling

To create control files for the runners, use a command like this:

```shell
npm run cli schedule ../kong/.ci/test_suites.json \
    /tmp/runtime-predictions.json ../kong /tmp/schedule- 7
```

This will create control files for workers named
`/tmp/schedule-1.json` through `/tmp/schedule-7.json` based on the
test suite definitions in the kong source directory `../kong/` and the
runtime prediction file `/tmp/runtime-predictions.json`.  A report on
the details of the generated files is written to the standard output.

#### Running

Once the runner control files have been generated, you can start a
runner process like so:

```shell
npm run cli runner /tmp/schedule-1.json /tmp/failed.json \
    /tmp/runtimes.json '. bazel-bin/build/kong-dev-venv.sh' ../kong
```

This invocation will use the first runner configuration file that was
previously generated in the "Schedule" step.  Failing tests will be
logged to the file `/tmp/failed.json`, the file `/tmp/runtimes.json`
will contain the actual runtimes of the tests that were run.  If a
file `/tmp/failed.json` already exists, only those tests are run.

### Invoking the Action Handlers

It is also possible to invoke the Action handlers locally.
Parametrization will then need to happen through environment
variables: For example, the `workflow-name` parameter of the
[analyze](./analyze/action.yml) task needs to be passed in the
INPUT_WORKFLOW-NAME environment variable when invoking the
[analyze-action.js](./src/analyze-action.js) stub.  Note that when
invoking the action handlers, the packaged JavaScript file is loaded.
It can be brought up to date using `npm run package` or, if continuous
packaging during development is required, using `npm run
package:watch`.
