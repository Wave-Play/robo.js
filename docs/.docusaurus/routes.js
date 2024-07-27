import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/__docusaurus/debug',
    component: ComponentCreator('/__docusaurus/debug', '5ff'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/config',
    component: ComponentCreator('/__docusaurus/debug/config', '5ba'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/content',
    component: ComponentCreator('/__docusaurus/debug/content', 'a2b'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/globalData',
    component: ComponentCreator('/__docusaurus/debug/globalData', 'c3c'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/metadata',
    component: ComponentCreator('/__docusaurus/debug/metadata', '156'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/registry',
    component: ComponentCreator('/__docusaurus/debug/registry', '88c'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/routes',
    component: ComponentCreator('/__docusaurus/debug/routes', '000'),
    exact: true
  },
  {
    path: '/lumina',
    component: ComponentCreator('/lumina', '9b3'),
    exact: true
  },
  {
    path: '/playground',
    component: ComponentCreator('/playground', '859'),
    exact: true
  },
  {
    path: '/plugins',
    component: ComponentCreator('/plugins', '50a'),
    exact: true
  },
  {
    path: '/robokit',
    component: ComponentCreator('/robokit', '570'),
    exact: true
  },
  {
    path: '/',
    component: ComponentCreator('/', 'e5f'),
    exact: true
  },
  {
    path: '/',
    component: ComponentCreator('/', '29c'),
    routes: [
      {
        path: '/',
        component: ComponentCreator('/', 'a6f'),
        routes: [
          {
            path: '/',
            component: ComponentCreator('/', 'd59'),
            routes: [
              {
                path: '/cli/create-robo',
                component: ComponentCreator('/cli/create-robo', 'fc6'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/cli/overview',
                component: ComponentCreator('/cli/overview', 'fe6'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/cli/robo',
                component: ComponentCreator('/cli/robo', '285'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/discord-activities/getting-started',
                component: ComponentCreator('/discord-activities/getting-started', 'c7e'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/discord-activities/multiplayer',
                component: ComponentCreator('/discord-activities/multiplayer', 'a66'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/discord-activities/proxy',
                component: ComponentCreator('/discord-activities/proxy', '38e'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/discord-bots/commands',
                component: ComponentCreator('/discord-bots/commands', '222'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/discord-bots/context-menu',
                component: ComponentCreator('/discord-bots/context-menu', '114'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/discord-bots/debug',
                component: ComponentCreator('/discord-bots/debug', 'fc3'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/discord-bots/events',
                component: ComponentCreator('/discord-bots/events', 'b68'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/discord-bots/getting-started',
                component: ComponentCreator('/discord-bots/getting-started', 'fa0'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/discord-bots/invite',
                component: ComponentCreator('/discord-bots/invite', '692'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/discord-bots/middleware',
                component: ComponentCreator('/discord-bots/middleware', '308'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/discord-bots/migrate',
                component: ComponentCreator('/discord-bots/migrate', 'a54'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/discord-bots/sage',
                component: ComponentCreator('/discord-bots/sage', 'db2'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/discord-bots/secrets',
                component: ComponentCreator('/discord-bots/secrets', '6f0'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/getting-started',
                component: ComponentCreator('/getting-started', 'b49'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/hosting/overview',
                component: ComponentCreator('/hosting/overview', 'bf7'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/hosting/roboplay',
                component: ComponentCreator('/hosting/roboplay', '8d9'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/hosting/self-host',
                component: ComponentCreator('/hosting/self-host', 'a3e'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/plugins/ai',
                component: ComponentCreator('/plugins/ai', 'b98'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/plugins/ai-voice',
                component: ComponentCreator('/plugins/ai-voice', 'b76'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/plugins/better-stack',
                component: ComponentCreator('/plugins/better-stack', '96d'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/plugins/create',
                component: ComponentCreator('/plugins/create', '6f6'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/plugins/dev',
                component: ComponentCreator('/plugins/dev', 'b9a'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/plugins/directory',
                component: ComponentCreator('/plugins/directory', 'c8b'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/plugins/install',
                component: ComponentCreator('/plugins/install', 'df0'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/plugins/maintenance',
                component: ComponentCreator('/plugins/maintenance', '944'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/plugins/moderation',
                component: ComponentCreator('/plugins/moderation', 'c63'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/plugins/overview',
                component: ComponentCreator('/plugins/overview', '69b'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/plugins/server',
                component: ComponentCreator('/plugins/server', '911'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/plugins/sync',
                component: ComponentCreator('/plugins/sync', 'd6d'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/robojs/config',
                component: ComponentCreator('/robojs/config', '5fa'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/robojs/files',
                component: ComponentCreator('/robojs/files', '265'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/robojs/flashcore',
                component: ComponentCreator('/robojs/flashcore', '9ce'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/robojs/internals',
                component: ComponentCreator('/robojs/internals', 'c9b'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/robojs/linting',
                component: ComponentCreator('/robojs/linting', '6c7'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/robojs/logger',
                component: ComponentCreator('/robojs/logger', '49c'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/robojs/mode',
                component: ComponentCreator('/robojs/mode', 'e4e'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/robojs/modules',
                component: ComponentCreator('/robojs/modules', '3ae'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/robojs/overview',
                component: ComponentCreator('/robojs/overview', 'd33'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/robojs/portal',
                component: ComponentCreator('/robojs/portal', '312'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/robojs/state',
                component: ComponentCreator('/robojs/state', '9a2'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/robojs/typescript',
                component: ComponentCreator('/robojs/typescript', '50a'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/templates/overview',
                component: ComponentCreator('/templates/overview', '8b0'),
                exact: true,
                sidebar: "tutorialSidebar"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
