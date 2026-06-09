/**
 * JOBS SERVICE
 *
 * Background job scheduler interface.
 *
 * Default behavior: no-op scheduler.
 *
 * Supports optional future integration with:
 * - BullMQ (Redis-backed)
 * - node-cron
 *
 * This file is additive only.
 */

function buildJobName(namespace, name) {
  return `${namespace}:${name}`;
}

class JobScheduler {
  constructor(options = {}) {
    this.queue = options.queue || null;
    this.cron = options.cron || null;
    this.jobs = new Map();
  }

  async schedule({ name, intervalMs, task }) {
    if (!name || typeof task !== 'function') {
      throw new Error('Job schedule requires a non-empty name and a task function.');
    }

    const jobName = buildJobName('scheduled', name);

    if (this.cron && typeof this.cron.schedule === 'function') {
      this.cron.schedule(jobName, intervalMs, task);
    }

    this.jobs.set(jobName, {
      name: jobName,
      intervalMs: Number(intervalMs) || 0,
      lastRun: null,
      lastStatus: 'registered',
    });

    return {
      name: jobName,
      status: 'registered',
      intervalMs: Number(intervalMs) || 0,
    };
  }

  async runNow({ name, payload = {} }) {
    const jobName = buildJobName('manual', name);

    return {
      name: jobName,
      status: 'completed',
      payload,
      executedAt: new Date().toISOString(),
      result: 'noop',
    };
  }

  getStatus(name) {
    if (!name) {
      return Array.from(this.jobs.values()).map((job) => ({
        ...job,
        status: job.lastStatus || 'registered',
      }));
    }

    const job = this.jobs.get(name) || this.jobs.get(buildJobName('scheduled', name)) || this.jobs.get(buildJobName('manual', name));

    if (!job) {
      return null;
    }

    return {
      ...job,
      status: job.lastStatus || 'registered',
    };
  }
}

const scheduler = new JobScheduler();

async function scheduleJob(options = {}) {
  return scheduler.schedule(options);
}

async function runJobNow(options = {}) {
  return scheduler.runNow(options);
}

function getJobStatus(name) {
  return scheduler.getStatus(name);
}

function listJobs() {
  return scheduler.getStatus();
}

module.exports = {
  JobScheduler,
  scheduleJob,
  runJobNow,
  getJobStatus,
  listJobs,
  scheduler,
};
