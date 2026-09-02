import type { APIRoute } from "astro";
import {
  FormError,
  assertSameOrigin,
  enforceRateLimit,
  errorResponse,
  formResponse,
  getFormEnv,
  isEmail,
  notifyOwner,
  readForm,
} from "../../lib/form-utils";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    assertSameOrigin(request);
    const data = await readForm(request);

    // Bots tend to fill hidden fields. Return success without saving their data.
    if (data.website) {
      return formResponse(request, "contact", {
        ok: true,
        message: "Thanks — your message has been sent.",
      });
    }

    if (!data.name || data.name.length > 100) {
      throw new FormError("Enter your name (up to 100 characters).", 400, "name");
    }
    if (!isEmail(data.email ?? "")) {
      throw new FormError("Enter a valid email address.", 400, "email");
    }
    if (!data.message || data.message.length < 10 || data.message.length > 5_000) {
      throw new FormError(
        "Write a message between 10 and 5,000 characters.",
        400,
        "message",
      );
    }

    await enforceRateLimit(request, "contact", 5, 600);

    const formEnv = getFormEnv();
    if (!formEnv.SESSION) {
      throw new FormError("The contact form is temporarily unavailable.", 503);
    }

    const submittedAt = new Date().toISOString();
    const id = crypto.randomUUID();
    const record = {
      id,
      name: data.name,
      email: data.email.toLowerCase(),
      message: data.message,
      submittedAt,
      userAgent: request.headers.get("user-agent") ?? "unknown",
      notification: { status: "pending" },
    };

    const key = `contact:${submittedAt}:${id}`;
    await formEnv.SESSION.put(key, JSON.stringify(record));

    // The KV copy remains the source of truth if email delivery is interrupted.
    record.notification = await notifyOwner({
      subject: `Website message from ${data.name}`,
      text: `Name: ${data.name}\nEmail: ${data.email}\nSubmitted: ${submittedAt}\n\n${data.message}`,
      replyTo: { email: data.email, name: data.name },
    });
    await formEnv.SESSION.put(key, JSON.stringify(record));

    return formResponse(request, "contact", {
      ok: true,
      message: "Thanks — your message has been sent.",
    });
  } catch (error) {
    return errorResponse(request, "contact", error);
  }
};

export const ALL: APIRoute = ({ request }) =>
  formResponse(request, "contact", { ok: false, message: "Method not allowed." }, 405);
