/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOCAL_BUILD_REVISION: string | null;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
