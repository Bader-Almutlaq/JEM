/**
 * Small synthetic Strong exports. Each mimics a quirk of real exports (documented in
 * `docs/DATA.md`) without using the owner's data. Timestamps are local time: tests that parse
 * them pin the time zone first (`vi.stubEnv('TZ', 'UTC')`).
 */

const OLDER_HEADER =
  'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE';

/**
 * Older comma layout. Two workouts:
 * - Bench (kg column) with one set typed in lb (61.23 = 135 lb), a warm-up and a failure set.
 * - Leg curl (lb column): 99.21 = 45 kg typed in kg, 140 typed in lb.
 * - A workout note and a quoted name containing a comma.
 */
export const OLDER_LAYOUT = [
  OLDER_HEADER,
  '2024-01-01 10:00:00,"Push, heavy",1h 7m,"Bench Press (Barbell)",W,40.0,10.0,0,0.0,"","Felt good",',
  '2024-01-01 10:00:00,"Push, heavy",1h 7m,"Bench Press (Barbell)",1,61.23,8.0,0,0.0,,,8',
  '2024-01-01 10:00:00,"Push, heavy",1h 7m,"Bench Press (Barbell)",F,60.0,6.0,0,0.0,,,10',
  '2024-01-01 10:00:00,"Push, heavy",1h 7m,"Seated Leg Curl (Machine)",1,99.21,12.0,0,0.0,"",,7',
  '2024-01-08 10:00:00,"Legs",59m,"Seated Leg Curl (Machine)",1,140.0,10.0,0,0.0,"",,8',
  '2024-01-08 10:00:00,"Legs",59m,"Seated Leg Curl (Machine)",D,63.93,15.0,0,0.0,"",,',
].join('\n');

/** Newer semicolon layout with "Workout #", a Note row and a Rest Timer row. */
export const NEWER_LAYOUT = [
  '"Workout #";"Date";"Workout Name";"Duration (sec)";"Exercise Name";"Set Order";"Weight (kg)";"Reps";"RPE";"Distance (meters)";"Seconds";"Notes";"Workout Notes"',
  '"1";"2026-03-02 18:30:00";"Pull";"3600";"Lat Pulldown (Cable)";"1";"60";"10";"8.5";"";"";"";""',
  '"1";"2026-03-02 18:30:00";"Pull";"3600";"Lat Pulldown (Cable)";"Note";"";"";"";"";"";"Use the wide bar";""',
  '"1";"2026-03-02 18:30:00";"Pull";"3600";"Lat Pulldown (Cable)";"Rest Timer";"";"";"";"";"120";"";""',
  '"1";"2026-03-02 18:30:00";"Pull";"3600";"Lat Pulldown (Cable)";"2";"60";"9";"9";"";"";"";""',
].join('\n');

/** One measurement file, Strong's per-site layout. */
export const WAIST = [
  'Date,Measurement Type,Value,Unit,Source',
  '2026-02-18 09:13:35,Waist,78,cm,Strong',
  '2025-07-11 11:16:13,Waist,31,in,Strong',
].join('\n');

/** Ten weekly squat sessions at ~100 kg with one typo (1000 kg) in week 5. */
export function squatHistoryWithTypo(): string {
  const lines = [OLDER_HEADER];
  for (let week = 0; week < 10; week += 1) {
    const day = `2025-01-${String(1 + week * 3).padStart(2, '0')} 10:00:00`;
    const typo = week === 5;
    lines.push(`${day},Legs,1h,Squat (Barbell),1,${typo ? '1000.0' : '100.0'},5.0,0,0.0,,,8`);
    lines.push(`${day},Legs,1h,Squat (Barbell),2,100.0,5.0,0,0.0,,,8`);
  }
  return lines.join('\n');
}

/**
 * Continental-locale semicolon layout (older column set): decimal commas in weight and RPE, a
 * quoted comma in a name, and a per-row `Weight Unit` / `Distance Unit` pair. The exercise
 * "Row (Cable)" is exported in kg in one workout and in lb in the next.
 */
export const EUROPEAN_WITH_UNITS = [
  'Date;Workout Name;Duration;Exercise Name;Set Order;Weight;Weight Unit;Reps;Distance;Distance Unit;Seconds;Notes;Workout Notes;RPE',
  '2024-02-05 07:30:00;"Rücken, schwer";1h 3m;Row (Cable);1;62,5;kg;8;0;m;0;;;8,5',
  '2024-02-05 07:30:00;"Rücken, schwer";1h 3m;Run (Treadmill);1;0;kg;0;2,4;km;750;;;',
  '2024-02-12 07:30:00;Back;55m;Row (Cable);1;135;lbs;8;0;;0;;;',
].join('\n');
