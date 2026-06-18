/// <reference types="vite/client" />

declare const __DEEBEE_VERSION__: string;

// Vite worker import support
declare module "*?worker" {
  const workerConstructor: new () => Worker;
  export default workerConstructor;
}

declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorker?: () => Worker;
      getWorkerUrl?: (moduleId: string, label: string) => string;
    };
  }
}