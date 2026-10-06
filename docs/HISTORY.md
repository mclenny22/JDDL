# Retired prototypes

The active application is `frontend/` and `backend/`. Retired implementations
were removed from the working tree during the 6 October 2026 cleanup to keep
the checkout lean. Their tracked sources and assets remain in Git at commit
`f6f18916b4caf6c29bf4409c8d4b94af7f285b2f`:

- `archive/V1/`: earlier portfolio and integrated CMS.
- `archive/V2-demo/`: standalone horizontal demo and Figma assets.
- `archive/Page Test/`: React/Vite prototype.
- `archive/Watch Test/`: motion experiments.
- `archive/backendUI/`: Node/SQLite admin experiment.

Inspect an old file without restoring the prototype:

```sh
git show 'f6f18916b4caf6c29bf4409c8d4b94af7f285b2f:archive/V1/server.py'
```

Export a prototype into a separate directory without changing the checkout:

```sh
git archive f6f18916b4caf6c29bf4409c8d4b94af7f285b2f 'archive/V2-demo/' | tar -x -C /path/to/existing/recovery-directory
```

The ignored local `archive/` directory may still contain legacy databases,
untracked source, exports and preserved Page Test Git metadata. Those files
were retained; they are not part of the current application or deployment.
Current live storage remains in `data/` and `uploads/` and was not moved.
