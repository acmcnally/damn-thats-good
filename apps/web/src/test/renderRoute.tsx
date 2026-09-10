/**
 * Shared harness for the shell/auth component tests: builds a
 * `createMemoryRouter` over the real route config and wraps it in
 * `AppearanceProvider` (the shell reads `useAppearance()`). Not a test file — the
 * `*.component.test` glob skips it.
 */

import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { AppearanceProvider } from '../appearance/AppearanceProvider';
import type { AppearancePref } from '../appearance/types';
import { routes } from '../router';

interface Options {
  initialEntries?: string[];
  appearance?: { remoteValue?: AppearancePref };
}

type RouteRender = RenderResult & { router: ReturnType<typeof createMemoryRouter> };

export function renderRoute({ initialEntries = ['/'], appearance }: Options = {}): RouteRender {
  const router = createMemoryRouter(routes, { initialEntries });
  const result = render(
    <AppearanceProvider remoteValue={appearance?.remoteValue}>
      <RouterProvider router={router} />
    </AppearanceProvider>,
  );
  return Object.assign(result, { router });
}

export function renderElement(ui: ReactElement): RenderResult {
  return render(<AppearanceProvider>{ui}</AppearanceProvider>);
}
