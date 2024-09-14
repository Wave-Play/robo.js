"use strict";(self.webpackChunkrobo_js_docs=self.webpackChunkrobo_js_docs||[]).push([[7098],{7687:(e,n,t)=>{t.r(n),t.d(n,{assets:()=>m,contentTitle:()=>c,default:()=>h,frontMatter:()=>l,metadata:()=>d,toc:()=>u});var o=t(5893),s=t(1151),r=t(4866),a=t(5162),i=t(4263);const l={image:"https://preview.robojs.dev?path=/discord-bots/commands"},c="\ud83d\udcdc Commands",d={id:"discord-bots/commands",title:"\ud83d\udcdc Commands",description:"Slash commands have changed the game in Discord, making it a breeze for users to interact with bots (or as we like to call them, Robos). And with Robo.js, weaving your own slash commands is as easy as pie. Let's unravel this together!",source:"@site/docs/discord-bots/commands.mdx",sourceDirName:"discord-bots",slug:"/discord-bots/commands",permalink:"/discord-bots/commands",draft:!1,unlisted:!1,editUrl:"https://github.com/Wave-Play/robo.js/edit/main/docs/docs/discord-bots/commands.mdx",tags:[],version:"current",lastUpdatedBy:"Pkmmte Xeleon",lastUpdatedAt:1719200191e3,frontMatter:{image:"https://preview.robojs.dev?path=/discord-bots/commands"},sidebar:"tutorialSidebar",previous:{title:"\u2728 Getting Started",permalink:"/discord-bots/getting-started"},next:{title:"\ud83d\uddb1\ufe0f Context Menu",permalink:"/discord-bots/context-menu"}},m={},u=[{value:"Crafting Simple Commands \ud83d\udee0\ufe0f",id:"crafting-simple-commands-\ufe0f",level:2},{value:"Subcommands and Subcommand Groups \ud83d\udcda",id:"subcommands-and-subcommand-groups-",level:2},{value:"Customizing Commands \ud83d\udd8b\ufe0f",id:"customizing-commands-\ufe0f",level:2},{value:"Command Options \ud83c\udf9a\ufe0f",id:"command-options-\ufe0f",level:2},{value:"DM Permission",id:"dm-permission",level:3},{value:"Default Member Permissions",id:"default-member-permissions",level:3},{value:"Autocomplete \ud83e\udde0",id:"autocomplete-",level:2},{value:"Command Registration \ud83d\udcdd",id:"command-registration-",level:2},{value:"User Installs",id:"user-installs",level:2}];function p(e){const n={a:"a",admonition:"admonition",blockquote:"blockquote",code:"code",h1:"h1",h2:"h2",h3:"h3",p:"p",pre:"pre",strong:"strong",...(0,s.a)(),...e.components};return(0,o.jsxs)(o.Fragment,{children:[(0,o.jsx)(n.h1,{id:"-commands",children:"\ud83d\udcdc Commands"}),"\n",(0,o.jsx)(n.p,{children:"Slash commands have changed the game in Discord, making it a breeze for users to interact with bots (or as we like to call them, Robos). And with Robo.js, weaving your own slash commands is as easy as pie. Let's unravel this together!"}),"\n",(0,o.jsx)(n.h2,{id:"crafting-simple-commands-\ufe0f",children:"Crafting Simple Commands \ud83d\udee0\ufe0f"}),"\n",(0,o.jsxs)(n.p,{children:["Start off with a simple command. Create a file in the ",(0,o.jsx)(n.code,{children:"commands"})," directory. The file name? That's your command!"]}),"\n",(0,o.jsxs)(n.p,{children:["For instance, to create a ",(0,o.jsx)(n.code,{children:"/ping"})," command, your file structure would look like this:"]}),"\n",(0,o.jsx)(n.pre,{children:(0,o.jsx)(n.code,{className:"language-plaintext",children:"src/\n\u2514\u2500\u2500 commands/\n    \u2514\u2500\u2500 ping.js\n"})}),"\n",(0,o.jsxs)(n.p,{children:["And inside your ",(0,o.jsx)(n.code,{children:"ping"})," command file? Straightforward:"]}),"\n",(0,o.jsxs)(r.Z,{groupId:"examples-script",children:[(0,o.jsx)(a.Z,{value:"js",label:"Javascript",children:(0,o.jsx)(n.pre,{children:(0,o.jsx)(n.code,{className:"language-javascript",metastring:'title="commands/ping.js"',children:"export default () => {\n\treturn 'Pong!'\n}\n"})})}),(0,o.jsx)(a.Z,{value:"ts",label:"Typescript",children:(0,o.jsx)(n.pre,{children:(0,o.jsx)(n.code,{className:"language-typescript",metastring:'title="commands/ping.ts"',children:"import type { CommandResult } from 'robo.js'\n\nexport default (): CommandResult => {\n\treturn 'Pong!'\n}\n"})})})]}),"\n",(0,o.jsx)(n.p,{children:"To use the interaction object directly:"}),"\n",(0,o.jsxs)(r.Z,{groupId:"examples-script",children:[(0,o.jsx)(a.Z,{value:"js",label:"Javascript",children:(0,o.jsx)(n.pre,{children:(0,o.jsx)(n.code,{className:"language-javascript",metastring:'title="commands/ping.js"',children:"export default (interaction) => {\n\tinteraction.reply('Pong!')\n}\n"})})}),(0,o.jsx)(a.Z,{value:"ts",label:"Typescript",children:(0,o.jsx)(n.pre,{children:(0,o.jsx)(n.code,{className:"language-typescript",metastring:'title="commands/ping.ts"',children:"import type { CommandInteraction } from 'discord.js'\n\nexport default (interaction: CommandInteraction) => {\n\tinteraction.reply('Pong!')\n}\n"})})})]}),"\n",(0,o.jsx)(n.p,{children:"In this case, Sage steps back, letting you handle the interaction directly."}),"\n",(0,o.jsx)(n.h2,{id:"subcommands-and-subcommand-groups-",children:"Subcommands and Subcommand Groups \ud83d\udcda"}),"\n",(0,o.jsx)(n.p,{children:"Creating subcommands with Robo.js is as simple as creating new files in a folder. The folder name becomes the parent command, and the file names become the subcommands. But remember, you can't have a parent command file and subcommand files together."}),"\n",(0,o.jsx)(n.pre,{children:(0,o.jsx)(n.code,{className:"language-plaintext",children:"src/\n\u2514\u2500\u2500 commands/\n    \u2514\u2500\u2500 ban/\n        \u2514\u2500\u2500 user.js\n"})}),"\n",(0,o.jsx)(n.p,{children:"And subcommand groups? It's the same concept, but one level deeper. Again, parent commands or subcommands can't live alongside subcommand groups."}),"\n",(0,o.jsx)(n.pre,{children:(0,o.jsx)(n.code,{className:"language-plaintext",children:"src/\n\u2514\u2500\u2500 commands/\n    \u2514\u2500\u2500 settings/\n        \u2514\u2500\u2500 update/\n            \u2514\u2500\u2500 something.js\n"})}),"\n",(0,o.jsx)(n.h2,{id:"customizing-commands-\ufe0f",children:"Customizing Commands \ud83d\udd8b\ufe0f"}),"\n",(0,o.jsxs)(n.p,{children:["Give your commands some context with descriptions. You can do this by exporting a ",(0,o.jsx)(n.code,{children:"config"})," object from your command file."]}),"\n",(0,o.jsx)(n.pre,{children:(0,o.jsx)(n.code,{className:"language-javascript",children:"export const config = {\n\tdescription: 'Responds with Pong!'\n}\n"})}),"\n",(0,o.jsxs)(n.p,{children:["For TypeScript users, you can add typings for both the ",(0,o.jsx)(n.code,{children:"config"})," object and the command result."]}),"\n",(0,o.jsx)(n.pre,{children:(0,o.jsx)(n.code,{className:"language-typescript",metastring:'title="commands/ping.ts"',children:"import type { CommandConfig, CommandResult } from 'robo.js'\n\nexport const config: CommandConfig = {\n\tdescription: 'Responds with Pong!'\n}\n\nexport default (): CommandResult => {\n\treturn 'Pong!'\n}\n"})}),"\n",(0,o.jsxs)(n.p,{children:["The ",(0,o.jsx)(n.code,{children:"config"})," object also lets you customize stuff like locale translations, Sage options, and command timeouts. To understand more about the available configuration options, check out the ",(0,o.jsx)(n.a,{href:"/docs/advanced/configuration",children:"configuration section"}),"."]}),"\n",(0,o.jsx)(n.h2,{id:"command-options-\ufe0f",children:"Command Options \ud83c\udf9a\ufe0f"}),"\n",(0,o.jsxs)(n.p,{children:["Robo.js allows you to further customize your commands with options. You can define these options in your ",(0,o.jsx)(n.code,{children:"config"})," object and then access their values in your command function."]}),"\n",(0,o.jsxs)(r.Z,{groupId:"examples-script",children:[(0,o.jsx)(a.Z,{value:"js",label:"Javascript",children:(0,o.jsx)(n.pre,{children:(0,o.jsx)(n.code,{className:"language-javascript",metastring:'title="commands/ping.js" {3-9} showLineNumbers',children:"export const config = {\n  description: 'Responds with Pong!',\n  options: [\n    {\n      name: 'loud',\n      description: 'Respond loudly?',\n      type: 'boolean'\n    }\n  ]\n}\n\nexport default (interaction) => {\n  const loud = interaction.options.get('loud')?.value as boolean\n  return loud ? 'PONG!!!' : 'Pong!'\n}\n"})})}),(0,o.jsx)(a.Z,{value:"ts",label:"Typescript",children:(0,o.jsx)(n.pre,{children:(0,o.jsx)(n.code,{className:"language-javascript",metastring:'title="commands/ping.ts" {6-12} showLineNumbers',children:"import type { CommandConfig, CommandResult } from 'robo.js'\nimport type { CommandInteraction } from 'discord.js'\n\nexport const config: CommandConfig = {\n  description: 'Responds with Pong!',\n  options: [\n    {\n      name: 'loud',\n      description: 'Respond loudly?',\n      type: 'boolean'\n    }\n  ]\n}\n\nexport default (interaction: CommandInteraction): CommandResult => {\n  const loud = interaction.options.get('loud')?.value as boolean\n  return loud ? 'PONG!!!' : 'Pong!'\n}\n"})})})]}),"\n",(0,o.jsx)(n.p,{children:"You can also use a second parameter next to the interaction object to access the options directly. These are automatically parsed and passed to your command function, with full type support too!"}),"\n",(0,o.jsxs)(r.Z,{groupId:"examples-script",children:[(0,o.jsx)(a.Z,{value:"js",label:"Javascript",children:(0,o.jsx)(n.pre,{children:(0,o.jsx)(n.code,{className:"language-javascript",children:"export const config = {\n\tdescription: 'Responds with Pong!',\n\toptions: [\n\t\t{\n\t\t\tname: 'loud',\n\t\t\tdescription: 'Respond loudly?',\n\t\t\ttype: 'boolean'\n\t\t}\n\t]\n}\n\nexport default (interaction, options) => {\n\treturn options.loud ? 'PONG!!!' : 'Pong!'\n}\n"})})}),(0,o.jsxs)(a.Z,{value:"ts",label:"Typescript",children:[(0,o.jsx)(n.pre,{children:(0,o.jsx)(n.code,{className:"language-typescript",children:"import { createCommandConfig } from 'robo.js'\nimport type { CommandOptions, CommandResult } from 'robo.js'\nimport type { CommandInteraction } from 'discord.js'\n\nexport const config = createCommandConfig({\n\tdescription: 'Responds with Pong!',\n\toptions: [\n\t\t{\n\t\t\tname: 'loud',\n\t\t\tdescription: 'Respond loudly?',\n\t\t\ttype: 'boolean'\n\t\t}\n\t]\n} as const)\n\nexport default (interaction: CommandInteraction, options: CommandOptions<typeof config>): CommandResult => {\n\treturn options.loud ? 'PONG!!!' : 'Pong!'\n}\n"})}),(0,o.jsxs)(n.blockquote,{children:["\n",(0,o.jsxs)(n.p,{children:[(0,o.jsx)(n.strong,{children:"Heads up!"})," ",(0,o.jsx)(n.code,{children:"createCommandConfig"})," and ",(0,o.jsx)(n.code,{children:"as const"})," are important for TypeScript! ",(0,o.jsx)(n.code,{children:"createCommandConfig"})," creates a command configuration object with the correct type, which tells your editor which options are available for your command for better autocompletion and type checking."]}),"\n"]})]})]}),"\n",(0,o.jsxs)(n.p,{children:["Want to explore more options? Check the ",(0,o.jsx)(n.a,{href:"/docs/advanced/configuration",children:"configuration section"}),"."]}),"\n",(0,o.jsx)(n.h3,{id:"dm-permission",children:"DM Permission"}),"\n",(0,o.jsxs)(n.p,{children:["Control whether your command is accessible in direct messages with ",(0,o.jsx)(n.code,{children:"dmPermission"}),". Setting this to ",(0,o.jsx)(n.code,{children:"true"})," allows users to use the command in DMs with the bot, while ",(0,o.jsx)(n.code,{children:"false"})," restricts it."]}),"\n",(0,o.jsx)(n.pre,{children:(0,o.jsx)(n.code,{className:"language-javascript",children:"export const config = {\n\t// ... other configuration options\n\tdmPermission: false // Restricts this command in DMs\n}\n"})}),"\n",(0,o.jsx)(n.h3,{id:"default-member-permissions",children:"Default Member Permissions"}),"\n",(0,o.jsxs)(n.p,{children:["Use ",(0,o.jsx)(n.code,{children:"defaultMemberPermissions"})," to define server-based permissions for your command. This field accepts ",(0,o.jsx)(n.code,{children:"PermissionFlagsBits"})," from Discord.js, allowing you to specify which roles or permissions are needed to access the command in a server context."]}),"\n",(0,o.jsx)(n.pre,{children:(0,o.jsx)(n.code,{className:"language-javascript",children:"import { PermissionFlagsBits } from 'discord.js'\n\nexport const config = {\n\t// ... other configuration options\n\tdefaultMemberPermissions: PermissionFlagsBits.KickMembers // Only users who can kick members can use this command\n}\n"})}),"\n",(0,o.jsx)(n.admonition,{type:"warning",children:(0,o.jsx)(n.p,{children:"Remember, server admins can adjust these default permissions for their own servers. Also, due to a Discord quirk, default permissions might not apply as expected to subcommands."})}),"\n",(0,o.jsx)(n.h2,{id:"autocomplete-",children:"Autocomplete \ud83e\udde0"}),"\n",(0,o.jsxs)(n.p,{children:["Autocomplete can take your commands to the next level by providing suggestions as users type. You can implement autocomplete by exporting an ",(0,o.jsx)(n.code,{children:"autocomplete"})," function in your command file."]}),"\n",(0,o.jsxs)(r.Z,{groupId:"examples-script",children:[(0,o.jsx)(a.Z,{value:"js",label:"Javascript",children:(0,o.jsx)(n.pre,{children:(0,o.jsx)(n.code,{className:"language-javascript",metastring:'showLineNumbers title="commands/choosa-a-color.js" {15-19}',children:"export const config = {\n\tdescription: 'Chooses a color',\n\toptions: [\n\t\t{\n\t\t\tname: 'color',\n\t\t\tdescription: 'Your favorite color',\n\t\t\ttype: 'string',\n\t\t\tautocomplete: true\n\t\t}\n\t]\n}\n\nconst colors = ['red', 'green', 'blue', 'yellow', 'black', 'white', 'pink', 'purple', 'brown']\n\nexport const autocomplete = (interaction) => {\n\tconst colorQuery = interaction.options.get('color')?.value\n\tconst filtered = colors.filter((color) => color.startsWith(colorQuery))\n\treturn interaction.respond(filtered.map((colors) => ({ name: colors, value: colors })))\n}\n\nexport default (interaction) => {\n\treturn `You chose ${interaction.options.get('color')?.value}`\n}\n"})})}),(0,o.jsx)(a.Z,{value:"ts",label:"Typescript",children:(0,o.jsx)(n.pre,{children:(0,o.jsx)(n.code,{className:"language-javascript",metastring:'showLineNumbers title="commands/choosa-a-color.ts" {18-22}',children:"import type { CommandConfig, CommandResult } from 'robo.js'\nimport type { CommandInteraction, AutocompleteInteraction } from 'discord.js'\n\nexport const config: CommandConfig = {\n  description: 'Chooses a color',\n  options: [\n    {\n      name: 'color',\n      description: 'Your favorite color',\n      type: 'string',\n      autocomplete: true\n    }\n  ]\n}\n\nconst colors: Array<string> = ['red', 'green', 'blue', 'yellow', 'black', 'white', 'pink', 'purple', 'brown']\n\nexport const autocomplete = (interaction: AutocompleteInteraction) => {\n  const colorQuery = interaction.options.get(\"color\")?.value as string;\n  const filtered = colors.filter((color) => color.startsWith(colorQuery));\n  return interaction.respond(filtered.map((colors) => ({ name: colors, value: colors })));\n};\n\nexport default (interaction: CommandInteraction): CommandResult => {\n  return `You chose ${interaction.options.get('color')?.value}`\n}\n"})})})]}),"\n",(0,o.jsxs)(n.p,{children:["In this example, the ",(0,o.jsx)(n.code,{children:"autocomplete"})," function returns an array of colors that start with the user's input, providing a dynamic and responsive user experience."]}),"\n",(0,o.jsxs)(n.p,{children:["Note: the type of the Interaction is: ",(0,o.jsx)(n.code,{children:"AutocompleteInteraction"})]}),"\n",(0,o.jsx)(n.h2,{id:"command-registration-",children:"Command Registration \ud83d\udcdd"}),"\n",(0,o.jsxs)(n.p,{children:["The cherry on top? You don't need to manually register your commands. Robo.js handles it for you when you run ",(0,o.jsx)(n.code,{children:"robo dev"})," or ",(0,o.jsx)(n.code,{children:"robo build"}),", automatically! However, if things go sideways for some reason, you can use the ",(0,o.jsx)(n.code,{children:"--force"})," flag to force registration."]}),"\n",(0,o.jsx)(i.o,{execute:!0,children:"robo build --force"}),"\n",(0,o.jsxs)(n.p,{children:["This will also clean up any commands that are no longer in your ",(0,o.jsx)(n.code,{children:"commands"})," directory. Pretty neat, right?"]}),"\n",(0,o.jsx)(n.h2,{id:"user-installs",children:"User Installs"}),"\n",(0,o.jsxs)(n.p,{children:["Robo.js now supports commands for user-installed apps! You will need to set experimental ",(0,o.jsx)(n.code,{children:"userInstall"})," to ",(0,o.jsx)(n.code,{children:"true"})," in your config file to enable this feature."]}),"\n",(0,o.jsx)(n.pre,{children:(0,o.jsx)(n.code,{className:"language-javascript",metastring:'title="/config/robo.mjs"',children:"export default {\n\t// ... other config options\n\texperimental: {\n\t\tuserInstall: true\n\t}\n}\n"})}),"\n",(0,o.jsx)(n.p,{children:"With this enabled, users can install your app and use its commands anywhere!"}),"\n",(0,o.jsx)(n.admonition,{type:"tip",children:(0,o.jsxs)(n.p,{children:["Make sure you ",(0,o.jsx)(n.strong,{children:(0,o.jsx)(n.a,{href:"https://discord.com/developers/docs/tutorials/developing-a-user-installable-app#configuring-default-install-settings",children:"update your install settings"})})," in the ",(0,o.jsx)(n.strong,{children:(0,o.jsx)(n.a,{href:"https://discord.com/developers/applications",children:"Discord Developer Portal"})})," to allow user installs."]})})]})}function h(e={}){const{wrapper:n}={...(0,s.a)(),...e.components};return n?(0,o.jsx)(n,{...e,children:(0,o.jsx)(p,{...e})}):p(e)}},5162:(e,n,t)=>{t.d(n,{Z:()=>a});var o=t(7294),s=t(6905);const r={tabItem:"tabItem_Ymn6"};function a(e){let{children:n,hidden:t,className:a}=e;return o.createElement("div",{role:"tabpanel",className:(0,s.Z)(r.tabItem,a),hidden:t},n)}},4866:(e,n,t)=>{t.d(n,{Z:()=>w});var o=t(7462),s=t(7294),r=t(6905),a=t(2466),i=t(6550),l=t(469),c=t(1980),d=t(7392),m=t(812);function u(e){return s.Children.toArray(e).filter((e=>"\n"!==e)).map((e=>{if(!e||(0,s.isValidElement)(e)&&function(e){const{props:n}=e;return!!n&&"object"==typeof n&&"value"in n}(e))return e;throw new Error(`Docusaurus error: Bad <Tabs> child <${"string"==typeof e.type?e.type:e.type.name}>: all children of the <Tabs> component should be <TabItem>, and every <TabItem> should have a unique "value" prop.`)}))?.filter(Boolean)??[]}function p(e){const{values:n,children:t}=e;return(0,s.useMemo)((()=>{const e=n??function(e){return u(e).map((e=>{let{props:{value:n,label:t,attributes:o,default:s}}=e;return{value:n,label:t,attributes:o,default:s}}))}(t);return function(e){const n=(0,d.l)(e,((e,n)=>e.value===n.value));if(n.length>0)throw new Error(`Docusaurus error: Duplicate values "${n.map((e=>e.value)).join(", ")}" found in <Tabs>. Every value needs to be unique.`)}(e),e}),[n,t])}function h(e){let{value:n,tabValues:t}=e;return t.some((e=>e.value===n))}function g(e){let{queryString:n=!1,groupId:t}=e;const o=(0,i.k6)(),r=function(e){let{queryString:n=!1,groupId:t}=e;if("string"==typeof n)return n;if(!1===n)return null;if(!0===n&&!t)throw new Error('Docusaurus error: The <Tabs> component groupId prop is required if queryString=true, because this value is used as the search param name. You can also provide an explicit value such as queryString="my-search-param".');return t??null}({queryString:n,groupId:t});return[(0,c._X)(r),(0,s.useCallback)((e=>{if(!r)return;const n=new URLSearchParams(o.location.search);n.set(r,e),o.replace({...o.location,search:n.toString()})}),[r,o])]}function f(e){const{defaultValue:n,queryString:t=!1,groupId:o}=e,r=p(e),[a,i]=(0,s.useState)((()=>function(e){let{defaultValue:n,tabValues:t}=e;if(0===t.length)throw new Error("Docusaurus error: the <Tabs> component requires at least one <TabItem> children component");if(n){if(!h({value:n,tabValues:t}))throw new Error(`Docusaurus error: The <Tabs> has a defaultValue "${n}" but none of its children has the corresponding value. Available values are: ${t.map((e=>e.value)).join(", ")}. If you intend to show no default tab, use defaultValue={null} instead.`);return n}const o=t.find((e=>e.default))??t[0];if(!o)throw new Error("Unexpected error: 0 tabValues");return o.value}({defaultValue:n,tabValues:r}))),[c,d]=g({queryString:t,groupId:o}),[u,f]=function(e){let{groupId:n}=e;const t=function(e){return e?`docusaurus.tab.${e}`:null}(n),[o,r]=(0,m.Nk)(t);return[o,(0,s.useCallback)((e=>{t&&r.set(e)}),[t,r])]}({groupId:o}),b=(()=>{const e=c??u;return h({value:e,tabValues:r})?e:null})();(0,l.Z)((()=>{b&&i(b)}),[b]);return{selectedValue:a,selectValue:(0,s.useCallback)((e=>{if(!h({value:e,tabValues:r}))throw new Error(`Can't select invalid tab value=${e}`);i(e),d(e),f(e)}),[d,f,r]),tabValues:r}}var b=t(2389);const x={tabList:"tabList__CuJ",tabItem:"tabItem_LNqP"};function j(e){let{className:n,block:t,selectedValue:i,selectValue:l,tabValues:c}=e;const d=[],{blockElementScrollPositionUntilNextRender:m}=(0,a.o5)(),u=e=>{const n=e.currentTarget,t=d.indexOf(n),o=c[t].value;o!==i&&(m(n),l(o))},p=e=>{let n=null;switch(e.key){case"Enter":u(e);break;case"ArrowRight":{const t=d.indexOf(e.currentTarget)+1;n=d[t]??d[0];break}case"ArrowLeft":{const t=d.indexOf(e.currentTarget)-1;n=d[t]??d[d.length-1];break}}n?.focus()};return s.createElement("ul",{role:"tablist","aria-orientation":"horizontal",className:(0,r.Z)("tabs",{"tabs--block":t},n)},c.map((e=>{let{value:n,label:t,attributes:a}=e;return s.createElement("li",(0,o.Z)({role:"tab",tabIndex:i===n?0:-1,"aria-selected":i===n,key:n,ref:e=>d.push(e),onKeyDown:p,onClick:u},a,{className:(0,r.Z)("tabs__item",x.tabItem,a?.className,{"tabs__item--active":i===n})}),t??n)})))}function v(e){let{lazy:n,children:t,selectedValue:o}=e;const r=(Array.isArray(t)?t:[t]).filter(Boolean);if(n){const e=r.find((e=>e.props.value===o));return e?(0,s.cloneElement)(e,{className:"margin-top--md"}):null}return s.createElement("div",{className:"margin-top--md"},r.map(((e,n)=>(0,s.cloneElement)(e,{key:n,hidden:e.props.value!==o}))))}function y(e){const n=f(e);return s.createElement("div",{className:(0,r.Z)("tabs-container",x.tabList)},s.createElement(j,(0,o.Z)({},n,e)),s.createElement(v,(0,o.Z)({},n,e)))}function w(e){const n=(0,b.Z)();return s.createElement(y,(0,o.Z)({key:String(n)},e),u(e.children))}},4263:(e,n,t)=>{t.d(n,{o:()=>h});var o=t(5317),s=t(8849),r=t.n(s),a=t(7294);const i=e=>{const{defaultValue:n,onSelect:t,options:s}=e,[i,l]=(0,a.useState)(!1),[c,d]=(0,a.useState)(n??s[0]);(0,a.useEffect)((()=>{d(n??s[0])}),[n,s]);const m=e=>()=>{d(e),t(e),l(!1)};return a.createElement("div",{className:"select-container"},a.createElement("button",{className:"select-row",onClick:()=>{l(!i)}},a.createElement("span",{className:"select-text no-margin"},c.label),a.createElement(r(),{path:i?o.Waq:o.CW,size:"16px",color:"rgb(161, 161, 161)"})),i&&a.createElement("menu",{className:"select-menu"},s.map((e=>a.createElement("button",{key:e.value,className:e.value===c.value?"select-menu-active":void 0,onClick:m(e)},e.label)))))};var l=t(640),c=t.n(l);var d=t(5103),m=t(8583);const u=(0,d.cn)("npm");const p=[{label:"NPM",value:"npm"},{label:"Yarn",value:"yarn"},{label:"PNPM",value:"pnpm"}],h=e=>{const{children:n,create:t,execute:s,install:l,title:d="Terminal"}=e,[h]=[async e=>c()(e)],[g,f]=function(){const[e,n]=(0,m.KO)(u);return[e,n]}(),b=p.find((e=>e.value===g));let x=n;"string"==typeof x&&(x=x.trim());let j="";t?j=function(e){if("npm"===e)return"npx create-robo";if("yarn"===e)return"yarn create robo";if("pnpm"===e)return"pnpm create robo"}(b.value)+" ":s?j=function(e){if("npm"===e)return"npx";if("yarn"===e)return"yarn";if("pnpm"===e)return"pnpm";if("bun"===e)return"bun"}(b.value)+" ":l&&x?j=function(e){if("npm"===e)return"npm install";if("yarn"===e)return"yarn add";if("pnpm"===e)return"pnpm add";if("bun"===e)return"bun add"}(b.value)+" ":l&&(j=b.value+" install");return a.createElement("div",{className:"margin-bottom--lg terminal"},a.createElement("div",{className:"terminal-header"},a.createElement(r(),{path:o.aTZ,size:"16px",color:"rgb(161, 161, 161)"}),a.createElement("span",{className:"terminal-header-text"},d),a.createElement("div",{className:"spacer"}),a.createElement(i,{defaultValue:b,onSelect:e=>{console.log(e),f(e.value)},options:p}),a.createElement("button",{onClick:()=>{h(j+x)}},a.createElement(r(),{path:o.a0Z,size:"20px",color:"rgb(161, 161, 161)"}))),a.createElement("pre",{className:"prism-code language-bash codeBlock_node_modules-@docusaurus-theme-classic-lib-theme-CodeBlock-Content-styles-module thin-scrollbar terminal-bg"},a.createElement("code",{className:"codeBlockLines_node_modules-@docusaurus-theme-classic-lib-theme-CodeBlock-Content-styles-module"},a.createElement("span",{className:"token-line"},t||s||l?a.createElement(a.Fragment,null,a.createElement("span",{className:"token plain"},j),a.createElement("strong",null,a.createElement("span",{className:"token plain"},x))):a.createElement("span",{className:"token plain"},x)))))}}}]);