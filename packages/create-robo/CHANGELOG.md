# create-robo

## 0.10.0

### Minor Changes

- dfb0b4f: feat!: new "--plugins" option to pre-install plugins

### Patch Changes

- 2d62cb6: refactor: replaced plugin-gpt in selection with plugin-modtools

## 0.9.1

### Patch Changes

- 62199f4: patch: fixed lint script generated for npm

## 0.9.0

### Minor Changes

- 26b9c08: feat(create-robo): option to specify Robo.js version

## 0.8.0

### Minor Changes

- 5264920: feat: new -ni --no-install option
- ce3406c: feat: new -f --features option

### Patch Changes

- 35c1ec6: refactor: add "prepublishOnly" script to plugins
- e95eb3d: patch: updated plugin development guide
- 02d6b20: chore: updated pre-installed version of discord.js to 14.13.0
- bd783c5: chore: updated default readmes
- 32e58ec: patch(create-robo): Fixed NODE_OPTIONS for Windows
- c653c2a: chore(docs): updated default robo readme

## 0.7.2

### Patch Changes

- 454007b: refactor: generate appropriate "type" field in default config file
- fbdef6f: refactor: re-added empty plugins array to default config file

## 0.7.1

### Patch Changes

- c380e26: chore: added ai-voice plugin as option

## 0.7.0

### Minor Changes

- 8caef39: refactor(docs): updated generated plugin readme to show usage with new `robo add` command
- 1f8b8b5: refactor: use new config file structure for plugins
- 38a60a0: feat: check for create-robo tool updates automatically
- 990f588: refactor: include openai .env placeholder when applicable

### Patch Changes

- dd92437: patch(docs): recommend npx syntax for building plugin prior to publishing on npm

## 0.6.0

### Minor Changes

- 93c1637: feat: bun support
- 399804a: feat: generate additional package.json fields for plugins
- 14f6ef2: chore: updated auto-generated docs
- 951b816: patch: more extensive debug logging
- abe2704: refactor: enable source maps when building plugins in dev mode
- d5699cb: refactor: generate config files in new /config directory
- c5ebd51: feat: list robo.js as a peer dependency when creating plugins

### Patch Changes

- ff33102: patch: more extensive debug logging

## 0.5.3

### Patch Changes

- 58f61ee: chore: ai and api plugin options

## 0.5.2

### Patch Changes

- e76674b: patch: removed noemit tsconfig option

## 0.5.1

### Patch Changes

- 7dd9023: chore: added maintenance plugin as option
- b11990c: patch: encourage source maps for dev mode

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
