import type { RecipeDetail } from '@dtg/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { useShellContext } from '../shell/shellContext';
import { deleteRecipe, getRecipe } from './api';
import styles from './RecipeDetailPage.module.css';

type DetailState =
  { status: 'loading' } | { status: 'error' } | { status: 'ok'; recipe: RecipeDetail };

export function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getAccessToken } = useShellContext();
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const [deleting, setDeleting] = useState(false);

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

  const { recipe } = state;

  async function handleDelete() {
    if (!window.confirm(`Delete "${recipe.name}"? This can't be undone.`)) return;
    setDeleting(true);
    try {
      await deleteRecipe(getAccessToken, recipe.id);
      navigate('/recipes');
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{recipe.name}</h1>
          {recipe.servings && <p className={styles.servings}>{recipe.servings}</p>}
          {recipe.tags.length > 0 && (
            <div className={styles.tags}>
              {recipe.tags.map((tag) => (
                <span key={tag} className={styles.tag}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className={styles.actions}>
          <Link to={`/recipes/${recipe.id}/edit`} className={styles.btnGhost}>
            Edit
          </Link>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>

      {recipe.provenance && <p className={styles.provenance}>{recipe.provenance}</p>}

      <section className={styles.section}>
        <h2>Ingredients</h2>
        {recipe.content.ingredients.length === 0 ? (
          <p className={styles.lead}>No ingredients yet.</p>
        ) : (
          <ul className={styles.ingredientList}>
            {recipe.content.ingredients.map((line) =>
              line.kind === 'heading' ? (
                <li key={line.id} className={styles.heading}>
                  {line.text}
                </li>
              ) : (
                <li key={line.id}>
                  {line.quantity && <strong>{line.quantity} </strong>}
                  {line.item}
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h2>Steps</h2>
        {recipe.content.steps.length === 0 ? (
          <p className={styles.lead}>No steps yet.</p>
        ) : (
          <ul className={styles.stepList}>
            {recipe.content.steps.map((line) =>
              line.kind === 'heading' ? (
                <li key={line.id} className={styles.heading}>
                  {line.text}
                </li>
              ) : (
                // Numbered/bulleted markers are literal characters in `text` (decision
                // #4) — no list-style numbering here, or the browser's own numbering
                // would double up with whatever the user typed ("1." next to "1.").
                <li key={line.id} className={styles.step}>
                  {line.text}
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
