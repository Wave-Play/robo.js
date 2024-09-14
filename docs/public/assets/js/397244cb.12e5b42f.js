/*! For license information please see 397244cb.12e5b42f.js.LICENSE.txt */
"use strict";(self.webpackChunkrobo_js_docs=self.webpackChunkrobo_js_docs||[]).push([[7114],{1224:(e,t,o)=>{o.r(t),o.d(t,{assets:()=>a,contentTitle:()=>d,default:()=>p,frontMatter:()=>l,metadata:()=>c,toc:()=>h});var s=o(5893),r=o(1151),n=o(5396),i=o(352);const l={image:"https://preview.robojs.dev?path=/plugins/dev"},d="@robojs/dev",c={id:"plugins/dev",title:"@robojs/dev",description:"Welcome to @robojs/dev! For developers fine-tuning their Robo.js projects, this plugin is a must-have. Seamlessly test Robo APIs, monitor resources, and emulate specific Robo behaviors, all in one package. Just install, and you're ready to go!",source:"@site/docs/plugins/dev.mdx",sourceDirName:"plugins",slug:"/plugins/dev",permalink:"/plugins/dev",draft:!1,unlisted:!1,editUrl:"https://github.com/Wave-Play/robo.js/edit/main/docs/docs/plugins/dev.mdx",tags:[],version:"current",lastUpdatedBy:"Pkmmte Xeleon",lastUpdatedAt:1715553501e3,frontMatter:{image:"https://preview.robojs.dev?path=/plugins/dev"},sidebar:"tutorialSidebar",previous:{title:"@robojs/better-stack",permalink:"/plugins/better-stack"},next:{title:"@robojs/maintenance",permalink:"/plugins/maintenance"}},a={},h=[{value:"Installation \ud83d\udcbb",id:"installation-",level:2},{value:"\u26a0\ufe0f Important Note",id:"\ufe0f-important-note",level:2},{value:"Commands",id:"commands",level:2},{value:"Resource monitoring",id:"resource-monitoring",level:2},{value:"More on GitHub",id:"more-on-github",level:2}];function u(e){const t={a:"a",blockquote:"blockquote",code:"code",em:"em",h1:"h1",h2:"h2",p:"p",pre:"pre",strong:"strong",table:"table",tbody:"tbody",td:"td",th:"th",thead:"thead",tr:"tr",...(0,r.a)(),...e.components};return(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)(t.h1,{id:"robojsdev",children:"@robojs/dev"}),"\n",(0,s.jsxs)(t.p,{children:["Welcome to ",(0,s.jsx)(t.em,{children:"@robojs/dev"}),"! For developers fine-tuning their ",(0,s.jsx)(t.strong,{children:(0,s.jsx)(t.a,{href:"https://github.com/Wave-Play/robo",children:"Robo.js"})})," projects, this plugin is a must-have. Seamlessly test Robo APIs, monitor resources, and emulate specific Robo behaviors, all in one package. Just install, and you're ready to go!"]}),"\n",(0,s.jsx)(t.h2,{id:"installation-",children:"Installation \ud83d\udcbb"}),"\n",(0,s.jsx)(t.p,{children:"To integrate this plugin into your project, simply navigate to your Robo directory and input:"}),"\n",(0,s.jsx)(t.pre,{children:(0,s.jsx)(t.code,{className:"language-bash",children:"npx robo add @robojs/dev\n"})}),"\n",(0,s.jsx)(t.p,{children:"Voil\xe0! Your Robo is now supercharged with development tools."}),"\n",(0,s.jsx)(t.h2,{id:"\ufe0f-important-note",children:"\u26a0\ufe0f Important Note"}),"\n",(0,s.jsx)(t.p,{children:"This plugin is crafted explicitly for development environments. Before deploying your Robo, ensure you uninstall this plugin to prevent users from directly manipulating your server or database."}),"\n",(0,s.jsx)(t.p,{children:"Execute the following to safely remove:"}),"\n",(0,s.jsx)(t.pre,{children:(0,s.jsx)(t.code,{className:"language-bash",children:"npx robo remove @robojs/dev\n"})}),"\n",(0,s.jsx)(t.h2,{id:"commands",children:"Commands"}),"\n",(0,s.jsx)(t.p,{children:"Equip your Robo with the following commands for an enhanced development experience:"}),"\n",(0,s.jsxs)(t.table,{children:[(0,s.jsx)(t.thead,{children:(0,s.jsxs)(t.tr,{children:[(0,s.jsx)(t.th,{children:"Command"}),(0,s.jsx)(t.th,{children:"Description"})]})}),(0,s.jsxs)(t.tbody,{children:[(0,s.jsxs)(t.tr,{children:[(0,s.jsx)(t.td,{children:(0,s.jsx)(t.code,{children:"/devtools example defer"})}),(0,s.jsx)(t.td,{children:"Demonstrates Sage's auto deferral feature, showcasing varying behaviors."})]}),(0,s.jsxs)(t.tr,{children:[(0,s.jsx)(t.td,{children:(0,s.jsx)(t.code,{children:"/devtools example error"})}),(0,s.jsx)(t.td,{children:"Intentionally triggers an error, either asynchronous or not\u2014great for validating Sage's debug mode setup."})]}),(0,s.jsxs)(t.tr,{children:[(0,s.jsx)(t.td,{children:(0,s.jsx)(t.code,{children:"/devtools example permission-dm"})}),(0,s.jsx)(t.td,{children:"Illustrates slash command usage outside of direct messages."})]}),(0,s.jsxs)(t.tr,{children:[(0,s.jsx)(t.td,{children:(0,s.jsx)(t.code,{children:"/devtools flashcore clear"})}),(0,s.jsxs)(t.td,{children:[(0,s.jsx)(t.strong,{children:"Caution!"})," Wipes out ",(0,s.jsx)(t.em,{children:"all"})," Flashcore values."]})]}),(0,s.jsxs)(t.tr,{children:[(0,s.jsx)(t.td,{children:(0,s.jsx)(t.code,{children:"/devtools flashcore delete"})}),(0,s.jsx)(t.td,{children:"Removes a specific key from Flashcore."})]}),(0,s.jsxs)(t.tr,{children:[(0,s.jsx)(t.td,{children:(0,s.jsx)(t.code,{children:"/devtools flashcore get"})}),(0,s.jsx)(t.td,{children:"Retrieves the current value of a Flashcore key."})]}),(0,s.jsxs)(t.tr,{children:[(0,s.jsx)(t.td,{children:(0,s.jsx)(t.code,{children:"/devtools flashcore set"})}),(0,s.jsx)(t.td,{children:"Assigns a value to a Flashcore key."})]}),(0,s.jsxs)(t.tr,{children:[(0,s.jsx)(t.td,{children:(0,s.jsx)(t.code,{children:"/devtools flashcore watch"})}),(0,s.jsx)(t.td,{children:"Observes key changes, highlighting differences and sending notifications."})]}),(0,s.jsxs)(t.tr,{children:[(0,s.jsx)(t.td,{children:(0,s.jsx)(t.code,{children:"/devtools module check"})}),(0,s.jsx)(t.td,{children:"Confirms if a particular module is active."})]}),(0,s.jsxs)(t.tr,{children:[(0,s.jsx)(t.td,{children:(0,s.jsx)(t.code,{children:"/devtools module set"})}),(0,s.jsx)(t.td,{children:"Toggles a module's active state."})]}),(0,s.jsxs)(t.tr,{children:[(0,s.jsx)(t.td,{children:(0,s.jsx)(t.code,{children:"/devtools state get"})}),(0,s.jsx)(t.td,{children:"Fetches a state value."})]}),(0,s.jsxs)(t.tr,{children:[(0,s.jsx)(t.td,{children:(0,s.jsx)(t.code,{children:"/devtools state set"})}),(0,s.jsx)(t.td,{children:"Alters a state value."})]})]})]}),"\n",(0,s.jsxs)(t.p,{children:["For those eager to delve deeper into Robo APIs, inspecting the ",(0,s.jsx)(t.a,{href:"https://github.com/Wave-Play/robo.js/tree/main/packages/plugin-devtools",children:"plugin's source code"})," provides good usage examples. Trust us, it's simpler than you may think!"]}),"\n",(0,s.jsx)(t.h2,{id:"resource-monitoring",children:"Resource monitoring"}),"\n",(0,s.jsx)(t.p,{children:"Efficiency is key! The DevTools plugin also empowers you with a mechanism to supervise CPU and RAM utilization over time. This resource monitoring is instrumental in gauging the performance of your Robo and pin-pointing areas for enhancement."}),"\n",(0,s.jsxs)(t.p,{children:["To enable this feature, set ",(0,s.jsx)(t.code,{children:"monitorResources"})," to ",(0,s.jsx)(t.code,{children:"true"})," in the plugin's configuration. By default, the plugin will check resources every 5 seconds, but you're free to adjust the ",(0,s.jsx)(t.code,{children:"monitorInterval"}),":"]}),"\n",(0,s.jsx)(t.pre,{children:(0,s.jsx)(t.code,{className:"language-js",children:"export default {\n\tmonitorInterval: 10_000, // Inspects every 10 seconds\n\tmonitorResources: true // Activates resource monitoring\n}\n"})}),"\n",(0,s.jsxs)(t.blockquote,{children:["\n",(0,s.jsxs)(t.p,{children:[(0,s.jsx)(t.strong,{children:"Yet to set foot in the Robo.js universe?"})," ",(0,s.jsx)(t.a,{href:"https://docs.roboplay.dev/docs/getting-started",children:"Embark on your Robo journey now!"})]}),"\n"]}),"\n",(0,s.jsx)(t.p,{children:"Level up your development process with Robo.js and the DevTools plugin! \ud83d\ude80"}),"\n",(0,s.jsx)(t.h2,{id:"more-on-github",children:"More on GitHub"}),"\n",(0,s.jsx)(i._,{children:(0,s.jsx)(n.Z,{href:"https://github.com/Wave-Play/robo.js/tree/main/packages/plugin-devtools",title:"\ud83d\udd17 GitHub Repository",description:"Explore source code on GitHub."})})]})}function p(e={}){const{wrapper:t}={...(0,r.a)(),...e.components};return t?(0,s.jsx)(t,{...e,children:(0,s.jsx)(u,{...e})}):u(e)}},5396:(e,t,o)=>{o.d(t,{Z:()=>i});var s=o(7294),r=o(3692),n=o(2503);const i=e=>{const{description:t,href:o,title:i}=e;return s.createElement(r.Z,{className:"col col--6 nodecor margin-bottom--lg",to:o},s.createElement("div",{className:"card padding--lg cardContent"},s.createElement(n.Z,{as:"h4",className:"text--truncate cardTitle"},i),s.createElement("p",{className:"text--truncate cardDescription"},t)))}},352:(e,t,o)=>{o.d(t,{_:()=>r});var s=o(7294);const r=e=>{const{children:t}=e;return s.createElement("div",{className:"row cardContainer"},t)}},5251:(e,t,o)=>{var s=o(7294),r=Symbol.for("react.element"),n=Symbol.for("react.fragment"),i=Object.prototype.hasOwnProperty,l=s.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner,d={key:!0,ref:!0,__self:!0,__source:!0};function c(e,t,o){var s,n={},c=null,a=null;for(s in void 0!==o&&(c=""+o),void 0!==t.key&&(c=""+t.key),void 0!==t.ref&&(a=t.ref),t)i.call(t,s)&&!d.hasOwnProperty(s)&&(n[s]=t[s]);if(e&&e.defaultProps)for(s in t=e.defaultProps)void 0===n[s]&&(n[s]=t[s]);return{$$typeof:r,type:e,key:c,ref:a,props:n,_owner:l.current}}t.Fragment=n,t.jsx=c,t.jsxs=c},5893:(e,t,o)=>{e.exports=o(5251)},1151:(e,t,o)=>{o.d(t,{Z:()=>l,a:()=>i});var s=o(7294);const r={},n=s.createContext(r);function i(e){const t=s.useContext(n);return s.useMemo((function(){return"function"==typeof e?e(t):{...t,...e}}),[t,e])}function l(e){let t;return t=e.disableParentContext?"function"==typeof e.components?e.components(r):e.components||r:i(e.components),s.createElement(n.Provider,{value:t},e.children)}}}]);