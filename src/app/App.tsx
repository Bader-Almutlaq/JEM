import { Route, Routes } from 'react-router';
import { ViewTransitionRouter } from './navigation/ViewTransitionRouter';
import { AppChrome } from './AppChrome';
import { UpdateBanner } from './design/components/UpdateBanner';
import { MeasureScreen } from './features/body/MeasureScreen';
import { MuscleDetailScreen } from './features/analytics/MuscleDetailScreen';
import { AnalyticsScreen } from './features/analytics/AnalyticsScreen';
import { ExerciseDetailScreen } from './features/exercises/ExerciseDetailScreen';
import { ExerciseFormScreen } from './features/exercises/ExerciseFormScreen';
import { ExercisesScreen } from './features/exercises/ExercisesScreen';
import { HistoryScreen } from './features/history/HistoryScreen';
import { WorkoutDetailScreen } from './features/history/WorkoutDetailScreen';
import { ImportSourceScreen } from './features/import/ImportSourceScreen';
import { StrongImportScreen } from './features/import/StrongImportScreen';
import { StrongMatchingScreen } from './features/matching/StrongMatchingScreen';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { WorkoutPage } from './features/templates/WorkoutPage';
import { WorkoutExercisePage } from './features/templates/WorkoutExercisePage';
import { PlanScreen } from './features/templates/PlanScreen';
import { TemplateEditorScreen } from './features/templates/TemplateEditorScreen';
import { AddExerciseScreen } from './features/workout/AddExerciseScreen';
import { WorkoutScreen } from './features/workout/WorkoutScreen';
import { WorkoutSummaryScreen } from './features/workout/WorkoutSummaryScreen';

/** The app: five tabs, each a route. */
export function App() {
  return (
    <ViewTransitionRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<WorkoutScreen />} />
        <Route path="/workout/plans/:folderId" element={<PlanScreen />} />
        <Route path="/workout/workouts/:templateId" element={<WorkoutPage />} />
        <Route path="/workout/workouts/:templateId/exercises/:exerciseId" element={<WorkoutExercisePage />} />
        <Route path="/workout/add" element={<AddExerciseScreen />} />
        <Route path="/workout/templates/new" element={<TemplateEditorScreen />} />
        <Route path="/workout/templates/:templateId" element={<TemplateEditorScreen />} />
        <Route path="/workout/summary/:workoutId?" element={<WorkoutSummaryScreen />} />
        <Route path="/history" element={<HistoryScreen />} />
        <Route path="/history/:workoutId" element={<WorkoutDetailScreen />} />
        <Route path="/exercises" element={<ExercisesScreen />} />
        <Route path="/exercises/new" element={<ExerciseFormScreen />} />
        <Route path="/exercises/:exerciseId" element={<ExerciseDetailScreen />} />
        <Route path="/exercises/:exerciseId/edit" element={<ExerciseFormScreen />} />
        <Route path="/measure" element={<MeasureScreen />} />
        <Route path="/measure/:bodyPart" element={<MeasureScreen />} />
        <Route path="/analytics" element={<AnalyticsScreen />} />
        <Route path="/analytics/muscles/:muscle" element={<MuscleDetailScreen />} />
        <Route path="/settings/import" element={<ImportSourceScreen />} />
        <Route path="/settings/import/:source" element={<StrongImportScreen />} />
        <Route path="/settings/matching" element={<StrongMatchingScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
      </Routes>
      <UpdateBanner />
      <AppChrome />
    </ViewTransitionRouter>
  );
}
