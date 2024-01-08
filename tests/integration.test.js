const { expect, it, describe } = require('@jest/globals')
const { v4: uuidv4 } = require('uuid')

const helpers = require('./gh-api-helpers')

const RUNNER_COUNT = 3
const TIMEOUT = 300000
const BUSTED_EVENTS_FILE_PREFIX = 'busted-events-'

// Test info (as defined in tests/fixtures/res/test_suites.json):
// Total number of tests from all suites:
const ALL_TESTS = 8
// number of tests that are expected to rerun:
const RERUN_TESTS = 5
// number of FILES that are expected to fail:
const EXPECT_FAILURES_FILES = 2
// number of FILES that are expected to error:
const EXPECT_ERRORS_FILES = 1

const scheduleAndRun = async (scheduler_res_path, runName) => {
  /*
   * Schedule workflow run using tests from the configured folder.
   * Note: some tests are intentionally missing from runtimes.json, to cover
   * the scenario of "unseen" tests being run, i.e. without information on
   * their runtime.
   */
  const res = await helpers.scheduleAndRun(scheduler_res_path, runName)
  expect(res.status).toBeLessThan(300)

  // fetch the workflow run to obtain the run ID
  const run = await helpers.getWorkflowRun(runName)
  expect(run).toBeDefined()
  expect(run.id).toBeDefined()

  const isCompleted = await helpers.waitForRunCompletion(run.id)
  expect(isCompleted).toBe(true)

  return run.id
}

const rerunFailed = async (runName, runId) => {
  const res = await helpers.rerunFailed(runId)
  expect(res.status).toBeLessThan(300)

  // fetch the workflow run to obtain the run ID
  const rerun = await helpers.getWorkflowRun(runName)
  expect(rerun.id).toBeDefined()

  const isCompleted = await helpers.waitForRunCompletion(rerun.id)
  expect(isCompleted).toBe(true)

  return rerun.id
}

const aggregateBustedEvents = (artifacts) => {
  const bustedEvents = []

  for (const [key, value] of Object.entries(artifacts)) {
    if (key.startsWith(BUSTED_EVENTS_FILE_PREFIX)) {
      const runnerID = key.split(BUSTED_EVENTS_FILE_PREFIX)[1]
      const events = Object.values(value[0])[0].trim().split('\n')

      for (const e of events) {
        const event = JSON.parse(e)
        event.runnerID = runnerID
        bustedEvents.push(event)
      }
    }
  }

  return bustedEvents
}

const assertExpectedTestResults = (
  bustedEvents,
  expectTotalTests,
  expectFailures,
  expectErrors,
) => {
  let totalTests = 0
  const failedFiles = {}
  const erroredFiles = {}

  expect(bustedEvents.length).toBeGreaterThan(0)

  for (const e of bustedEvents) {
    const testName = e.args[0].name

    if (e.event === 'test:end') {
      totalTests++
    } else if (e.event.startsWith('failure')) {
      // assert failed test was expected to fail
      expect(testName).toContain('fails')

      for (const arg of e.args) {
        if (arg.source) {
          failedFiles[arg.source] = true
        }
      }
    } else if (e.event.startsWith('error')) {
      // assert errored test was expected to error
      expect(testName).toContain('errors')

      for (const arg of e.args) {
        if (arg.source) {
          erroredFiles[arg.source] = true
        }
      }
    }
  }

  // assert that all tests were run
  expect(totalTests).toBe(expectTotalTests)
  // assert that the expected number of tests failed
  expect(Object.entries(failedFiles).length).toBe(expectFailures)
  // assert that the expected number of tests errored
  expect(Object.entries(erroredFiles).length).toBe(expectErrors)
}

const getFailedTestsRunnerIDs = (bustedEvents) => {
  const failedRunnerIDs = []

  for (const e of bustedEvents) {
    if (!e.event) {
      continue
    }

    if (e.event.startsWith('failure') || e.event.startsWith('error')) {
      failedRunnerIDs.push(e.runnerID)
    }
  }

  return failedRunnerIDs
}

