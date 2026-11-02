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
});
