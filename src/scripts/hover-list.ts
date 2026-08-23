// Floating hover highlight for list sections ([data-hover-list]): a rounded
// background pill glides under the row being hovered and fades out when the
// pointer leaves. Pure CSS transitions do the animating.

function initList(list: HTMLElement) {
  const bg = list.querySelector<HTMLElement>("[data-hover-bg]");
  const items = Array.from(list.querySelectorAll<HTMLElement>("[data-hover-item]"));
  if (!bg || items.length === 0) return;

  let active: HTMLElement | null = null;

  const moveTo = (item: HTMLElement) => {
    active = item;
    bg.style.width = `${item.offsetWidth}px`;
    bg.style.height = `${item.offsetHeight}px`;
    bg.style.transform = `translate(${item.offsetLeft}px, ${item.offsetTop}px)`;
    bg.style.opacity = "1";
  };

  const hide = () => {
    active = null;
    bg.style.opacity = "0";
  };

  for (const item of items) {
    item.addEventListener("pointerenter", () => moveTo(item));
  }
  list.addEventListener("pointerleave", hide);

  // Keep the highlight aligned when the viewport changes size.
  window.addEventListener("resize", () => {
    if (active) moveTo(active);
    else hide();
  });
}

document.querySelectorAll<HTMLElement>("[data-hover-list]").forEach(initList);
