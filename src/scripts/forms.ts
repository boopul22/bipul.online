type FormResult = {
  ok: boolean;
  message?: string;
  field?: string;
};

function setStatus(element: HTMLElement, message: string, ok: boolean): void {
  element.textContent = message;
  element.dataset.state = ok ? "success" : "error";
  element.hidden = false;
}

document.querySelectorAll<HTMLFormElement>("[data-async-form]").forEach((form) => {
  const status = form.querySelector<HTMLElement>("[data-form-status]");
  const button = form.querySelector<HTMLButtonElement>("button[type='submit']");
  if (!status || !button) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const originalLabel = button.textContent ?? "Submit";
    button.disabled = true;
    button.textContent = button.dataset.pendingLabel ?? "Sending…";
    status.hidden = true;

    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: { accept: "application/json" },
        body: new FormData(form),
      });
      const result = (await response.json()) as FormResult;

      if (!response.ok || !result.ok) {
        setStatus(status, result.message ?? "Something went wrong. Please try again.", false);
        if (result.field) {
          const field = form.elements.namedItem(result.field);
          if (field instanceof HTMLElement) field.focus();
        }
        return;
      }

      setStatus(status, result.message ?? "Done — thank you!", true);
      form.reset();
    } catch {
      setStatus(status, "Couldn't connect. Check your connection and try again.", false);
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });
});

const query = new URLSearchParams(window.location.search);
const formName = query.get("form");
const result = query.get("status");
if ((formName === "contact" || formName === "subscribe") && result) {
  const form = document.querySelector<HTMLFormElement>(`[data-form-name="${formName}"]`);
  const status = form?.querySelector<HTMLElement>("[data-form-status]");
  if (status) {
    const ok = result === "success";
    setStatus(
      status,
      ok
        ? formName === "contact"
          ? "Thanks — your message has been sent."
          : "You're on the list. Thank you!"
        : "Something went wrong. Please check the form and try again.",
      ok,
    );
  }
}
