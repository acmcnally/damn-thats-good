import type { RecipeSummary } from '@dtg/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { useShellContext } from '../shell/shellContext';
import { listRecipes } from './api';
import styles from './RecipesPage.module.css';

type ListState =
  { status: 'loading' } | { status: 'error' } | { status: 'ok'; recipes: RecipeSummary[] };

export function RecipesPage() {
  const { getAccessToken } = useShellContext();
  const [state, setState] = useState<ListState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    listRecipes(getAccessToken)
      .then((recipes) => {
        if (!cancelled) setState({ status: 'ok', recipes });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [getAccessToken]);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Recipes</h1>

      {state.status === 'loading' && <p className={styles.lead}>Loading…</p>}
      {state.status === 'error' && (
        <p className={styles.lead}>Couldn&apos;t load your recipes. Try refreshing.</p>
      )}
      {state.status === 'ok' && state.recipes.length === 0 && (
        <p className={styles.lead}>No recipes yet — create your first one.</p>
      )}
      {state.status === 'ok' && state.recipes.length > 0 && (
        <div className={styles.grid}>
          {state.recipes.map((recipe) => (
            <Link key={recipe.id} to={`/recipes/${recipe.id}`} className={styles.card}>
              <h2>{recipe.name}</h2>
              {(recipe.servings || recipe.tags.length > 0) && (
                <div className={styles.meta}>
                  {recipe.servings && <span className={styles.servings}>{recipe.servings}</span>}
                  {recipe.tags.map((tag) => (
                    <span key={tag} className={styles.tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
