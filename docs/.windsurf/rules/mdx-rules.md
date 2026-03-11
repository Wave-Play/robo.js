---
trigger: glob
globs: content/**/*.mdx
---

When editing MDX files in this project which uses fumadocs framework, take in mind these:

1. When referencing through  markdown links, use relative paths from the current file and append `.mdx` at the end, like so:

```mdx
[Create Robo](../cli/create-robo.mdx) // it's allowed to go back as many levels
[Slash Command](./commands.mdx)
[Context Commands](./context-menu.mdx)
```

2. When referencing through `href` like in `<Card>` components, relative paths are not allowed. use only a single dot which will concatenate the current url and the full path to where u want to access, as if it were a normal link:

```mdx
<Cards>
	<Card href="./framework/core" title="Core" description="Understand the fundamental features and architecture." />
	<Card href="./cli" title="CLI" description="Use the command-line interface to manage your projects." />
	<Card href="./framework/plugins" title="Plugins" description="Extend Robo.js functionality with plugins." />
	<Card href="./hosting" title="Hosting" description="Learn how to deploy your Robo applications." />
</Cards>
```

3. Use the `package-install` code block language for commands like `npm install`, `yarn add`, `pnpm install`, `npx`, `bun` etc. For example:

```package-install
npm run dev
```

4. The available types for callouts are `info`, `warn`, and `error`:

   ```mdx
   <Callout type="info" title"my info callout">This is an informational message.</Callout>
   <Callout type="warn">This is a warning message.</Callout>
   <Callout type="error">This is an error message.</Callout>
   ```

5. Do not import components (e.g., from `fumadocs-ui` or custom components) directly within MDX files. They are globally available or pre-configured in the project setup. If a component is not working, verify its registration in the project's `mdx-components.tsx` or similar global configuration file rather than adding local imports.

6. For inline code syntax highlighting, use the `{:language}` syntax after the code block. For example:

   ```mdx
   Hey this is an inline paragraph and this code is highlighted: `const x = "example"`{:ts}
   ```
   
   This will properly highlight the inline code with the specified language syntax.

7. When displaying file structures, use the `<Files>` component with the following structure:

   ```mdx
   <Files>
     <Folder name="src" defaultOpen disabled> 
       <Folder name="commands" defaultOpen>
         <Folder name="channel" defaultOpen>
           <File name="lock.js" />
         </Folder>
         <Folder name="bot" defaultOpen>
           <Folder name="status" defaultOpen>
             <File name="idle.js" />
           </Folder>
         </Folder>
       </Folder>
     </Folder>
   </Files>
   ```
   
   - Use `defaultOpen` to make folders expanded by default (only folders that have more things to show)
   - Use `disabled` to make a folder unclosable (always for the root folder, and for others when they have no children)
   - Nest `<Folder>` and `<File>` components to represent the directory structure