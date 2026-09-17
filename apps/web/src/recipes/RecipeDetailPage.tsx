import type { RecipeDetail } from '@dtg/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { Linkify } from '../components/Linkify';
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
    setConfirmingDelete(false);
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteRecipe(getAccessToken, recipe.id);
      navigate('/recipes');
    } catch {
      setDeleting(false);
      setDeleteError('Something went wrong deleting this recipe. Please try again.');
    }
  }

  return (
    <div className={styles.page}>
      {deleteError && (
        <div className={styles.errorBanner} role="alert">
          {deleteError}
        </div>
      )}
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
            onClick={() => setConfirmingDelete(true)}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this recipe?"
        description={`"${recipe.name}" and its version history will be permanently deleted. This can't be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />

      {recipe.provenance && (
        <p className={styles.provenance}>
          <Linkify text={recipe.provenance} />
        </p>
      )}

      <section className={styles.section}>
        <h2>Ingredients</h2>
        {recipe.content.ingredients.every((line) => line.kind === 'blank') ? (
          <p className={styles.lead}>No ingredients yet.</p>
        ) : (
          <ul className={styles.ingredientList}>
            {recipe.content.ingredients
              // Blank lines are spacing for the edit textarea, not list content.
              .filter((line) => line.kind !== 'blank')
              .map((line) =>
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
        {recipe.content.steps.every((line) => line.kind === 'blank') ? (
          <p className={styles.lead}>No steps yet.</p>
        ) : (
          <ul className={styles.stepList}>
            {recipe.content.steps
              // Blank lines are spacing for the edit textarea, not list content.
              .filter((line) => line.kind !== 'blank')
              .map((line) =>
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
