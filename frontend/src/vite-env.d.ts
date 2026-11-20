/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_GITHUB_APP_SLUG?: string;
  readonly VITE_GITHUB_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
