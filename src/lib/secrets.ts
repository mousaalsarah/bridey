const WEAK_SECRETS = new Set(["", "change-me-to-a-long-random-string", "bridey-dev-secret"]);

function isDeployedRuntime() {
  if (process.env.VERCEL === "1") return true;
  const url = process.env.DATABASE_URL || "";
  return /^postgres(ql)?:\/\//i.test(url);
}

export function authSecretValue() {
  const value = process.env.AUTH_SECRET || "";
  if (isDeployedRuntime() && WEAK_SECRETS.has(value)) {
    throw new Error("AUTH_SECRET must be set to a long random string in production");
  }
  return value || "bridey-dev-secret";
}

export function authSecretBytes() {
  return new TextEncoder().encode(authSecretValue());
}

export function adminSecretBytes() {
  return new TextEncoder().encode(`${authSecretValue()}-admin`);
}
