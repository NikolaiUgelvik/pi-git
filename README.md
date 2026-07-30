<p>
  <img src="assets/banner.png" alt="pi-git-tui showing a syntax-highlighted historical diff" width="1100">
</p>

# Pi Git TUI

A GitHub Desktop-style diff, staging, history, and commit workflow inside [Pi](https://github.com/badlogic/pi-mono).

Review syntax-highlighted changes, move files between the working tree and index, browse commits, manage branches, tags, and stashes, and commit without leaving Pi.

## Why This Exists

Pi is already where the code changes happen. Reviewing those changes should not require switching to another app or reconstructing the state of the index from terminal commands.

`pi-git-tui` adds one full-screen `/diff` view with:

- a file tree and responsive diff viewport;
- separate, index-exact working and staged views;
- syntax highlighting with GitHub Desktop-style intraline changes;
- commit history, branch, tag, stash, and worktree pickers;
- guarded Git commands and recoverable async operations.

Normal Git operations stay local. The model is only involved when you explicitly ask Pi to generate a commit message.

## Install

Install the packaged extension from npm:

```bash
pi install npm:pi-git-tui
```

Or directly from GitHub:

```bash
pi install git:github.com/NikolaiUgelvik/pi-git-tui
```

Restart Pi after installation.

## Quick Start

Open the viewer from any directory inside a Git repository:

```text
/diff
```

The viewer opens on working-tree changes. Press <kbd>?</kbd> or <kbd>F1</kbd> at any time for context-sensitive help.

## Everyday Workflow

| Key | What it does |
|-----|--------------|
| <kbd>Tab</kbd> | Switch between the file tree and diff |
| <kbd>↑</kbd>/<kbd>↓</kbd> or <kbd>j</kbd>/<kbd>k</kbd> | Move through files or scroll the diff |
| <kbd>n</kbd>/<kbd>p</kbd> | Select the next or previous file |
| <kbd>v</kbd> | Toggle working and staged views |
| <kbd>Enter</kbd> | Stage the selected working file or unstage the selected staged file |
| <kbd>Shift</kbd>+<kbd>Enter</kbd> | Stage all remaining changes or unstage everything |
| <kbd>C</kbd> | Review staged changes; press again to open the commit dialog |
| <kbd>c</kbd> | Browse the working tree and recent commits |
| <kbd>t</kbd> | Browse tags or create one at a selected commit |
| <kbd>Ctrl</kbd>+<kbd>P</kbd> | Open the Git command menu |
| <kbd>r</kbd> | Reload the active diff or retry a failed refresh |
| <kbd>Shift</kbd>+<kbd>S</kbd> | Open Pi Git TUI settings |
| <kbd>?</kbd> / <kbd>F1</kbd> | Open context-sensitive help |
| <kbd>q</kbd> / <kbd>Esc</kbd> | Close the viewer or active overlay |

The diff viewport also supports half-page scrolling and fixed line-number gutters. Long lines wrap by default; when wrapping is disabled, use <kbd>←</kbd>/<kbd>→</kbd> to scroll horizontally and <kbd>Shift</kbd>+<kbd>←</kbd>/<kbd>→</kbd> for larger jumps.

## Settings

Press <kbd>Shift</kbd>+<kbd>S</kbd> inside `/diff` to open the settings overlay. Use <kbd>Enter</kbd> or <kbd>Space</kbd> to change a value, <kbd>Ctrl</kbd>+<kbd>S</kbd> to save, or <kbd>Esc</kbd> to discard the draft.

Settings are global and stored in `pi-git-tui.json` inside Pi's agent directory—normally `~/.pi/agent/pi-git-tui.json`, or the directory selected by `PI_CODING_AGENT_DIR`:

```json
{
  "diff": {
    "wrap": true
  }
}
```

## Staging and Committing

The working and staged views come directly from Git. `pi-git-tui` does not approximate one from the other, so partially staged and mixed files remain accurate.

A typical commit flow:

1. Select a file and press <kbd>Enter</kbd> to stage its remaining changes.
2. Press <kbd>v</kbd> to inspect the exact staged diff.
3. Press <kbd>C</kbd> to enter staged review, then <kbd>C</kbd> again to compose the commit.
4. Type a message, or press <kbd>Ctrl</kbd>+<kbd>G</kbd> to generate one from the staged diff.
5. Press <kbd>Enter</kbd> to commit.

Inside the commit dialog, <kbd>Ctrl</kbd>+<kbd>X</kbd> toggles amend mode. Normal commits are blocked when the index is empty; amend remains available when the repository has an existing `HEAD`.

## History and Repository Tools

### Commit history

Press <kbd>c</kbd> to search recent commits by hash or message. Select a commit to inspect its diff, then press <kbd>W</kbd> to return directly to the working tree.

### Branches, tags, worktrees, and stashes

| Key | Tool |
|-----|------|
| <kbd>b</kbd> | Search and switch branches; <kbd>Ctrl</kbd>+<kbd>N</kbd> creates one |
| <kbd>t</kbd> | Search tags and inspect their commits; <kbd>Ctrl</kbd>+<kbd>N</kbd> starts annotated or lightweight tag creation |
| <kbd>w</kbd> | Search and switch worktrees |
| <kbd>s</kbd> | Create, apply, pop, or drop stashes |
| <kbd>D</kbd> | Review and confirm discarding the selected working-tree file |
| <kbd>I</kbd> | Initialize Git when the current directory is not a repository |

### Git command menu

Press <kbd>Ctrl</kbd>+<kbd>P</kbd> to search and run common commands:

- fetch, fetch with prune, or fetch all remotes;
- pull, fast-forward-only pull, or pull with rebase;
- push, push tags, or force-push with lease;
- initialize and update submodules.

Force-push always performs a porcelain dry run, shows the resolved destination and ref updates, and requires a second confirmation before execution.

## Diff Rendering

- Syntax highlighting is resolved from each file path, including renamed files.
- Added and deleted blocks use subtle theme backgrounds while intraline changes use a stronger shade.
- Intraline highlighting follows GitHub Desktop's behavior: equal-sized change blocks are paired by position, then the common prefix and suffix are removed to reveal one changed range.
- Long content wraps at whitespace when possible, falling back to hard wrapping only for overlong tokens; continuation rows use a blank gutter.
- Tabs, combining characters, CJK text, emoji, and wide graphemes remain safe during wrapping and horizontal slicing.
- Unsupported, binary, malformed, and oversized inputs fall back to a bounded plain presentation.
- Narrow terminals switch to a single focused panel instead of squeezing both panes together.

## Safety

Git state can change while a command is running, so the viewer treats every load and mutation as an explicit operation:

- destructive actions require confirmation;
- Escape cancels active observation and triggers reconciliation when a mutation may already have taken effect;
- failed post-mutation refreshes retry the refresh only—the Git mutation is never run twice;
- stale async results cannot overwrite a newer repository, worktree, or document;
- large files and diffs stay visible as `(omitted)` entries with the measured limit and reason instead of being truncated mid-hunk;
- Git commands use bounded local, mutation, and network timeouts.

## How It Works

1. `/diff` captures one strict porcelain-v2 repository snapshot.
2. Staged and working patches are loaded as separate bounded slices.
3. Parsed files become immutable presentation rows with syntax and intraline styling.
4. Tree, presentation, and filtered-list caches keep navigation and scrolling responsive.
5. A single operation coordinator serializes loads, mutations, cancellation, reconciliation, and refresh-only recovery.

See [`docs/architecture.md`](docs/architecture.md) for the full state model, Git boundaries, rendering pipeline, and testing strategy.

## Development

Run the extension directly from source:

```bash
npm install
npm run dev
```

Useful development commands:

```bash
# Persistent type checking
npm run typecheck:watch

# One test file or the full suite in watch mode
npm run test:file -- tests/diff-intraline.test.ts
npm run test:watch

# Full repository checks
npm test
npm run check

# Verify the package and source extension
npm run smoke:package
```

Pi loads `extensions/diff.ts` through its built-in jiti loader. npm and Git installs use the TypeScript source directly, so no production build is required.

Performance fixtures are available through `benchmark:git`, `benchmark:render`, `benchmark:load`, and `benchmark:loop`.

## Release

Publishing is triggered by publishing a GitHub release whose tag matches the
version in `package.json` (for example, `v0.1.0`). The repository must be
configured as a trusted publisher for `pi-git-tui` on npmjs.com.

## License

Copyright 2026 Nikolai Ugelvik.

This project is licensed under the [Apache License, Version 2.0](LICENSE).

## Limitations

- Staging operates on the selected file's remaining changes or the full active slice; interactive hunk/line staging is not currently exposed.
- Historical diffs are read-only. Return to the working tree before running mutations.
- Very large inputs are intentionally represented as explicit omissions rather than partially rendered patches.
