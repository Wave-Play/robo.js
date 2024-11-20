# Contributing to Robo.js

> 🚀 **By the way**: If you're here for Hacktoberfest submissions, thanks for stopping by! While this document is relevant for all contributions, it's not exclusive to the event. So, feel free to browse and contribute anytime!

Hey there, future contributor! 🌊 First and foremost, a big **THANK YOU** for showing interest in our project. 💙

Whether you're looking to contribute code or simply suggest features, we're glad to have you here!

**Not a coder but got a neat idea?** No worries!  

**➞ [📝 Suggest features by creating a GitHub Issue](https://github.com/your-repo-name/issues)**

**➞ [🚀 Community: Join our Discord server](https://roboplay.dev/discord)**

Remember, contributing to the core is different from making your own Robo or plugin. If you're looking for a starter guide:  

**➞ [📖 Tutorial: Making a "To-do" Robo](https://blog.waveplay.com/how-to-make-a-discord-robo)**.

## Setup

Setting up this monorepo is simple! Here's your to-do list:
1. **Node**: Ensure you have **[Node 18 or newer](https://nodejs.org/)**. Older versions might work but are not tested.
2. **Editor**: We recommend **[VS Code](https://code.visualstudio.com/)**, but **[GitHub Codespaces](https://github.com/features/codespaces/)** also works wonders.
3. **Package Manager**: We 💙 **[PNPM](https://pnpm.io/)**! Ensure you've got that. Simply run `pnpm install` after cloning the repo, and you're golden!

## Monorepo structure

Dive into our structure! 🏊‍♂️
- The `packages` directory: Your one-stop for the framework, plugins, and the create tool.
- Plugin code? Follow the **[Robo.js File structure](https://docs.roboplay.dev/docs/basics/overview#the-robojs-file-structure)** and you'll feel right at home.
- Want to spruce up the documentation? Head to the "docusaurus" folder and get your markdown magic on!
- Check out the `templates` folder for Robos starter templates. Want to add your own? We'd love to see it! 🎉

A few tools that keep our code neat: **[Turborepo](https://turbo.build/repo)**, **[ESLint](https://eslint.org/)**, and **[Prettier](https://prettier.io/)**. Got the right VS Code plugins? These tools will be your best pals. Otherwise, `pnpm lint` is your command.

Use `pnpm dev` to run packages and `pnpm build` for building. Perfect for continuous coding!

## Commiting changes

We highly encourage you to follow **[Conventional Commits](https://www.conventionalcommits.org/)**. 📜

We follow **[Semantic Versioning](https://semver.org/)** (SemVer) for packages v1.0.0 and up. Under that? The second digit is for breaking changes and the third for everything else.

We also rely on **[Changesets](https://github.com/changesets/changesets)** for change management. Just run `pnpm changeset` and let the CLI guide you. 

Starting a new package? Use `0.0.0` as your initial version and Changesets will handle the rest.

## Linting

Please lint your code before submitting a PR. We use **[ESLint](https://eslint.org/)** and **[Prettier](https://prettier.io/)** to keep our code neat and uniform across the entire monorepo.

Seriously, just run `pnpm lint` and you're good to go!

## Submitting a PR

Ready to submit? 🚀
1. Ensure you've made necessary changesets.
2. First-timer? Our CLA Assistant bot might pop up. Just sign the CLA and you're set!

## Plugins

Contribute to our official ones, enhance existing ones, or create your own!

For more, follow the **[plugin guide](https://docs.roboplay.dev/docs/advanced/plugins)**. Want a suggestion? A template project is a stellar way to test your plugin.

> **Smol heads up:** Make sure your plugin's `@roboplay/robo.js` version is consistent with your test project. For instance, if the Robo is at `0.9.6`, ensure your plugin's `devDependencies` match or you'll run into issues with stateful APIs like Flashcore or State.

## Templates

Check out all of the awesome ways you can use Robo.js!

Templates are just example Robo projects. Starter templates are a great way to get started with Robo.js, and also a great way to see what's possible.

You can also use these to test your plugins as you're developing them! Just make sure to use a relative path. (e.g. `npx robo add ../../my-plugin`)

These templates are also used by the `create-robo` tool via the `--template` flag.

## Contributors

A round of applause for our amazing contributors! 🎉

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="http://pkmmte.com"><img src="https://avatars.githubusercontent.com/u/3953360?v=4?s=100" width="100px;" alt="Pkmmte Xeleon"/><br /><sub><b>Pkmmte Xeleon</b></sub></a><br /><a href="[✨]("WavePlay Staff")," title="WavePlay Staff">✨</a> <a href="https://github.com/Wave-Play/robo.js/commits?author=Pkmmte" title="Code">💻</a> <a href="#maintenance-Pkmmte" title="Maintenance">🚧</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/Nazeofel"><img src="https://avatars.githubusercontent.com/u/96749659?v=4?s=100" width="100px;" alt="Alexander"/><br /><sub><b>Alexander</b></sub></a><br /><a href="[✨]("WavePlay Staff")," title="WavePlay Staff">✨</a> <a href="https://github.com/Wave-Play/robo.js/commits?author=Nazeofel" title="Code">💻</a> <a href="#maintenance-Nazeofel" title="Maintenance">🚧</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/0xMouiz"><img src="https://avatars.githubusercontent.com/u/96005374?v=4?s=100" width="100px;" alt="Mouiz"/><br /><sub><b>Mouiz</b></sub></a><br /><a href="https://github.com/Wave-Play/robo.js/commits?author=0xMouiz" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/mbos2"><img src="https://avatars.githubusercontent.com/u/56090587?v=4?s=100" width="100px;" alt="Matej Bošnjak"/><br /><sub><b>Matej Bošnjak</b></sub></a><br /><a href="https://github.com/Wave-Play/robo.js/commits?author=mbos2" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/ArnavK-09"><img src="https://avatars.githubusercontent.com/u/69188140?v=4?s=100" width="100px;" alt="Arnav K"/><br /><sub><b>Arnav K</b></sub></a><br /><a href="#example-ArnavK-09" title="Examples">💡</a> <a href="#plugin-ArnavK-09" title="Plugin/utility libraries">🔌</a> <a href="https://github.com/Wave-Play/robo.js/commits?author=ArnavK-09" title="Documentation">📖</a> <a href="https://github.com/Wave-Play/robo.js/commits?author=ArnavK-09" title="Code">💻</a></td>
    </tr>
  </tbody>
  <tfoot>
    <tr>
      <td align="center" size="13px" colspan="7">
        <img src="https://raw.githubusercontent.com/all-contributors/all-contributors-cli/1b8533af435da9854653492b1327a23a4dbd0a10/assets/logo-small.svg">
          <a href="https://all-contributors.js.org/docs/en/bot/usage">Add your contributions</a>
        </img>
      </td>
    </tr>
  </tfoot>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->
