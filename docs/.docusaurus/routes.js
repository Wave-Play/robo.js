import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
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
    component: ComponentCreator('/', '46d'),
    routes: [
      {
        path: '/',
        component: ComponentCreator('/', '058'),
        routes: [
          {
            path: '/',
            component: ComponentCreator('/', '148'),
            routes: [
              {
                path: '/cli/create-robo',
                component: ComponentCreator('/cli/create-robo', '202'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/cli/overview',
                component: ComponentCreator('/cli/overview', '34d'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/cli/robo',
                component: ComponentCreator('/cli/robo', '4c8'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/discord-activities/getting-started',
                component: ComponentCreator('/discord-activities/getting-started', 'd6c'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/discord-activities/multiplayer',
                component: ComponentCreator('/discord-activities/multiplayer', 'd30'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/discord-activities/proxy',
                component: ComponentCreator('/discord-activities/proxy', '129'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/discord-bots/commands',
                component: ComponentCreator('/discord-bots/commands', '1f3'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/discord-bots/context-menu',
                component: ComponentCreator('/discord-bots/context-menu', 'cee'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/discord-bots/debug',
                component: ComponentCreator('/discord-bots/debug', '2dc'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/discord-bots/events',
                component: ComponentCreator('/discord-bots/events', '8f6'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/discord-bots/getting-started',
                component: ComponentCreator('/discord-bots/getting-started', '68c'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/discord-bots/invite',
                component: ComponentCreator('/discord-bots/invite', '7a2'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/discord-bots/middleware',
                component: ComponentCreator('/discord-bots/middleware', 'dfa'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/discord-bots/migrate',
                component: ComponentCreator('/discord-bots/migrate', '56b'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/discord-bots/sage',
                component: ComponentCreator('/discord-bots/sage', '591'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/discord-bots/secrets',
                component: ComponentCreator('/discord-bots/secrets', 'eb7'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/getting-started',
                component: ComponentCreator('/getting-started', '9b5'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/hosting/overview',
                component: ComponentCreator('/hosting/overview', '631'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/hosting/roboplay',
                component: ComponentCreator('/hosting/roboplay', 'd4e'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/hosting/self-host',
                component: ComponentCreator('/hosting/self-host', '8a5'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/plugins/ai',
                component: ComponentCreator('/plugins/ai', '0eb'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/plugins/ai-voice',
                component: ComponentCreator('/plugins/ai-voice', '9da'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/plugins/better-stack',
                component: ComponentCreator('/plugins/better-stack', '790'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/plugins/create',
                component: ComponentCreator('/plugins/create', 'b65'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/plugins/dev',
                component: ComponentCreator('/plugins/dev', 'ff1'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/plugins/directory',
                component: ComponentCreator('/plugins/directory', 'c9d'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/plugins/install',
                component: ComponentCreator('/plugins/install', '4c7'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/plugins/maintenance',
                component: ComponentCreator('/plugins/maintenance', 'eb4'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/plugins/moderation',
                component: ComponentCreator('/plugins/moderation', '59f'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/plugins/overview',
                component: ComponentCreator('/plugins/overview', '145'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/plugins/server',
                component: ComponentCreator('/plugins/server', '322'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/plugins/sync',
                component: ComponentCreator('/plugins/sync', '7e0'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/robojs/config',
                component: ComponentCreator('/robojs/config', 'e0d'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/robojs/files',
                component: ComponentCreator('/robojs/files', '2da'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/robojs/flashcore',
                component: ComponentCreator('/robojs/flashcore', '86c'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/robojs/internals',
                component: ComponentCreator('/robojs/internals', '105'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/robojs/linting',
                component: ComponentCreator('/robojs/linting', '361'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/robojs/logger',
                component: ComponentCreator('/robojs/logger', '6ed'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/robojs/mode',
                component: ComponentCreator('/robojs/mode', '74c'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/robojs/modules',
                component: ComponentCreator('/robojs/modules', 'a90'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/robojs/overview',
                component: ComponentCreator('/robojs/overview', '1ed'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/robojs/portal',
                component: ComponentCreator('/robojs/portal', 'be3'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/robojs/state',
                component: ComponentCreator('/robojs/state', '940'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/robojs/typescript',
                component: ComponentCreator('/robojs/typescript', '5ab'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/templates/overview',
                component: ComponentCreator('/templates/overview', 'ad0'),
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
