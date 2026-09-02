import { env } from "cloudflare:workers";

export interface FormEnv {
  SESSION?: {
    get(key: string): Promise<string | null>;
    put(
      key: string,
      value: string,
      options?: { expirationTtl?: number },
    ): Promise<void>;
  };
  EMAIL?: {
    send(message: {
      to: string | { email: string; name?: string };
      from: string | { email: string; name?: string };
      subject: string;
      text: string;
      replyTo?: string | { email: string; name?: string };
    }): Promise<{ messageId: string }>;
  };
}

export class FormError extends Error {
  constructor(
    message: string,
    public status = 400,
    public field?: string,
  ) {
    super(message);
  }
}

export function getFormEnv(): FormEnv {
  return env as unknown as FormEnv;
}

export async function notifyOwner(options: {
  subject: string;
  text: string;
  replyTo?: { email: string; name?: string };
}): Promise<{ status: "sent" | "failed" | "not-configured"; messageId?: string }> {
  const email = getFormEnv().EMAIL;
  if (!email) return { status: "not-configured" };

  try {
    const result = await email.send({
      to: { email: "blog.boopul@gmail.com", name: "Bipul Kumar" },
      from: { email: "website@bipul.online", name: "Bipul website" },
      subject: options.subject,
      text: options.text,
      ...(options.replyTo ? { replyTo: options.replyTo } : {}),
    });
    return { status: "sent", messageId: result.messageId };
  } catch (error) {
    console.error("Cloudflare email notification failed", error);
    return { status: "failed" };
  }
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const crossSite = request.headers.get("sec-fetch-site") === "cross-site";

  if (crossSite || (origin && origin !== new URL(request.url).origin)) {
    throw new FormError("This form must be submitted from this website.", 403);
  }
}

export async function readForm(request: Request): Promise<Record<string, string>> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 20_000) {
    throw new FormError("That submission is too large.", 413);
  }

  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new FormError("The form data could not be read.");
    }

    return Object.fromEntries(
      Object.entries(body).map(([key, value]) => [
        key,
        typeof value === "string" ? value.trim() : "",
      ]),
    );
  }

  if (
    type.includes("application/x-www-form-urlencoded") ||
    type.includes("multipart/form-data")
  ) {
    const body = await request.formData();
    return Object.fromEntries(
      [...body.entries()].map(([key, value]) => [
        key,
        typeof value === "string" ? value.trim() : "",
      ]),
    );
  }

  throw new FormError("Unsupported form format.", 415);
}

export function isEmail(value: string): boolean {
  return (
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(value)
  );
}

export async function hash(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function enforceRateLimit(
  request: Request,
  namespace: string,
  maximum: number,
  windowSeconds: number,
): Promise<void> {
  const kv = getFormEnv().SESSION;
  if (!kv) throw new FormError("The form service is unavailable.", 503);

  const address =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const identity = await hash(address);
  const key = `rate:${namespace}:${identity}`;
  const current = Number((await kv.get(key)) ?? "0");

  if (current >= maximum) {
    throw new FormError("Too many attempts. Please wait a few minutes.", 429);
  }

  await kv.put(key, String(current + 1), { expirationTtl: windowSeconds });
}

export function formResponse(
  request: Request,
  form: "contact" | "subscribe",
  body: Record<string, unknown>,
  status = 200,
): Response {
  const acceptsHtml = request.headers.get("accept")?.includes("text/html");
  if (acceptsHtml) {
    const result = status >= 200 && status < 300 ? "success" : "error";
    return Response.redirect(
      new URL(`/?form=${form}&status=${result}#contact`, request.url),
      303,
    );
  }

  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export function errorResponse(
  request: Request,
  form: "contact" | "subscribe",
  error: unknown,
): Response {
  const known = error instanceof FormError;
  return formResponse(
    request,
    form,
    {
      ok: false,
      message: known ? error.message : "Something went wrong. Please try again.",
      ...(known && error.field ? { field: error.field } : {}),
    },
    known ? error.status : 500,
  );
}
