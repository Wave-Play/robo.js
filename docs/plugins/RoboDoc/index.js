
export default function RoboDoco(context, options) {
  return {
      name: 'RoboDoco',

      configureWebpack(config, isServer, utils) {
        return {
          devServer: {
            setupMiddlewares: (middlewares, devServer) => {
              const x = async () => {
                const RoboServer = Robo.Robo.start();
              }
              x()
              return middlewares;
            }
          }
        };
      },

      // configureWebpackDevServer(devServerConfig, { isServer, utils }) {
      //   return {
      //     ...devServerConfig,
      //     devServer: {
      //       static: {
      //         directory: path.join(__dirname, 'public'),
      //       },
      //       compress: true,
      //       port: 9000,
      //     },
      //   }
      // }
    };
};



    // return {
    //   name: 'RoboDoco',
    //   configureWebpack(config, isServer, utils) {
    //     return {
    //       plugins: [new RoboWebPack()]
    //     };
    //   },

    //   configureWebpackDevServer(devServerConfig, { isServer, utils }) {
    //     return {
    //       ...devServerConfig,
    //       devServer: {
    //         static: {
    //           directory: path.join(__dirname, 'public'),
    //         },
    //         compress: true,
    //         port: 9000,
    //       },
    //     }
    //   }
    // };
  
  
  
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
  
        compiler.hooks.afterCompile.tap('RoboWebPack', (compiled) => {
          console.log(compiled)
        })
  
        compiler.hooks.beforeCompile.tapAsync('RoboWebPack', (params, callback) => {
          console.log('IS IT EXECUTING BEFORE');
          //console.log(params);
          params['MyPlugin - data'] = 'important stuff my plugin will use later';
          callback();
        });
      }
    }




   // async loadContent() {
      //   // This hook is used to load data that you want to use in your server.
      // },
    
      // async contentLoaded({ content, actions }) {
      //   // This hook is called after content is loaded.
      //   const { setGlobalData } = actions;
      //   setGlobalData({}); // Set global data if needed.
      // },
    
      // async postBuild({ outDir }) {
      //   // This hook is called after the build is completed.
      //   console.log(`Build finished! Output directory: ${outDir}`);
      // },
    
      // async postStart({ outDir }) {
      //   // This hook is called after the server is started.
      //   console.log(`Server started! Serving from: ${outDir}`);
      // },
    
      // async beforeDevServer({ app, server, config }) {
      //   // This hook allows you to configure the dev server before it starts.
      //   console.log('Starting custom server...');
      //   const RoboServer = await Robo.start();
    
    
      //   engine
        
      //   // Replace the Webpack Dev Server with an Express server
      //   const customServer = express();
    
      //   customServer.use(express.static(config.outDir || 'build'));
    
      //   customServer.get('*', (req, res) => {
      //     res.sendFile('index.html', { root: config.outDir || 'build' });
      //   });
    
      //   const port = options.port || 3000;
      //   customServer.listen(port, () => {
      //     console.log(`Custom server is running at http://localhost:${port}`);
      //   });
    
      //   // Stop the Webpack Dev Server
      //   server.close();
      //   }
      // }