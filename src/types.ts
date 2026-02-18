import { AuthMethod } from "./constants";

export type TPerformAuth =
  | {
      method: AuthMethod.Universal;
      clientId: string;
      clientSecret: string;
    }
  | {
      method: AuthMethod.Oidc;
      identityId: string;
      oidcAudience?: string;
    }
  | {
      method: AuthMethod.AwsIam;
      identityId: string;
    };

export type TIdentityLoginResponse = {
  accessToken: string;
};
