/**
 * Route table.
 *
 * `react-router` v8 Data Mode: a plain route-config array feeds
 * `createBrowserRouter` here and `createMemoryRouter` in component tests (imported
 * unmassaged). `RouterProvider` is the `react-router/dom` one (see main.tsx).
 *
 *   <AuthGate>              pathless layout — auth gate; <Outlet/> when authed
 *     <AppShell>            pathless layout — persistent frame; mounts once
 *       index               → <Home>
 *       recipes             → <RecipesPage>
 *       recipes/new         → <RecipeNewPage>
 *       recipes/:id         → <RecipeDetailPage>
 *       recipes/:id/edit    → <RecipeEditPage>
 *       …
 *   login     → <LoginRedirect>   outside AuthGate — signIn() on mount
 *   callback  → <AuthCallback>    outside AuthGate — inert; never navigates
 *   *         → <Navigate to="/"> outside AuthGate — logged-out unknown path → Splash
 */

import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';

import { AuthGate } from './auth/AuthGate';
import { LoginRedirect } from './auth/LoginRedirect';
import { RecipeDetailPage } from './recipes/RecipeDetailPage';
import { RecipeEditPage } from './recipes/RecipeEditPage';
import { RecipeNewPage } from './recipes/RecipeNewPage';
import { RecipesPage } from './recipes/RecipesPage';
import { AuthCallback } from './routes/AuthCallback';
import { DataPage } from './routes/DataPage';
import { Home } from './routes/Home';
import { ProfilePage } from './routes/ProfilePage';
import { ShoppingListsPage } from './routes/ShoppingListsPage';
import { AppShell } from './shell/AppShell';

export const routes: RouteObject[] = [
  {
    element: <AuthGate />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Home /> },
          { path: 'recipes', element: <RecipesPage /> },
          { path: 'recipes/new', element: <RecipeNewPage /> },
          { path: 'recipes/:id', element: <RecipeDetailPage /> },
          { path: 'recipes/:id/edit', element: <RecipeEditPage /> },
          { path: 'shopping-lists', element: <ShoppingListsPage /> },
          { path: 'data', element: <DataPage /> },
          { path: 'profile', element: <ProfilePage /> },
        ],
      },
    ],
  },
  { path: 'login', element: <LoginRedirect /> },
  { path: 'callback', element: <AuthCallback /> },
  { path: '*', element: <Navigate to="/" replace /> },
];

export const router = createBrowserRouter(routes);
