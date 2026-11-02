import type { Database } from '../db/Database';
import type { Template } from '../models/Template';
import type { TemplateFolder } from '../models/TemplateFolder';
import type { TemplateExerciseDraft, TemplateDraft, TemplateSetDraft } from '../templates/TemplateDraft';

/** A template summary with names in exercise order and a total set count. */
export interface TemplateSummary extends Template {
  readonly exerciseNames: readonly string[];
  readonly setCount: number;
}
/** A folder and its ordered templates. */
export interface TemplateFolderSummary extends TemplateFolder {
  readonly templates: readonly TemplateSummary[];
  /** Latest finished session among current workouts, or null when none have been performed. */
  readonly lastStartedAt: string | null;
}
/** Ordered folders and unfiled templates. */
export interface TemplateList {
  readonly folders: readonly TemplateFolderSummary[];
  readonly unfiled: readonly TemplateSummary[];
}
/** Read-only template queries. */
export const TemplateCatalog = {
  /** Returns all folders and templates in their stored order. */
  list(db: Database): TemplateList {
    return db.transaction(() => {
      const templates = db.all<Template>('SELECT * FROM template ORDER BY position, id').map((template) => ({
        ...template,
        lastStartedAt:
          db.value<string>(`SELECT MAX(startedAt) FROM workout WHERE templateId = ? AND isInProgress = 0`, [
            template.id,
          ]) ?? null,
        exerciseNames: db
          .all<{ name: string }>(
            `
          SELECT e.name FROM templateExercise te JOIN exercise e ON e.id = te.exerciseId
          WHERE te.templateId = ? ORDER BY te.position
        `,
            [template.id],
          )
          .map((row) => row.name),
        setCount:
          db.value<number>(
            `
          SELECT COUNT(*) FROM templateSet s JOIN templateExercise e ON e.id = s.templateExerciseId
          WHERE e.templateId = ?
        `,
            [template.id],
          ) ?? 0,
      }));
      const folders = db.all<TemplateFolder>('SELECT * FROM templateFolder ORDER BY position, id');
      return {
        folders: folders.map((folder) => ({
          ...folder,
          templates: templates
            .filter((item) => item.folderId === folder.id)
            .sort((a, b) => (a.weekday ?? 8) - (b.weekday ?? 8)),
          lastStartedAt:
            templates
              .filter((item) => item.folderId === folder.id)
              .flatMap((item) => (item.lastStartedAt === null ? [] : [item.lastStartedAt]))
              .sort()
              .at(-1) ?? null,
        })),
        unfiled: templates.filter((item) => item.folderId === null),
      };
    });
  },
  /** Returns an editor draft, or undefined when the template no longer exists. */
  detail(db: Database, templateId: number): TemplateDraft | undefined {
    return db.transaction(() => {
      const template = db.get<Pick<Template, 'id' | 'name' | 'folderId' | 'notes' | 'weekday'>>(
        'SELECT id, name, folderId, notes, weekday FROM template WHERE id = ?',
        [templateId],
      );
      if (template === undefined) return undefined;
      const exercises = db
        .all<Omit<TemplateExerciseDraft, 'sets'> & { id: number }>(
          `
        SELECT id, exerciseId, supersetGroup, notes, progression, machineBrand FROM templateExercise WHERE templateId = ? ORDER BY position
      `,
          [templateId],
        )
        .map(({ id, ...exercise }) => ({
          ...exercise,
          sets: db.all<TemplateSetDraft>(
            `
          SELECT kind, targetRepsLow, targetRepsHigh, targetRpe, targetRpeHigh FROM templateSet
          WHERE templateExerciseId = ? ORDER BY position
        `,
            [id],
          ),
        }));
      return { ...template, exercises };
    });
  },
};