describe('schedule and run tests', () => {
  let artifacts
  let runId
  const runName = uuidv4()

  beforeAll(async () => {
    runId = await scheduleAndRun('tests/fixtures/res', runName)
    artifacts = await helpers.getWorkflowRunArtifacts(runId)
  }, TIMEOUT)

  it('generates schedule chunks correctly', () => {
    const scheduleChunks = artifacts['schedule-test-files']
    expect(scheduleChunks.length).toBe(RUNNER_COUNT)

    // validate content of the schedule chunks
    for (const chunk of scheduleChunks) {
      /*
       * chunk like:
       * {
       * 'test-chunk.1.json': '{"suite":"s1","filename":"t1_spec.lua"}\n{"suite":"s1","filename":"t2_spec.lua"}'
       * }
       */
      for (const item of Object.values(chunk)[0].split('\n')) {
        const test = JSON.parse(item)
        expect(test.suite).toBeDefined()
        expect(test.exclude_tags).toBeDefined()
        expect(test.filename).toBeDefined()
        expect(test.duration).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it(
    'runs all tests correctly and obtains expected results',
    async () => {
      /*
       * check that all tests were run and that the
       * expected number of tests passed, failed, and errored
       */
      const bustedEvents = aggregateBustedEvents(artifacts)
      assertExpectedTestResults(
        bustedEvents,
        ALL_TESTS,
        EXPECT_FAILURES_FILES,
        EXPECT_ERRORS_FILES,
      )

      // check that job outcomes are correct:
      const failedRunnerIDs = getFailedTestsRunnerIDs(bustedEvents)
      const jobs = await helpers.getJobs(runId)

      expect(failedRunnerIDs.length).toBeGreaterThan(0)
      expect(jobs.length).toBeGreaterThan(0)

      for (const job of jobs) {
        // filter the runner jobs
        const matchRunnerId = job.name.match(/\((\d+)\)/)
        if (!matchRunnerId) {
          continue
        }

        const runnerId = matchRunnerId[1]
        const conclusion = job.conclusion

        let expectedConclusion = 'success'
        if (runnerId && failedRunnerIDs.includes(runnerId)) {
          expectedConclusion = 'failure'
        }
        expect(conclusion).toBe(expectedConclusion)
      }
    },
    TIMEOUT,
  )

  it(
    'reruns all (and only) files with failed tests, when failed jobs are rerun',
    async () => {
      /*
       * check that all tests were run and that the
       * expected number of tests passed, failed, and errored
       */
      const bustedEvents = aggregateBustedEvents(artifacts)
      assertExpectedTestResults(
        bustedEvents,
        ALL_TESTS,
        EXPECT_FAILURES_FILES,
        EXPECT_ERRORS_FILES,
      )

      // fetch IDs of runners (jobs) that failed
      const failedRunnerIDs = getFailedTestsRunnerIDs(bustedEvents)

      // rerun and refresh artifacts and events
      const rerunId = await rerunFailed(runName, runId)
      const rerunArtifacts = await helpers.getWorkflowRunArtifacts(rerunId)
      const rerunBustedEvents = aggregateBustedEvents(rerunArtifacts)

      /*
       * rerunBustedEvents now includes all events of the workflow after the
       * rerun, including those from jobs that were *not* rerun. Filter to
       * only keep those from jobs that *were* rerun.
       */
      const rerunFailedEvents = rerunBustedEvents.filter((e) =>
        failedRunnerIDs.includes(e.runnerID),
      )
      assertExpectedTestResults(
        rerunFailedEvents,
        RERUN_TESTS,
        EXPECT_FAILURES_FILES,
        EXPECT_ERRORS_FILES,
      )
    },
    TIMEOUT,
  )
})
