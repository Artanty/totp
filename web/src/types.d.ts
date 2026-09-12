/* Module Federation types */
declare module '*.mjs' {
  const value: any;
  export default value;
}

declare const TOTP_GATE_VERSION: string | undefined;
declare const WEB_BACK_URL: string | undefined;
declare const TOTP_URL: string | undefined;
declare const TOTP_GATE_TOKEN_ID: string | undefined;
declare const BYPASS_TOTP: boolean | undefined;
