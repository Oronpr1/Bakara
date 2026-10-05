import {
  createNestablePublicClientApplication,
  InteractionRequiredAuthError,
  type IPublicClientApplication,
} from "@azure/msal-browser";

/**
 * Sign-in with Nested App Authentication: Word (the host) brokers the token for the account
 * already signed in to Office, so the user normally sees nothing. The token is for our API
 * only (api://.../access_as_user) and is kept in memory by MSAL.
 */

const config = __ADDIN_CONFIG__;
let app: Promise<IPublicClientApplication> | undefined;

function client() {
  app ??= createNestablePublicClientApplication({
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
    },
    cache: { cacheLocation: "memoryStorage" },
  });
  return app;
}

export class SignInError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignInError";
  }
}

export type TokenProvider = () => Promise<string>;

export const getApiToken: TokenProvider = async () => {
  const pca = await client();
  const request = { scopes: [config.apiScope] };
  try {
    return (await pca.acquireTokenSilent(request)).accessToken;
  } catch (err) {
    if (!(err instanceof InteractionRequiredAuthError)) {
      // Silent failures other than "needs interaction" are retried once interactively too;
      // Word shows its own account prompt.
      console.warn("Silent token request failed", err);
    }
    try {
      return (await pca.acquireTokenPopup(request)).accessToken;
    } catch (popupErr) {
      console.error("Token request failed", popupErr);
      throw new SignInError("לא הצלחנו לזהות אותך מול Microsoft 365. ודאו שאתם מחוברים ל-Office עם חשבון המכללה.");
    }
  }
};
