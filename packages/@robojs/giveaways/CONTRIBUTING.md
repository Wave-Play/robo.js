# Contributing to @robojs/giveaways

Thank you for your interest in contributing! 🎉

## Development Setup

1. **Clone the repository:**
   git clone https://github.com/AdityaTel89/robo.js.git
   cd robojs-giveaways

2. **Install dependencies:**

npm install

3. **Create a test bot:**

npx create-robo ../giveaway-test-bot
cd ../giveaway-test-bot
npx robo add ../robojs-giveaways

4. **Start development:**

Terminal 1 - Plugin directory
cd robojs-giveaways
npm run dev

Terminal 2 - Test bot
cd giveaway-test-bot
npx robo dev

## Coding Standards

- Use TypeScript for all new code
- Follow existing code style (run `npm run lint:fix`)
- Add JSDoc comments for public APIs
- Keep functions focused and small

## Commit Guidelines

- Use clear, descriptive commit messages
- Format: `type: description`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:

- `feat: add reroll command`
- `fix: handle deleted channels gracefully`
- `docs: update README with examples`

## Pull Request Process

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Test thoroughly
4. Update documentation if needed
5. Submit PR with clear description

## Testing

Before submitting:

- [ ] Test all affected commands
- [ ] Verify bot restarts correctly
- [ ] Check for TypeScript errors
- [ ] Run `npm run lint`

## Questions?

Open an issue or ask in [Robo.js Discord](https://robojs.dev/discord)!
