// Building the page's elements. Every string a game sent goes in as text (`textContent`), never as HTML.

type Child = Node | string;

/** An element with its properties and children. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

/** The element with this id, which the page must have. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`the page has no #${id}`);
  return node as T;
}
