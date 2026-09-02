import type { APIRoute } from "astro";
import {
  FormError,
  assertSameOrigin,
  enforceRateLimit,
  errorResponse,
  formResponse,
  getFormEnv,
  hash,
  isEmail,
  notifyOwner,
  readForm,
} from "../../lib/form-utils";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    assertSameOrigin(request);
    const data = await readForm(request);

    if (data.website) {
      return formResponse(request, "subscribe", {
        ok: true,
        message: "You're on the list. Thank you!",
      });
    }

    if (!isEmail(data.email ?? "")) {
      throw new FormError("Enter a valid email address.", 400, "email");
    }

    await enforceRateLimit(request, "subscribe", 10, 600);

    const formEnv = getFormEnv();
    if (!formEnv.SESSION) {
      throw new FormError("Email signup is temporarily unavailable.", 503);
    }

    const email = data.email.toLowerCase();
    const emailHash = await hash(email);
    const key = `subscriber:${emailHash}`;
    if (await formEnv.SESSION.get(key)) {
      return formResponse(request, "subscribe", {
        ok: true,
        message: "You're already on the list. Thank you!",
      });
    }

    const subscribedAt = new Date().toISOString();
    const record = {
      email,
      subscribedAt,
      source: "bipul.online",
      consent: "email-updates",
      notification: { status: "pending" },
    };
    await formEnv.SESSION.put(key, JSON.stringify(record));

    record.notification = await notifyOwner({
      subject: "New email signup on bipul.online",
      text: `Email: ${email}\nSubscribed: ${subscribedAt}\nSource: bipul.online`,
      replyTo: { email, name: "Subscriber" },
    });
    await formEnv.SESSION.put(key, JSON.stringify(record));

    return formResponse(request, "subscribe", {
      ok: true,
      message: "You're on the list. Thank you!",
    });
  } catch (error) {
    return errorResponse(request, "subscribe", error);
  }
};

export const ALL: APIRoute = ({ request }) =>
  formResponse(request, "subscribe", { ok: false, message: "Method not allowed." }, 405);
