# templates

Workout templates ("plans") and their folders: save, edit, reorder, duplicate, delete, and save a finished workout as a template. `TemplateStore` does the atomic writes, `TemplateDraft` is the editable shape the screen works on, `TemplateStoreError` carries readable failures, and `TemplateStats` counts a draft's sets and averages its planned RPE for the editor's header.
