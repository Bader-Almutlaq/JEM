import { weekdayText } from './weekday';
import { TemplateMuscleList } from './TemplateMuscleList';
import { useState } from 'react';
import { Copy, Ellipsis, FolderInput, Pencil, Trash2 } from 'lucide-react';
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { database, useDatabaseQuery } from '../../data/database';
import { ActionMenu } from '../../design/components/ActionMenu';
import { BackLink } from '../../design/components/BackLink';
import { Button } from '../../design/components/Button';
import { EmptyState } from '../../design/components/EmptyState';
import { Screen } from '../../design/components/Screen';
import { SegmentedControl } from '../../design/components/SegmentedControl';
import { dayWithYearText } from '../../format/dateText';
import { LoggingErrorBanner } from '../workout/LoggingErrorBanner';
import { TemplateDialogs } from './TemplateDialogs';
import { WorkoutPreview } from './WorkoutPreview';
import { ScopedTemplateAnalytics } from './ScopedTemplateAnalytics';
import { TemplateSessionHistory } from './TemplateSessionHistory';
import { duplicateTemplate, startTemplateWorkout } from './templateActions';
import type { TemplateDialogState } from './templateDialogState';
import { templatePath } from './templatePaths';
import styles from './WorkoutPage.module.css';

const sections = [
  { value: 'exercises', label: 'Exercises' },
  { value: 'history', label: 'History' },
  { value: 'analytics', label: 'Analytics' },
] as const;

/** A saved workout, its exercises and its scoped session history. */
export function WorkoutPage() {
  const id = Number(useParams().templateId);
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<TemplateDialogState | undefined>();
  const [starting, setStarting] = useState(false);
  const draft = useDatabaseQuery(`template-${id}`, () => database.templateDetail(id));
  const report = useDatabaseQuery(`template-sessions-${id}`, () => database.templateSessions({ templateId: id }));
  const list = useDatabaseQuery('template-list', () => database.templateList());
  const muscleSummary = useDatabaseQuery(`template-muscles-${id}`, () =>
    database.templateMuscleSummary({ templateId: id }),
  );
  const active = useDatabaseQuery('active-workout', () => database.activeWorkoutId());
  if (draft.status === 'ready' && draft.value === null) return <Navigate to="/" replace />;
  if (
    draft.status !== 'ready' ||
    draft.value === null ||
    report.status !== 'ready' ||
    list.status !== 'ready' ||
    active.status !== 'ready'
  ) {
    const failure = [draft, report, list, active].find((query) => query.status === 'failed');
    return (
      <Screen title="Workout" leading={<BackLink to="/" label="Workout" />}>
        <EmptyState message={failure?.status === 'failed' ? failure.message : 'Loading…'} />
      </Screen>
    );
  }
  const template = draft.value;
  const summary = [...list.value.unfiled, ...list.value.folders.flatMap((folder) => folder.templates)].find(
    (item) => item.id === id,
  );
  if (summary === undefined) return <Navigate to="/" replace />;
  const requested = params.get('tab');
  const tab = requested === 'history' || requested === 'analytics' ? requested : 'exercises';
  const from =
    typeof location.state?.from === 'string' && location.state.from.startsWith('/')
      ? location.state.from
      : template.folderId === null
        ? '/'
        : `/workout/plans/${template.folderId}`;
  const latest = report.value.sessions[0];
  return (
    <Screen
      title={template.name}
      leading={<BackLink to={from} label="Back" />}
      trailing={
        <div className={styles.headerActions}>
          <Button onPress={() => navigate(templatePath(id, template.folderId ?? undefined))}>Edit</Button>
          <ActionMenu
            label={`Options for ${template.name}`}
            items={[
              {
                label: 'Edit',
                icon: Pencil,
                onSelect: () => navigate(templatePath(id, template.folderId ?? undefined)),
              },
              { label: 'Duplicate', icon: Copy, onSelect: () => duplicateTemplate(id) },
              {
                label: 'Move to plan',
                icon: FolderInput,
                onSelect: () => setDialog({ kind: 'moveTemplate', template: summary }),
              },
              {
                label: 'Delete',
                icon: Trash2,
                isDestructive: true,
                onSelect: () => setDialog({ kind: 'deleteTemplate', template: summary }),
              },
            ]}
          >
            <Ellipsis size={20} aria-hidden />
          </ActionMenu>
        </div>
      }
    >
      <div className={styles.stack}>
        <LoggingErrorBanner />
        {template.notes?.trim() && <p>{template.notes}</p>}
        <p className={styles.secondary}>
          {template.weekday !== null && template.weekday !== undefined && (
            <span className={styles.dayTag}>{weekdayText(template.weekday)}</span>
          )}{' '}
          {latest === undefined ? 'Never done' : `Last done: ${dayWithYearText(latest.startedAt)}`}
        </p>
        <SegmentedControl
          label="Workout view"
          options={sections}
          value={tab}
          onChange={(next) => {
            const updated = new URLSearchParams(params);
            updated.set('tab', next);
            setParams(updated);
          }}
        />
        {tab === 'exercises' && <WorkoutPreview templateId={id} />}
        {tab === 'exercises' && muscleSummary.status === 'ready' && (
          <TemplateMuscleList summary={muscleSummary.value} weekly={false} />
        )}
        {tab === 'exercises' && muscleSummary.status === 'failed' && <EmptyState message={muscleSummary.message} />}
        {tab === 'history' && <TemplateSessionHistory sessions={report.value.sessions} />}
        {tab === 'analytics' && <ScopedTemplateAnalytics id={id} plan={false} />}
      </div>
      <div className={styles.footer}>
        <Button
          variant="primary"
          isDisabled={starting || active.value !== null}
          onPress={() => {
            setStarting(true);
            void startTemplateWorkout(id).then((workoutId) => {
              setStarting(false);
              if (workoutId !== undefined) navigate('/');
            });
          }}
        >
          Start this workout
        </Button>
        {active.value !== null && <div className={styles.secondary}>A workout is in progress</div>}
      </div>
      <TemplateDialogs
        dialog={dialog}
        list={list.value}
        isBusy={starting}
        onStart={() => undefined}
        onClose={() => setDialog(undefined)}
      />
    </Screen>
  );
}
