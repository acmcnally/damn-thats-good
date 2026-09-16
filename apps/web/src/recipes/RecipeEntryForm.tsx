/**
 * Manual recipe entry/edit form (DAMN-2) — the chosen mockup direction
 * (entry-option-2-live-inline.html): live inline tokenization, tokenized tag chips,
 * free-text servings/provenance. Shared between the create and edit routes; the
 * two differ only in what happens on submit (`POST` vs `PATCH` + `PUT .../content`).
 */

import {
  type IngredientOrHeadingLine,
  ingredientOrHeadingLineToRawText,
  parseNewIngredientOrHeadingLine,
  parseNewStepOrHeadingLine,
  type RecipeDetail,
  reconcileLines,
  type StepOrHeadingLine,
  stepOrHeadingLineToRawText,
} from '@dtg/shared';
import { type FormEvent, useState } from 'react';

import { ApiError, createRecipe, saveRecipeContent, updateRecipeMetadata } from './api';
import { IngredientsField } from './IngredientsField';
import styles from './RecipeEntryForm.module.css';
import { StepsField } from './StepsField';
import { TagsEditor } from './TagsEditor';

interface RecipeEntryFormProps {
  initial?: RecipeDetail;
  getAccessToken: () => Promise<string>;
  onSaved: (detail: RecipeDetail) => void;
  onCancel: () => void;
}

export function RecipeEntryForm({
  initial,
  getAccessToken,
  onSaved,
  onCancel,
}: RecipeEntryFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [servings, setServings] = useState(initial?.servings ?? '');
  const [provenance, setProvenance] = useState(initial?.provenance ?? '');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);

  const [ingredientLines, setIngredientLines] = useState<IngredientOrHeadingLine[]>(
    initial?.content.ingredients ?? [],
  );
  const [stepLines, setStepLines] = useState<StepOrHeadingLine[]>(initial?.content.steps ?? []);
  const [ingredientsText, setIngredientsText] = useState(
    ingredientLines.map(ingredientOrHeadingLineToRawText).join('\n'),
  );
  const [stepsText, setStepsText] = useState(stepLines.map(stepOrHeadingLineToRawText).join('\n'));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  function reconcileIngredients(text: string): IngredientOrHeadingLine[] {
    const reconciled = reconcileLines(
      ingredientLines,
      text.split('\n'),
      ingredientOrHeadingLineToRawText,
      parseNewIngredientOrHeadingLine,
    );
    setIngredientLines(reconciled);
    return reconciled;
  }

  function reconcileSteps(text: string): StepOrHeadingLine[] {
    const reconciled = reconcileLines(
      stepLines,
      text.split('\n'),
      stepOrHeadingLineToRawText,
      parseNewStepOrHeadingLine,
    );
    setStepLines(reconciled);
    return reconciled;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    setConflict(false);

    // Force a final reconcile in case the field never lost focus before Save.
    const finalIngredients = reconcileIngredients(ingredientsText);
    const finalSteps = reconcileSteps(stepsText);
    const content = { ingredients: finalIngredients, steps: finalSteps };

    try {
      if (!initial) {
        const created = await createRecipe(getAccessToken, {
          name: name.trim(),
          servings: servings.trim() || undefined,
          provenance: provenance.trim() || undefined,
          tags,
          content,
        });
        onSaved(created);
        return;
      }

      await updateRecipeMetadata(getAccessToken, initial.id, {
        expectedUpdtCnt: initial.updateCnt,
        name: name.trim(),
        servings: servings.trim() || undefined,
        provenance: provenance.trim() || undefined,
        tags,
      });
      const withContent = await saveRecipeContent(
        getAccessToken,
        initial.id,
        initial.currentVersionId,
        content,
      );
      onSaved(withContent);
    } catch (err) {
      if (err instanceof ApiError && err.status === 412) {
        setConflict(true);
      } else {
        setError('Something went wrong saving this recipe. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {conflict && (
        <div className={styles.conflictBanner} role="alert">
          This recipe changed elsewhere while you were editing. Your edits below are still here, but
          saving again would conflict.
          <button type="button" onClick={() => window.location.reload()}>
            Discard my changes and reload the latest version
          </button>
        </div>
      )}
      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}

      <div className={styles.editbar}>
        <div className={styles.metaColumn}>
          <input
            className={`${styles.editable} ${styles.nameInput}`}
            placeholder="Recipe name"
            aria-label="Recipe name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className={styles.metaGrid}>
            <div className={styles.metaField}>
              <span className={styles.fieldLabel}>Servings</span>
              <input
                className={`${styles.editable} ${styles.servingsInput}`}
                placeholder="e.g. Serves 4"
                aria-label="Servings"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
              />
            </div>
            <div className={styles.tagsField}>
              <span className={styles.fieldLabel}>Tags</span>
              <TagsEditor tags={tags} onChange={setTags} getAccessToken={getAccessToken} />
            </div>
          </div>
          <div className={styles.provenanceField}>
            <span className={styles.fieldLabel}>Provenance</span>
            <input
              className={`${styles.editable} ${styles.provenanceInput}`}
              placeholder="Where's this from? A book, a person, a link…"
              aria-label="Provenance"
              value={provenance}
              onChange={(e) => setProvenance(e.target.value)}
            />
          </div>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.btnGhost} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className={styles.btnPrimary} disabled={saving}>
            {saving ? 'Saving…' : 'Save recipe'}
          </button>
        </div>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>Ingredients</h2>
          <p className={styles.hint}>
            Works best as quantity, unit, then ingredient — like &quot;2 tbsp olive oil&quot;. Drag
            a highlight&apos;s edge to correct a wrong split.
          </p>
        </div>
        <div className={styles.panelBody}>
          <IngredientsField
            value={ingredientsText}
            onChange={setIngredientsText}
            onFieldBlur={(text) => reconcileIngredients(text)}
          />
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>Steps</h2>
          <p className={styles.hint}>
            One step per line. Numbered (&quot;1.&quot;) and bulleted (&quot;-&quot;) lists continue
            automatically on Enter.
          </p>
        </div>
        <div className={styles.panelBody}>
          <StepsField
            value={stepsText}
            onChange={setStepsText}
            onFieldBlur={(text) => reconcileSteps(text)}
          />
        </div>
      </section>
    </form>
  );
}
