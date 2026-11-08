import { constants, KeyObject, sign } from "node:crypto";
import { isUtcMillisecondInstant } from "./publisher.js";

export interface GitHubAppJwtOptions {
  appId: number;
  observedAt: string;
  clockSkewSeconds: number;
  validForSeconds: number;
}

export function createGitHubAppJwt(requested: GitHubAppJwtOptions, privateKey: KeyObject): string {
  const fields = ["appId", "observedAt", "clockSkewSeconds", "validForSeconds"];
  if (requested === null || typeof requested !== "object" ||
      Reflect.ownKeys(requested).length !== fields.length ||
      !fields.every(field => Object.hasOwn(requested, field))) {
    throw new Error("Invalid GitHub App JWT options");
  }
  const options = { ...requested };
  if (!Number.isSafeInteger(options.appId) || options.appId < 1 ||
      !isUtcMillisecondInstant(options.observedAt) ||
      !Number.isSafeInteger(options.clockSkewSeconds) || options.clockSkewSeconds < 0 || options.clockSkewSeconds > 60 ||
      !Number.isSafeInteger(options.validForSeconds) || options.validForSeconds < 1 || options.validForSeconds > 600) {
    throw new Error("Invalid GitHub App JWT options");
  }
  if (!(privateKey instanceof KeyObject) || privateKey.type !== "private" || privateKey.asymmetricKeyType !== "rsa") {
    throw new Error("GitHub App JWT requires an RSA private KeyObject");
  }
  const modulusLength = privateKey.asymmetricKeyDetails?.modulusLength;
  if (modulusLength === undefined || !Number.isSafeInteger(modulusLength) || modulusLength < 2048) {
    throw new Error("GitHub App JWT requires an RSA modulus of at least 2048 bits");
  }
  const now = Math.floor(Date.parse(options.observedAt) / 1000);
  const iat = now - options.clockSkewSeconds, exp = now + options.validForSeconds;
  if (iat < 0 || !isUtcMillisecondInstant(new Date(exp * 1000).toISOString())) {
    throw new Error("GitHub App JWT claims exceed supported UTC bounds");
  }
  const encode = (value: object) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iat, exp, iss: String(options.appId) })}`;
  let signature: Buffer;
  try {
    signature = sign("RSA-SHA256", Buffer.from(unsigned, "ascii"), { key: privateKey, padding: constants.RSA_PKCS1_PADDING });
  } catch {
    throw new Error("GitHub App JWT signing failed");
  }
  return `${unsigned}.${signature.toString("base64url")}`;
}
