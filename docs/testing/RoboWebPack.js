export default function (context, options) {
  return {
    name: 'RoboDoco',
    configureWebpack(config, isServer, utils) {
      const {getJSLoader} = utils;
      return {
        plugin: [new RoboWebPack()]
      };
    },
  };
}


class RoboWebPack {
    apply(compiler) {
      compiler.hooks.done.tap(
        'RoboWebPack',
        (
          stats /* stats is passed as an argument when done hook is tapped.  */
        ) => {
          console.log('Hello World!');
        }
      );

      compiler.hooks.afterCompile.tap('RoboWebPack', () => {
        console.log('lmao I am gay')
      })

      compiler.hooks.beforeCompile.tapAsync('RoboWebPack', (params, callback) => {

        console.log('IS IT EXECUTING BEFORE');
        console.log(compiler);
        params['MyPlugin - data'] = 'important stuff my plugin will use later';
        callback();
      });
    }
  }