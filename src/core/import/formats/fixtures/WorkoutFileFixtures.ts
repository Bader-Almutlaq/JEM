/**
 * Small invented exports only; none of these dialects has been checked against an owner's file.
 * `docs/research/import-formats.md` says which headers and timestamp shapes are confirmed from public sources.
 */
export const WorkoutFileFixtures = Object.freeze({
  hevy: [
    'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_lbs,reps,distance_miles,duration_seconds,rpe,ignored',
    '"Push, heavy","26 Oct 2024, 18:00","26 Oct 2024, 19:00",Good session,Bench,,"Wide grip, pause",0,warmup,45,8,,,6,x',
    '"Push, heavy","26 Oct 2024, 18:00","26 Oct 2024, 19:00",Good session,Bench,,"Wide grip, pause",1,normal,135,5,,,8,x',
    '"Push, heavy","26 Oct 2024, 18:00","26 Oct 2024, 19:00",Good session,Bench,,,2,dropset,90,8,,,9,x',
    '"Push, heavy","26 Oct 2024, 18:00","26 Oct 2024, 19:00",Good session,Bench,,,3,failure,90,4,1,65,10,x',
  ].join('\n'),
  fitnotes: [
    'Date,Exercise,Category,Weight (lbs),Reps,Distance,Distance Unit,Time,Comment,Ignored',
    '2024-03-10,Curl,Arms,20,8,,,,"Pause, then lift",x',
    '2024-03-11,Run,Cardio,0,0,1,miles,01:02:03,"Steady ""pace""",x',
    '2024-03-10,Curl,Arms,25,6,,,,Last set,x',
  ].join('\n'),
  fitbod: [
    'Date,Exercise,Reps,Weight(lb),Duration(s),Distance(m),Incline,Resistance,isWarmup,Note,multiplier,Ignored',
    '2024-11-03 01:30:15,Curl,8,20,,,,,true,"Pause, lift",2,x',
    '2024-11-03 01:30:55,Curl,6,30,,,,,false,"Keep ""steady""",2,x',
    '2024-11-03 01:31:00,Run,0,0,65,400,,,false,,1,x',
    '2024-11-04,Curl,8,25,,,,,false,,2,x',
  ].join('\n'),
  /** Fitbod's published column order and its `yyyy-MM-dd HH:mm:ss +ZZZZ` timestamps (offset without a colon). */
  fitbodWithOffsets: [
    'Date,Exercise,Reps,Weight(kg),Duration(s),Distance(m),Incline,Resistance,isWarmup,Note,multiplier',
    '2024-12-27 10:02:51 +0000,Dumbbell Curl,10,9.07,0,0,0,0,true,,2',
    '2024-12-27 10:02:51 +0000,Dumbbell Curl,8,12.7,0,0,0,0,false,"Slow, controlled",2',
    '2024-12-28 18:00:05 +0100,Running,0,0,600,2000,0,0,false,,1',
  ].join('\n'),
  /** Hevy's kilogram export with the dotted-month timestamp style and a superset id. */
  hevyKilograms: [
    'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe',
    'Pull,"3 Jan 2025, 07:05","3 Jan 2025, 08:00",,Lat Pulldown,1,,0,normal,52.5,10,,,8.5',
    'Pull,"3 Jan 2025, 07:05","3 Jan 2025, 08:00",,Lat Pulldown,1,,1,normal,52.5,9,,,9',
  ].join('\n'),
  /** Current FitNotes (Android) layout: one `Weight` column with the unit written on each row. */
  fitnotesWeightUnit: [
    'Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time,Comment',
    '2026-04-29,Bench Press,Chest,80,kgs,5,,,,',
    '2026-04-29,Seated Row,Back,135,lbs,10,,,,"Slow, controlled"',
    '2026-05-02,Treadmill,Cardio,,,,5,km,30:00,',
    '2026-05-02,Plank,Core,,,,,,01:15,',
  ].join('\n'),
  /** FitNotes 2 (iOS) import layout: separate kg and lb columns, `Notes` and a `Kind` letter code. */
  fitnotesTwoLayout: [
    'Date,Exercise,Category,Weight (kg),Weight (lbs),Reps,Distance,Distance Unit,Time,Notes,Kind',
    '2026-04-29,Bench Press,Chest,80,,5,,,,,wr',
    '2026-04-30,Seated Row,Back,,135,10,,,,"Pause, squeeze",wr',
  ].join('\n'),
  /** Fitbod's iOS export pads some numbers with a leading space. */
  fitbodPadded: [
    'Date,Exercise,Reps,Weight(kg),Duration(s),Distance(m),Incline,Resistance,isWarmup,Note,multiplier',
    '2026-10-24 18:24:59 +0000,Barbell Incline Bench Press, 10,20.0,0.0,0.0,0.0,0.0,true,, 1.0',
    '2026-10-24 18:24:59 +0000,Barbell Incline Bench Press, 8,60.0,0.0,0.0,0.0,0.0,false,"felt heavy, stop at 8", 1.0',
  ].join('\n'),
});
