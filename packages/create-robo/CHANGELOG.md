# create-robo

## 0.5.0

### Minor Changes

- 9dd5c65: feat: new "--template" option for remote templates

## 0.4.2

### Patch Changes

- 6fe8a7e: refactor: use "path.prep" for windows separator
- b398be4: fix: cwd dir name extraction on windows

## 0.4.1

### Patch Changes

- e03dad1: fix: updated template .gitignore to no longer exclude tsconfig.json

## 0.4.0

### Minor Changes

- f4d93ee: refactor: not specifying name now creates project within same directory
- e6b3b89: refactor: robo.js and discord.js are now dev dependencies when creating plugin

### Patch Changes

- eb8eb15: refactor: discord client id now requested before token
- 8bafb1f: fix: no longer fails to install dependencies on windows
- e32367b: fix: missing poll dependency when feature was selected
- 9cf46eb: patch: token instructions now include link to official guide

## 0.3.1

### Patch Changes

- de05122: fix: include docs in distributed package

## 0.3.0

### Minor Changes

- 076ee99: feat: plugin templates
- 230e33f: feat: validate new project names

### Patch Changes

- 293e5a7: feat: auto generate updated readme.md
- 7468d47: chore: include "robo invite" in package scripts
- 28fdcc9: feat: convenience -js --javascript -ts --typescript flags
- 4404968: feat: new poll plugin available as interactive option
- 6ae8b4c: chore: added message content intent to default template

## 0.2.1

### Patch Changes

- 8d219c6: refactor(cr): updated default version and removed engines key

## 0.2.0

### Minor Changes

- a5c1e6f: refactor(cr): ask for typescript support separately from features
- a5c1e6f: feat(cr): official plugins now included in the feature selection

### Patch Changes

- ed8987b: refactor(cr): minor logging changes

## 0.1.1

### Patch Changes

- 6114cb0: fix(cr): generate .env in correct order
- 971cd6c: fix(cr): all robo.js projects are modules by default
- 38832cd: fix(cr): added missing typescript dependencies

## 0.1.0

### Minor Changes

- 4d856c1: feat: introducing create-robo
