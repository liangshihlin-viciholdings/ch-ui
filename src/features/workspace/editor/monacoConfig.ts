// monacoConfig.ts
// Compatibility shim. The Monaco-based editor has been replaced with
// CodeMirror 6 (see codeMirrorConfig.ts, completionSource.ts, etc.). The
// workspaceStore still imports `retryInitialization` from this path to sync
// the legacy autocomplete client; with CodeMirror that work is done inside
// the completion source itself, so this export is now a no-op. Once the
// store import is removed in a follow-up, this file can be deleted.

export async function retryInitialization(
  _retries: number = 3,
  _delay: number = 2000,
): Promise<void> {
  // No-op: the CodeMirror completion source reads the ClickHouse client
  // from the workspace store on each invocation, so there is no separate
  // client to re-initialize here.
}
