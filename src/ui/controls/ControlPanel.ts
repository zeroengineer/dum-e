import type { ControlSpec, ControlValue, Environment } from '../../core/scene/Environment';
import { h, replace } from '../dom';

let nextId = 0;

const formatNumber = (value: number, step: number): string => {
  if (step >= 1) return Math.round(value).toLocaleString('en-US');
  return value.toFixed(step >= 0.1 ? 1 : 2);
};

/** One labelled input for a ControlSpec. Returns the row and a way to refresh its value. */
export function createControl(
  spec: ControlSpec,
  onChange: (value: ControlValue) => void,
): { row: HTMLElement; update(spec: ControlSpec): void } {
  const id = `control-${nextId++}`;

  if (spec.kind === 'button') {
    const button = h(
      'button',
      { class: 'btn btn--quiet', type: 'button', on: { click: () => onChange(undefined) } },
      spec.label,
    );
    return { row: button, update: () => {} };
  }

  if (spec.kind === 'range') {
    const output = h(
      'output',
      { class: 'field__value', attrs: { for: id } },
      formatNumber(spec.value, spec.step),
    );
    const input = h('input', {
      id,
      type: 'range',
      min: String(spec.min),
      max: String(spec.max),
      step: String(spec.step),
      value: String(spec.value),
      on: {
        input: () => {
          output.textContent = formatNumber(input.valueAsNumber, spec.step);
          onChange(input.valueAsNumber);
        },
      },
    });
    const row = h(
      'div',
      { class: 'field field--range' },
      h('label', { htmlFor: id }, spec.label),
      output,
      input,
    );
    return {
      row,
      update: (next) => {
        // Never fight the user's drag.
        if (next.kind !== 'range' || document.activeElement === input) return;
        input.value = String(next.value);
        output.textContent = formatNumber(next.value, next.step);
      },
    };
  }

  if (spec.kind === 'select') {
    const select = h('select', { id, on: { change: () => onChange(select.value) } });
    const fill = (next: Extract<ControlSpec, { kind: 'select' }>): void => {
      replace(select, ...next.options.map((o) => h('option', { value: o.value }, o.label)));
      select.value = next.value;
    };
    fill(spec);
    return {
      row: h('div', { class: 'field' }, h('label', { htmlFor: id }, spec.label), select),
      update: (next) => {
        if (next.kind !== 'select') return;
        if (next.options.length !== select.options.length) fill(next);
        else select.value = next.value;
      },
    };
  }

  if (spec.kind === 'toggle') {
    const input = h('input', {
      id,
      type: 'checkbox',
      checked: spec.value,
      on: { change: () => onChange(input.checked) },
    });
    return {
      row: h(
        'div',
        { class: 'field field--toggle' },
        h('label', { htmlFor: id }, spec.label),
        input,
      ),
      update: (next) => {
        if (next.kind === 'toggle') input.checked = next.value;
      },
    };
  }

  const input = h('input', {
    id,
    type: 'color',
    value: spec.value,
    on: { input: () => onChange(input.value) },
  });
  return {
    row: h('div', { class: 'field field--color' }, h('label', { htmlFor: id }, spec.label), input),
    update: (next) => {
      if (next.kind === 'color' && document.activeElement !== input) input.value = next.value;
    },
  };
}

/**
 * Sliders and buttons for whatever environment is active, built from its declarative
 * `getControls()`. This is the non-gesture way to do everything a gesture can.
 */
export class ControlPanel {
  readonly element = h('div', { class: 'controls' });
  private updaters = new Map<string, (spec: ControlSpec) => void>();
  private unsubscribe: (() => void) | null = null;

  setEnvironment(environment: Environment | null): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.updaters.clear();
    if (!environment) {
      replace(this.element);
      return;
    }
    const fields = h('div', { class: 'controls__fields' });
    const buttons = h('div', { class: 'controls__buttons' });
    for (const spec of environment.getControls()) {
      const control = createControl(spec, (value) => environment.setControl(spec.id, value));
      this.updaters.set(spec.id, control.update);
      (spec.kind === 'button' ? buttons : fields).append(control.row);
    }
    replace(this.element, fields, buttons);
    // A swipe or a reset changes values from inside the environment; reflect that here.
    this.unsubscribe = environment.onControlsChanged(() => {
      for (const spec of environment.getControls()) this.updaters.get(spec.id)?.(spec);
    });
  }
}
