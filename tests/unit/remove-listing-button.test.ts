import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The archive button's idle vs in-flight states.
 *
 * No jsdom or testing-library in this project, and neither is needed: the
 * component's whole job is to branch on useFormStatus().pending, so stubbing
 * that hook and calling the component as a plain function exercises the real
 * logic and lets us read the returned element tree. Same technique as
 * tests/unit/feature-flag-hooks.test.ts.
 */

const pending = vi.fn(() => ({ pending: false }));
vi.mock('react-dom', () => ({ useFormStatus: () => pending() }));

const { RemoveListingButton } = await import(
  '@/app/(dashboard)/dashboard/listings/[id]/delete/remove-button'
);

/** Flatten a rendered element's children down to their text content. */
function textOf(node: any): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return textOf(node.props?.children);
}

const render = () => (RemoveListingButton as unknown as () => any)();

afterEach(() => pending.mockReturnValue({ pending: false }));

describe('RemoveListingButton — idle', () => {
  it('offers the action and stays clickable', () => {
    const el = render();
    expect(textOf(el)).toContain('Yes, remove it');
    expect(el.props.disabled).toBe(false);
    expect(el.props['aria-busy']).toBe(false);
    expect(el.props.type).toBe('submit');
  });

  it('carries a touch-visible pressed state', () => {
    // :hover never fires on a tap, so without active: the button looks dead —
    // the reported symptom.
    expect(render().props.className).toContain('active:bg-red-100');
  });
});

describe('RemoveListingButton — submitting', () => {
  it('says what it is doing instead of looking inert', () => {
    pending.mockReturnValue({ pending: true });
    const el = render();
    expect(textOf(el)).toContain('Removing');
    expect(textOf(el)).not.toContain('Yes, remove it');
  });

  it('disables itself so repeat taps cannot double-submit', () => {
    pending.mockReturnValue({ pending: true });
    const el = render();
    expect(el.props.disabled).toBe(true);
    expect(el.props['aria-busy']).toBe(true);
  });

  it('swaps the warning icon for a spinner', () => {
    pending.mockReturnValue({ pending: true });
    const icon = render().props.children[0];
    expect(icon.props.className).toContain('animate-spin');
  });
});
