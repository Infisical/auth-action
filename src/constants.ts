export const AWS_TOKEN_METADATA_URI = "http://169.254.169.254/latest/api/token";
export const AWS_IDENTITY_DOCUMENT_URI =
  "http://169.254.169.254/latest/dynamic/instance-identity/document";

export enum AuthMethod {
  Universal = "universal",
  Oidc = "oidc",
  AwsIam = "aws-iam",
}

export const ENVIRONMENT_VARIABLE_NAMES = {
  INFISICAL_UNIVERSAL_AUTH_CLIENT_ID_NAME: "INFISICAL_UNIVERSAL_AUTH_CLIENT_ID",
  INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET_NAME:
    "INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET",
  INFISICAL_MACHINE_IDENTITY_ID_NAME: "INFISICAL_MACHINE_IDENTITY_ID",
} as const;

export type EnvironmentVariableNames =
  (typeof ENVIRONMENT_VARIABLE_NAMES)[keyof typeof ENVIRONMENT_VARIABLE_NAMES];
