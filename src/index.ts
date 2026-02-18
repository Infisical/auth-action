import core from "@actions/core";
import { authenticationFactory } from "./infisical";
import {
  AuthMethod,
  ENVIRONMENT_VARIABLE_NAMES,
  EnvironmentVariableNames,
} from "./constants";
import { exportAccessToken, validateAuthMethod } from "./util";
import { TPerformAuth } from "./types";

function parseHeadersInput(inputKey: string) {
  const rawHeadersString = core.getInput(inputKey) || "";

  const headerStrings = rawHeadersString
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

  const parsedHeaderStrings = headerStrings.reduce(
    (obj, line) => {
      const seperator = line.indexOf(":");
      const key = line.substring(0, seperator).trim().toLowerCase();
      const value = line.substring(seperator + 1).trim();
      if (obj[key]) {
        obj[key] = [obj[key], value].join(", ");
      } else {
        obj[key] = value;
      }
      return obj;
    },
    {} as Record<string, string>,
  );

  return parsedHeaderStrings;
}

const getInput = (
  coreInputKey: string,
  environmentVariableName: EnvironmentVariableNames,
) => {
  try {
    const input = core.getInput(coreInputKey);
    if (input) {
      return input;
    }

    const environmentVariable = process.env[environmentVariableName];
    if (environmentVariable) {
      return environmentVariable;
    }

    return null;
  } catch (err) {
    core.debug(
      `Error getting input ${coreInputKey}: ${(err as Error)?.message}`,
    );
    return null;
  }
};

const main = async () => {
  try {
    const method = core.getInput("method");
    const domain = core.getInput("domain");
    const outputCredential = core.getBooleanInput("output-credential");
    const outputEnvCredential = core.getBooleanInput("output-env-credential");
    const extraHeaders = parseHeadersInput("extra-headers");

    validateAuthMethod(method);

    let performAuth: TPerformAuth;

    switch (method) {
      case AuthMethod.Universal: {
        const uaClientId = getInput(
          "client-id",
          ENVIRONMENT_VARIABLE_NAMES.INFISICAL_UNIVERSAL_AUTH_CLIENT_ID_NAME,
        );
        const uaClientSecret = getInput(
          "client-secret",
          ENVIRONMENT_VARIABLE_NAMES.INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET_NAME,
        );

        if (!uaClientId || !uaClientSecret) {
          throw new Error("Missing Universal Auth credentials");
        }

        performAuth = {
          method: AuthMethod.Universal,
          clientId: uaClientId,
          clientSecret: uaClientSecret,
        };
        break;
      }
      case AuthMethod.Oidc: {
        const identityId = getInput(
          "identity-id",
          ENVIRONMENT_VARIABLE_NAMES.INFISICAL_MACHINE_IDENTITY_ID_NAME,
        );
        const oidcAudience = core.getInput("oidc-audience");

        if (!identityId) {
          throw new Error("Missing identity ID for OIDC auth");
        }

        performAuth = {
          method: AuthMethod.Oidc,
          identityId,
          oidcAudience,
        };
        break;
      }
      case AuthMethod.AwsIam: {
        const identityId = getInput(
          "identity-id",
          ENVIRONMENT_VARIABLE_NAMES.INFISICAL_MACHINE_IDENTITY_ID_NAME,
        );

        if (!identityId) {
          throw new Error("Missing identity ID for AWS IAM auth");
        }

        performAuth = {
          method: AuthMethod.AwsIam,
          identityId,
        };
        break;
      }
      default:
        throw new Error(`Invalid authentication method: ${method}`);
    }

    const auth = authenticationFactory({
      domain,
      defaultHeaders: extraHeaders,
    });

    const infisicalToken = await auth.login(performAuth);

    await exportAccessToken(infisicalToken, outputCredential, outputEnvCredential);
  } catch (err) {
    core.setFailed((err as Error)?.message);
  }
};

main();
