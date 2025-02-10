type VSCode = {
    workspace: unknown;
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
  };
declare const vscode: VSCode;