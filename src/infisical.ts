import axios, { AxiosError, AxiosInstance } from "axios";
import core from "@actions/core";
import querystring from "querystring";
import { Sha256 } from "@aws-crypto/sha256-js";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { HttpRequest } from "@aws-sdk/protocol-http";
import { SignatureV4 } from "@aws-sdk/signature-v4";
import {
  AuthMethod,
  AWS_IDENTITY_DOCUMENT_URI,
  AWS_TOKEN_METADATA_URI,
} from "./constants";
import { TIdentityLoginResponse, TPerformAuth } from "./types";
import { handleRequestError } from "./util";

export const authenticationFactory = ({
  domain,
  defaultHeaders,
}: {
  domain: string;
  defaultHeaders?: Record<string, string>;
}) => {
  const request = axios.create({
    baseURL: domain,
    ...(defaultHeaders && { headers: defaultHeaders }),
  });

  const login = async (data: TPerformAuth) => {
    switch (data.method) {
      case AuthMethod.Universal:
        return $universalAuthLogin(data);
      case AuthMethod.Oidc:
        return $oidcLogin(data);
      case AuthMethod.AwsIam:
        return $awsIamLogin(data);
      default:
        throw new Error(
          `Invalid authentication method: ${(data as unknown as { method: string })?.method ?? "Unknown"}`,
        );
    }
  };

  const $universalAuthLogin = async ({
    clientId,
    clientSecret,
  }: {
    clientId: string;
    clientSecret: string;
  }) => {
    const loginData = querystring.stringify({
      clientId,
      clientSecret,
    });

    try {
      const response = await request<TIdentityLoginResponse>({
        method: "post",
        url: "/api/v1/auth/universal-auth/login",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        data: loginData,
      });

      return response.data.accessToken;
    } catch (err) {
      handleRequestError(err);
      throw err;
    }
  };

  const $oidcLogin = async ({
    identityId,
    oidcAudience,
  }: {
    identityId: string;
    oidcAudience?: string;
  }) => {
    const idToken = await core.getIDToken(oidcAudience);

    const loginData = querystring.stringify({
      identityId,
      jwt: idToken,
    });

    try {
      const response = await request<TIdentityLoginResponse>({
        method: "post",
        url: "/api/v1/auth/oidc-auth/login",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        data: loginData,
      });

      return response.data.accessToken;
    } catch (err) {
      handleRequestError(err);
      throw err;
    }
  };

  const $awsIamLogin = async ({ identityId }: { identityId: string }) => {
    try {
      // Get AWS region
      const region = await getAwsRegion();

      // Get AWS credentials
      const credentials = await fromNodeProviderChain()();

      if (!credentials.accessKeyId || !credentials.secretAccessKey) {
        throw new Error("AWS credentials not found");
      }

      // Create the AWS STS request
      const iamRequestURL = `https://sts.${region}.amazonaws.com/`;
      const iamRequestBody = "Action=GetCallerIdentity&Version=2011-06-15";
      const iamRequestHeaders = {
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
        Host: `sts.${region}.amazonaws.com`,
      };

      const awsRequest = new HttpRequest({
        protocol: "https:",
        hostname: `sts.${region}.amazonaws.com`,
        path: "/",
        method: "POST",
        headers: {
          ...iamRequestHeaders,
          "Content-Length": String(Buffer.byteLength(iamRequestBody)),
        },
        body: iamRequestBody,
      });

      // Sign the request
      const signer = new SignatureV4({
        credentials,
        region,
        service: "sts",
        sha256: Sha256,
      });

      const signedRequest = await signer.sign(awsRequest);

      // Extract headers as string record
      const headers: Record<string, string> = {};
      Object.entries(signedRequest.headers).forEach(([key, value]) => {
        if (typeof value === "string") {
          // Normalize Authorization header to proper case
          const normalizedKey =
            key.toLowerCase() === "authorization" ? "Authorization" : key;
          headers[normalizedKey] = value;
        }
      });

      // Send login request to Infisical
      const loginData = querystring.stringify({
        identityId,
        iamHttpRequestMethod: "POST",
        iamRequestBody: Buffer.from(iamRequestBody).toString("base64"),
        iamRequestHeaders: Buffer.from(JSON.stringify(headers)).toString(
          "base64",
        ),
      });

      const response = await request<TIdentityLoginResponse>({
        method: "post",
        url: "/api/v1/auth/aws-auth/login",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        data: loginData,
      });

      return response.data.accessToken;
    } catch (err) {
      handleRequestError(err);
      throw err;
    }
  };

  return {
    login,
  };
};

const getAwsRegion = async () => {
  const region = process.env.AWS_REGION; // Typically found in lambda runtime environment
  if (region) {
    return region;
  }

  try {
    const tokenResponse = await axios.put(AWS_TOKEN_METADATA_URI, undefined, {
      headers: {
        "X-aws-ec2-metadata-token-ttl-seconds": "21600",
      },
      timeout: 5_000, // 5 seconds
    });

    const identityResponse = await axios.get(AWS_IDENTITY_DOCUMENT_URI, {
      headers: {
        "X-aws-ec2-metadata-token": tokenResponse.data,
        Accept: "application/json",
      },
      timeout: 5_000, // 5 seconds
    });

    return identityResponse.data.region;
  } catch (err) {
    handleRequestError(err);
    throw err;
  }
};
