import { useState } from 'react';
import { History } from 'lucide-react';
import { HeaderLink } from '../../design/components/HeaderLink';
import { WorkoutDrag } from '../../design/drag/WorkoutDrag';
import { Button } from '../../design/components/Button';
import { Screen } from '../../design/components/Screen';
import { startTemplateWorkout } from '../templates/templateActions';
import { TemplatesSection } from '../templates/TemplatesSection';
import { LoggingErrorBanner } from './LoggingErrorBanner';
import { startEmptyWorkout } from './workoutActions';

/** The Workout tab with nothing on screen to log: start an empty workout, or start a saved workout. */
export function StartWorkout({ hasActiveWorkout = false }: { readonly hasActiveWorkout?: boolean }) {
  const [isStarting, setIsStarting] = useState(false);
  // While a workout is in progress (swiped down) a second one cannot start; the strip below resumes it.
  const isBusy = isStarting || hasActiveWorkout;

  // One tap starts one workout; the button stays disabled until the start has finished, so a second tap can't ask for another.
  const start = (action: () => Promise<unknown>) => {
    setIsStarting(true);
    void action().then(() => setIsStarting(false));
  };

  return (
    <Screen title="Workout" trailing={<HeaderLink to="/history" label="History" icon={History} />}>
      <LoggingErrorBanner />
      {hasActiveWorkout && <p>A workout is in progress. Tap the strip above the tabs to go back to it.</p>}
      <Button variant="primary" isDisabled={isBusy} onPress={() => start(() => startEmptyWorkout())}>
        Start empty workout
      </Button>
      <WorkoutDrag>
        <TemplatesSection isBusy={isBusy} onStart={(templateId) => start(() => startTemplateWorkout(templateId))} />
      </WorkoutDrag>
    </Screen>
  );
}
