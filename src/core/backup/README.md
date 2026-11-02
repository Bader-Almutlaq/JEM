# backup

Backup files and restore. File naming and age, validation of an uploaded backup before anything is replaced, the restore sequence (snapshot first), the weekly reminder policy, cloud retention (which Dropbox files to delete) and `isDatabaseEmpty`, which stops an empty phone from overwriting a real backup.

Storage itself is implemented by the worker's `OnDeviceStore`; this folder only holds the rules. Never add a restore or merge path that can lose data without taking a snapshot first.
