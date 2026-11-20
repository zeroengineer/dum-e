type Child = Node | string | null | undefined | false;

type Props<K extends keyof HTMLElementTagNameMap> = Partial<
  Omit<HTMLElementTagNameMap[K], 'style' | 'children' | 'dataset'>
> & {
  class?: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  on?: { [E in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[E]) => void };
};

/** Tiny element builder: `h('button', { class: 'btn', on: { click } }, 'Start')`. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props<K> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  const { class: className, attrs, on, ...rest } = props;
  if (className) element.className = className;
  Object.assign(element, rest);
  if (attrs) {
    for (const [name, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      element.setAttribute(name, value === true ? '' : String(value));
    }
  }
  if (on) {
    for (const [type, listener] of Object.entries(on)) {
      element.addEventListener(type, listener as EventListener);
    }
  }
  append(element, children);
  return element;
}

export function append(parent: Element, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child);
  }
}

export function replace(parent: Element, ...children: Child[]): void {
  parent.replaceChildren();
  append(parent, children);
}

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
