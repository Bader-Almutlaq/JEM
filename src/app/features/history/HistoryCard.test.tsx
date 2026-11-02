import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { expect, test } from 'vitest';
import type { WorkoutExerciseBest } from '../../../core/queries/WorkoutExerciseBests';
import { HistoryCard } from './HistoryCard';

function exercise(name: string, overrides: Partial<WorkoutExerciseBest['best']> = {}): WorkoutExerciseBest {
  return {
    workoutId: 1,
    exerciseId: 1,
    name,
    tracking: 'weight-reps',
    setCount: 3,
    best: { weightKilograms: 90, reps: 5, durationSeconds: null, rpe: 6, entryUnit: 'kg', ...overrides },
  };
}

function render(exercises: readonly WorkoutExerciseBest[], extra: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <HistoryCard
        to="/history/1"
        name="Full Squat Fri"
        dateLine="Sat, Oct 31 at 5:10 PM"
        duration="82 min"
        setCount={13}
        volumeKilograms={11532}
        exercises={exercises}
        {...extra}
      />
    </MemoryRouter>,
  );
}

test('shows the name, date, duration, volume and sets, with each exercise beside its best set', () => {
  const html = render([
    exercise('Squat (Barbell)'),
    exercise('Leg Extension', { weightKilograms: 131, reps: 6, rpe: 8.5 }),
  ]);
  expect(html).toContain('Full Squat Fri');
  expect(html).toContain('Sat, Oct 31 at 5:10 PM');
  expect(html).toContain('82 min');
  expect(html).toContain('11,532 kg');
  expect(html).toContain('13 sets');
  expect(html).toContain('3 × Squat (Barbell)');
  expect(html).toContain('90 kg × 5 @ 6');
  expect(html).toContain('131 kg × 6 @ 8.5');
  expect(html).toContain('href="/history/1"');
});

test('shows a best in the unit it was typed in, and leaves out an unknown duration and zero bests', () => {
  const html = render(
    [exercise('Seated Row', { weightKilograms: 61.23496995, reps: 10, rpe: null, entryUnit: 'lb' })],
    {
      duration: undefined,
    },
  );
  expect(html).toContain('135 lb × 10');
  expect(html).not.toContain('@');
  expect(html).not.toContain('min');
  expect(html).not.toContain('bests');
});

test('counts personal bests and says how many more exercises there are past the first five', () => {
  const many = Array.from({ length: 8 }, (_, index) => exercise(`Lift ${index + 1}`));
  const html = render(many, { bestsCount: 2 });
  expect(html).toContain('2 bests');
  expect(html).toContain('Lift 5');
  expect(html).not.toContain('Lift 6');
  expect(html).toContain('+3 more');
});

test('a workout with no exercises shows just its totals', () => {
  expect(render([])).not.toContain('Best set');
});
