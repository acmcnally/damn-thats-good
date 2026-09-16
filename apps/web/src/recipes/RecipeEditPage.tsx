import type { RecipeDetail } from '@dtg/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { useShellContext } from '../shell/shellContext';
import { getRecipe } from './api';
import styles from './RecipeDetailPage.module.css';
import { RecipeEntryForm } from './RecipeEntryForm';

type LoadState =
  { status: 'loading' } | { status: 'error' } | { status: 'ok'; recipe: RecipeDetail };

export function RecipeEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getAccessToken } = useShellContext();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getRecipe(getAccessToken, id)
      .then((recipe) => {
        if (!cancelled) setState({ status: 'ok', recipe });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [id, getAccessToken]);

  if (state.status === 'loading') return <p className={styles.lead}>Loading…</p>;
  if (state.status === 'error' || !id) {
    return <p className={styles.lead}>Couldn&apos;t load this recipe.</p>;
  }

  return (
    <RecipeEntryForm
      initial={state.recipe}
      getAccessToken={getAccessToken}
      onSaved={(recipe) => navigate(`/recipes/${recipe.id}`)}
      onCancel={() => navigate(`/recipes/${id}`)}
    />
  );
}
