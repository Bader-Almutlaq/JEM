import { useState } from 'react';
import { History } from 'lucide-react';
import { Button } from '../../design/components/Button';
import { HeaderLink } from '../../design/components/HeaderLink';
import { Screen } from '../../design/components/Screen';
import { WorkoutDrag } from '../../design/drag/WorkoutDrag';
import { TemplatesSection } from '../templates/TemplatesSection';
import { startTemplateWorkout } from '../templates/templateActions';
import { LoggingErrorBanner } from './LoggingErrorBanner';
import { RestoreDataCard } from './RestoreDataCard';
import { startEmptyWorkout } from './workoutActions';

/** Empty-phone entry screen; reuses existing start actions and template controls alongside the restore card. */
export function RestoreWorkoutScreen() {
  const [starting, setStarting] = useState(false);
  const start = (action: () => Promise<unknown>) => {
    setStarting(true);
    void action().then(() => setStarting(false));
  };

  return (
    <Screen title="Workout" trailing={<HeaderLink to="/history" label="History" icon={History} />}>
      <LoggingErrorBanner />
      <RestoreDataCard />
      <Button variant="primary" isDisabled={starting} onPress={() => start(() => startEmptyWorkout())}>
        Start empty workout
      </Button>
      <WorkoutDrag>
        <TemplatesSection isBusy={starting} onStart={(templateId) => start(() => startTemplateWorkout(templateId))} />
      </WorkoutDrag>
    </Screen>
  );
}
