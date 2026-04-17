declare module "qz-tray" {
  const qz: {
    security: {
      setSignatureAlgorithm: (algo: string) => void;
      setCertificatePromise: (
        fn: (resolve: (c: string | null) => void) => void,
      ) => void;
      setSignaturePromise: (
        fn: (
          toSign: string,
        ) => (resolve: (sig: string) => void, reject: (e: Error) => void) => void,
      ) => void;
    };
    websocket: {
      isActive: () => boolean;
      connect: (opts?: Record<string, unknown>) => Promise<void>;
      disconnect: () => Promise<void>;
    };
    printers: {
      find: (query?: string) => Promise<string | string[]>;
      details: () => Promise<unknown>;
    };
    configs: {
      create: (
        printer: string | Record<string, unknown>,
        options?: Record<string, unknown>,
      ) => unknown;
    };
    print: (config: unknown, data: unknown[]) => Promise<void>;
    api: {
      getVersion: () => Promise<string>;
    };
  };
  export default qz;
}
