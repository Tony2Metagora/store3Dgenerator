/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NANOBANANA_ENDPOINT: string;
  readonly VITE_NANOBANANA_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
