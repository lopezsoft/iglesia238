export const PUBLIC_REGISTRATION_SETTINGS = Symbol(
  'PUBLIC_REGISTRATION_SETTINGS',
);

/** Configuration of the self-registration, resolved once from the environment. */
export interface PublicRegistrationSettings {
  /** Public address of the web app, without a trailing slash. The confirmation link is built from it. */
  readonly appBaseUrl: string;
}
