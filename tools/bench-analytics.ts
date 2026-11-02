/**
 * Times every analytics call the Analytics tab, the exercise page and the plan and workout pages make,
 * on a synthetic database at the owner's scale (about four years, 900 workouts, 25k sets, 80 exercises).
 * Never reads `export_data/`: the history comes from the seeded generator in
 * `src/core/queries/fixtures/SyntheticHistory.ts`.
 *
 * Run with `make bench`. Cold means straight after a write (every cached result invalidated);
 * warm is the median of repeated identical calls. Calls go through the real worker API, in Node.
 */
import type { SAHPoolUtil, Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { performance } from 'node:perf_hooks';
import { Database } from '../src/core/db/Database';
import { loadSqlite } from '../src/core/db/loadSqlite';
import { migrate } from '../src/core/db/migrations';
import { seedSyntheticHistory, type SyntheticHistory } from '../src/core/queries/fixtures/SyntheticHistory';
import { OnDeviceStore } from '../src/worker/OnDeviceStore';
import { createWorkerApi, type WorkerApi } from '../src/worker/WorkerApi';
import { analyticsPeriod, type AnalyticsPeriod } from '../src/app/features/analytics/analyticsPeriod';

/** Benchmark size and repetition. Heuristic: the owner's history per the T-091 brief; five warm runs give a stable median. */
const BenchShape = Object.freeze({
  seed: 20_261_102,
  weeks: 209,
  exerciseCount: 80,
  warmRuns: 5,
  /** Brief targets, in milliseconds: warm sections under 150 ms, cold under 1 s. */
  warmTargetMilliseconds: 150,
  coldTargetMilliseconds: 1000,
  periods: ['4W', '12W', '6M', '1Y', 'All'] as const satisfies readonly AnalyticsPeriod[],
  muscle: 'chest',
});

const LIVE_FILE = '/workouts.sqlite';

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

/** A file pool held in memory, standing in for the phone's private file system. SQLite itself is real. */
function memorySqlite(sqlite: Sqlite3Static, files: Map<string, Uint8Array>): Sqlite3Static {
  class MemoryPoolDatabase extends sqlite.oo1.DB {
    constructor(fileName: string) {
      super(':memory:', 'c');
      const bytes = files.get(fileName);
      if (bytes === undefined) return;
      const pointer = sqlite.wasm.allocFromTypedArray(bytes);
      const flags = sqlite.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite.capi.SQLITE_DESERIALIZE_RESIZEABLE;
      if (sqlite.capi.sqlite3_deserialize(this, 'main', pointer, bytes.length, bytes.length, flags) !== 0)
        throw new Error(`Cannot open ${fileName}`);
    }
  }
  // OnDeviceStore uses exactly these members of the pool; the rest of the interface is never touched here.
  const pool = {
    OpfsSAHPoolDb: MemoryPoolDatabase,
    reserveMinimumCapacity: async () => undefined,
    getFileNames: () => [...files.keys()],
    unlink: (name: string) => files.delete(name),
    importDb: async (name: string, bytes: Uint8Array) => {
      files.set(name, bytes.slice());
    },
  } as unknown as SAHPoolUtil;
  return { ...sqlite, installOpfsSAHPoolVfs: async () => pool };
}

async function openBenchmark(): Promise<{ api: WorkerApi; store: OnDeviceStore; history: SyntheticHistory }> {
  const sqlite = await loadSqlite();
  const seeded = await Database.openInMemory();
  const end = new Date();
  migrate(seeded, end);
  const history = seedSyntheticHistory(seeded, {
    seed: BenchShape.seed,
    weeks: BenchShape.weeks,
    exerciseCount: BenchShape.exerciseCount,
    end,
  });
  const files = new Map([[LIVE_FILE, seeded.exportBytes()]]);
  seeded.close();
  const store = await OnDeviceStore.open(memorySqlite(sqlite, files), end);
  return { api: createWorkerApi(Promise.resolve(store)), store, history };
}

interface Timing {
  readonly name: string;
  readonly cold: number;
  readonly warm: number;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

async function elapsed(work: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  await work();
  return performance.now() - start;
}

/** A harmless write: like any write, it invalidates every cached result. */
function invalidate(store: OnDeviceStore): void {
  store.database.run("INSERT OR REPLACE INTO appSetting (key, value) VALUES ('benchmarkInvalidation', ?)", [
    String(performance.now()),
  ]);
}

async function time(store: OnDeviceStore, name: string, work: () => Promise<unknown>): Promise<Timing> {
  invalidate(store);
  const cold = await elapsed(work);
  const warm: number[] = [];
  for (let run = 0; run < BenchShape.warmRuns; run += 1) warm.push(await elapsed(work));
  return { name, cold, warm: median(warm) };
}

function report(title: string, timings: readonly Timing[]): void {
  print(`\n${title}`);
  print(`${'call'.padEnd(48)}${'cold ms'.padStart(10)}${'warm ms'.padStart(10)}`);
  for (const timing of timings) {
    const flag =
      timing.warm > BenchShape.warmTargetMilliseconds || timing.cold > BenchShape.coldTargetMilliseconds ? '  !' : '';
    print(
      `${timing.name.padEnd(48)}${timing.cold.toFixed(1).padStart(10)}${timing.warm.toFixed(1).padStart(10)}${flag}`,
    );
  }
}

async function analyticsTab(api: WorkerApi, store: OnDeviceStore, period: AnalyticsPeriod): Promise<Timing[]> {
  const first = await api.firstFinishedWorkout();
  const range = analyticsPeriod(period, new Date(), first);
  const start = range.from.toISOString();
  const end = range.to.toISOString();
  const last = new Date(range.to.getTime() - 1).toISOString();
  const prior = range.previous?.from.toISOString() ?? null;
  const pins = await api.pinnedExercises();
  const pinnedLifts = () =>
    Promise.all([
      api.exerciseEntries(),
      ...pins.flatMap((pin) => [api.exerciseDetail(pin.exerciseId), api.exerciseStrength(pin.exerciseId)]),
    ]);
  const calls: readonly (readonly [string, () => Promise<unknown>])[] = [
    ['analyticsOverview', () => api.analyticsOverview(start, end, prior)],
    ['strengthRanking', () => api.strengthRanking(start, end)],
    ['muscleDashboard', () => api.muscleDashboard(start, last)],
    ['intensityMix', () => api.intensityMix(start, last)],
    ['weeklyEffort', () => api.weeklyEffort(start, last)],
    [`muscleDetail (${BenchShape.muscle})`, () => api.muscleDetail(start, last, BenchShape.muscle)],
    ['pinned lifts (entries, detail, strength)', pinnedLifts],
  ];
  const timings: Timing[] = [];
  for (const [name, work] of calls) timings.push(await time(store, name, work));
  timings.push(
    await time(store, 'whole tab (as the screen loads it)', () =>
      Promise.all([
        pinnedLifts(),
        api.activePlanId(),
        api.templateList(),
        ...calls.slice(0, 5).map(([, work]) => work()),
      ]),
    ),
  );
  return timings;
}

async function exercisePage(api: WorkerApi, store: OnDeviceStore, exerciseId: number): Promise<Timing[]> {
  const calls: readonly (readonly [string, () => Promise<unknown>])[] = [
    ['exerciseDetail', () => api.exerciseDetail(exerciseId)],
    ['exerciseStrength', () => api.exerciseStrength(exerciseId)],
    ['exerciseProgress', () => api.exerciseProgress(exerciseId)],
    ['exerciseCharts', () => api.exerciseCharts(exerciseId)],
    ['exerciseRecords', () => api.exerciseRecords(exerciseId)],
    ['exerciseRpeChart', () => api.exerciseRpeChart(exerciseId)],
    ['exerciseHistory (first page)', () => api.exerciseHistory(exerciseId, 0)],
  ];
  const timings: Timing[] = [];
  for (const [name, work] of calls) timings.push(await time(store, name, work));
  timings.push(
    await time(store, 'Charts tab (detail, strength, charts, progress)', () =>
      Promise.all([
        api.exerciseDetail(exerciseId),
        api.exerciseStrength(exerciseId),
        api.exerciseCharts(exerciseId),
        api.exerciseProgress(exerciseId),
      ]),
    ),
  );
  return timings;
}

async function planPages(api: WorkerApi, store: OnDeviceStore, history: SyntheticHistory): Promise<Timing[]> {
  const folderId = history.folderIds.at(-1) ?? 0;
  const templateId = history.templateIds.at(-1) ?? 0;
  const template = await api.templateDetail(templateId);
  const firstExercise = template?.exercises[0]?.exerciseId ?? history.mostTrainedExerciseId;
  return [
    await time(store, 'templateAnalytics (plan)', () => api.templateAnalytics({ folderId })),
    await time(store, 'templateSessions (plan)', () => api.templateSessions({ folderId })),
    await time(store, 'templateMuscleSummary (plan)', () => api.templateMuscleSummary({ folderId })),
    await time(store, 'templateAnalytics (workout)', () => api.templateAnalytics({ templateId })),
    await time(store, 'templateSessions (workout)', () => api.templateSessions({ templateId })),
    await time(store, 'exerciseProgress (workout scope)', () => api.exerciseProgress(firstExercise, templateId)),
  ];
}

async function main(): Promise<void> {
  const built = performance.now();
  const { api, store, history } = await openBenchmark();
  print(
    `Synthetic history: ${history.workoutCount} workouts, ${history.setCount} sets, ${history.exerciseIds.length} exercises ` +
      `(built in ${((performance.now() - built) / 1000).toFixed(1)} s)`,
  );
  for (const period of BenchShape.periods) report(`Analytics tab, ${period}`, await analyticsTab(api, store, period));
  report(
    `Exercise page (most trained exercise, id ${history.mostTrainedExerciseId})`,
    await exercisePage(api, store, history.mostTrainedExerciseId),
  );
  report('Plan and workout pages', await planPages(api, store, history));
  print(
    `\n"!" marks a call above the targets (warm ${BenchShape.warmTargetMilliseconds} ms, cold ${BenchShape.coldTargetMilliseconds} ms).`,
  );
  store.database.close();
}

await main();
