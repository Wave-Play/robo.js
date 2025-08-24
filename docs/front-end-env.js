const dotenv = require('dotenv');
const webpack = require('webpack');

dotenv.config();

function getClientEnv(prefix) {
  const raw = Object.keys(process.env)
    .filter((key) => key.startsWith(prefix))
    .reduce((env, key) => {
      env[`process.env.${key}`] = JSON.stringify(process.env[key]);
      return env;
    }, {});

  return raw;
}

/** @type {import('@docusaurus/types').PluginModule} */
function envInjectorPlugin() {
  return {
    name: 'env-injector-plugin',

    configureWebpack() {
      return {
        plugins: [
          new webpack.DefinePlugin(getClientEnv('PUBLIC_')), // only include MY_ variables
        ],
      };
    },
  };
}

module.exports = envInjectorPlugin;