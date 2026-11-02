/** Public default for the owner’s Dropbox app; a device can select its own app instead. */
export const DROPBOX_APP_KEY: string = 'b8z4v0ynb7g98v6';

/**
 * Keys of Dropbox apps that were deleted. A phone that saved one in Advanced would keep connecting through a
 * dead app (Dropbox answers "app disabled") even after the built-in key changed, so a saved retired key is dropped.
 */
export const RETIRED_DROPBOX_APP_KEYS: readonly string[] = ['jzqiomik3a47qoz'];
