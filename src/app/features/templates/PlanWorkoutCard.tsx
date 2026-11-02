import { weekdayText } from './weekday';
import { Clock, Ellipsis, Copy, FolderInput, Trash2, Pencil } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { TemplateSummary } from '../../../core/queries/TemplateCatalog';
import { ActionMenu } from '../../design/components/ActionMenu';
import type { TemplateListActions } from './TemplateListActions';
import { lastDoneText } from './lastDoneText';
import { templatePath } from './templatePaths';
import styles from './WorkoutPage.module.css';

/** A saved workout in a plan, with a separate management menu. */
export function PlanWorkoutCard({
  template,
  actions,
}: {
  readonly template: TemplateSummary;
  readonly actions: TemplateListActions;
}) {
  const navigate = useNavigate();
  const last = lastDoneText(template.lastStartedAt, new Date());
  return (
    <div className={styles.card}>
      <button className={styles.cardBody} type="button" onClick={() => actions.preview(template)}>
        <strong className={styles.cardName}>{template.name}</strong>
        {template.weekday !== null && <span className={styles.dayTag}>{weekdayText(template.weekday)}</span>}
        <span className={styles.summary}>{template.exerciseNames.join(', ')}</span>
        <span className={styles.secondary}>
          <Clock size={14} aria-hidden /> {last ?? 'Never done'}
        </span>
      </button>
      <div className={styles.cardMenu}>
        <ActionMenu
          label={`Options for ${template.name}`}
          items={[
            { label: 'Edit', icon: Pencil, onSelect: () => navigate(templatePath(template.id)) },
            { label: 'Duplicate', icon: Copy, onSelect: () => actions.duplicate(template) },
            { label: 'Move to plan', icon: FolderInput, onSelect: () => actions.requestMove(template) },
            { label: 'Delete', icon: Trash2, isDestructive: true, onSelect: () => actions.requestDelete(template) },
          ]}
        >
          <Ellipsis size={20} aria-hidden />
        </ActionMenu>
      </div>
    </div>
  );
}
