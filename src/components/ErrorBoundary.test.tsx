import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary';

describe('ErrorBoundary', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    container.remove();
    vi.restoreAllMocks();
  });

  it('renders a fallback when child throws', async () => {
    function Boom(): ReactElement {
      throw new Error('boom');
    }

    root = createRoot(container);
    await act(async () => {
      root?.render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      );
    });

    expect(container.textContent).toContain('刷新页面');
  });

  it('supports resetting via a render fallback', async () => {
    let shouldThrow = true;

    function MaybeBoom() {
      if (shouldThrow) throw new Error('boom');
      return <div>ok</div>;
    }

    root = createRoot(container);
    await act(async () => {
      root?.render(
        <ErrorBoundary
          fallback={({ reset }) => (
            <button
              type="button"
              onClick={() => {
                shouldThrow = false;
                reset();
              }}
            >
              reset
            </button>
          )}
        >
          <MaybeBoom />
        </ErrorBoundary>,
      );
    });

    const resetButton = container.querySelector('button') as HTMLButtonElement | null;
    expect(resetButton).toBeTruthy();

    await act(async () => {
      resetButton!.click();
    });

    expect(container.textContent).toContain('ok');
  });
});
