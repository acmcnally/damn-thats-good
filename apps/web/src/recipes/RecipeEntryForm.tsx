/**
 * Manual recipe entry/edit form — the chosen recipe-entry mockup direction
 * (entry-option-2-live-inline.html): live inline tokenization, tokenized tag chips,
 * free-text servings/provenance. Shared between the create and edit routes; the
 * two differ only in what happens on submit (`POST` vs `PATCH` + `PUT .../content`).
 */

import {
  getWords,
  type IngredientOrHeadingLine,
  ingredientOrHeadingLineToRawText,
  parseNewIngredientOrHeadingLine,
  parseNewStepOrHeadingLine,
  type RecipeDetail,
  reconcileLines,
  splitAtBoundary,
  type StepOrHeadingLine,
  stepOrHeadingLineToRawText,
} from '@dtg/shared';
import { type FormEvent, useState } from 'react';

import { HelpTooltip } from '../components/HelpTooltip';
import { MOBILE_MEDIA_QUERY } from '../shell/breakpoints';
import { useMediaQuery } from '../shell/useMediaQuery';
import { ApiError, createRecipe, saveRecipeContent, updateRecipeMetadata } from './api';
import { DragBoundaryDemo } from './DragBoundaryDemo';
import { IngredientsField } from './IngredientsField';
import styles from './RecipeEntryForm.module.css';
import { SectionHeadingDemo } from './SectionHeadingDemo';
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
  // On mobile, Cancel/Save move to a fixed bar (below) instead of sitting at
  // the top of a form that can run well past one screen's height.
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);
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
  // Per-line drag corrections, keyed by the line's own raw text (see
  // IngredientsField's module comment for why not index) — owned here, not
  // inside IngredientsField, because a confirmed boundary needs to be baked
  // into the saved quantity/item at blur/submit time, not just live-highlighted.
  // Seeded from any previously confirmed lines so reopening a saved recipe
  // doesn't fall back to re-auto-detecting a boundary the user already
  // corrected by hand.
  const [ingredientOverrides, setIngredientOverrides] = useState<Record<string, number>>(() => {
    const seeded: Record<string, number> = {};
    for (const line of initial?.content.ingredients ?? []) {
      if (line.kind === 'ingredient' && line.parseStatus === 'confirmed') {
        seeded[line.raw] = getWords(line.quantity).length;
      }
    }
    return seeded;
  });

  // Tracks the server's current optimistic-concurrency counter/version across
  // saves — refreshed after each successful write so a retry after a partial
  // failure (metadata patched, content save then failed) doesn't send a stale
  // value and 412 against itself.
  const [expectedUpdtCnt, setExpectedUpdtCnt] = useState(initial?.updateCnt ?? 0);
  const [baseVersionId, setBaseVersionId] = useState(initial?.currentVersionId ?? '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<'metadata' | 'content' | null>(null);

  function reconcileIngredients(text: string): IngredientOrHeadingLine[] {
    const reconciled = reconcileLines(
      ingredientLines,
      text.split('\n'),
      ingredientOrHeadingLineToRawText,
      parseNewIngredientOrHeadingLine,
    );

    // Bake a still-live override into the line it belongs to. Keyed by raw
    // text, so this is correct whether the line was matched to a previous one
    // or freshly parsed — an override for text that's no longer anywhere in
    // the content (edited away, or the line deleted) simply never matches
    // anything, which is exactly "an edit to raw discards a prior manual
    // confirmation" (decision #2) with no separate invalidation step needed.
    const withOverrides = reconciled.map((line) => {
      if (line.kind !== 'ingredient') return line;
      const override = ingredientOverrides[line.raw];
      if (override == null) return line;
      const { quantity, item } = splitAtBoundary(line.raw, override);
      return { ...line, quantity, item, parseStatus: 'confirmed' as const };
    });

    setIngredientLines(withOverrides);
    return withOverrides;
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
    setSaving(true);
    setError(null);
    setConflict(null);

    // Force a final reconcile in case the field never lost focus before Save.
    const finalIngredients = reconcileIngredients(ingredientsText);
    const finalSteps = reconcileSteps(stepsText);
    const content = { ingredients: finalIngredients, steps: finalSteps };

    // Always the trimmed value, never omitted for a blank field — omitting it
    // (via `|| undefined`) told the server "leave this field alone," so clearing
    // Servings/Provenance to empty and saving silently kept the old value.
    const metadataFields = {
      name: name.trim(),
      servings: servings.trim(),
      provenance: provenance.trim(),
      tags,
    };

    try {
      if (!initial) {
        const created = await createRecipe(getAccessToken, { ...metadataFields, content });
        onSaved(created);
        return;
      }

      try {
        const patched = await updateRecipeMetadata(getAccessToken, initial.id, {
          expectedUpdtCnt,
          ...metadataFields,
        });
        // Adopt the server's new counter immediately — if the content save
        // below fails, a retry must use this value, not the one this render
        // started with, or it 412s against a save that already succeeded.
        setExpectedUpdtCnt(patched.updateCnt);
      } catch (err) {
        if (err instanceof ApiError && err.status === 412) {
          setConflict('metadata');
          return;
        }
        throw err;
      }

      // Reaching here means the metadata patch above committed — a 412 from
      // this point on is reported as a content conflict, not a metadata one.
      const withContent = await saveRecipeContent(
        getAccessToken,
        initial.id,
        baseVersionId,
        content,
      );
      setBaseVersionId(withContent.currentVersionId);
      onSaved(withContent);
    } catch (err) {
      if (err instanceof ApiError && err.status === 412) {
        setConflict('content');
      } else {
        setError('Something went wrong saving this recipe. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  // Shared between the inline (.actions) and fixed mobile (.mobileActionBar)
  // placements below — exactly one renders, based on `isMobile`.
  const actionButtons = (
    <>
      <button type="button" className={styles.btnGhost} onClick={onCancel}>
        Cancel
      </button>
      <button type="submit" className={styles.btnPrimary} disabled={saving || !name.trim()}>
        {saving ? 'Saving…' : 'Save Recipe'}
      </button>
    </>
  );

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {conflict && (
        <div className={styles.conflictBanner} role="alert">
          {conflict === 'content'
            ? "This recipe's ingredients or steps changed elsewhere while you were saving. Your name/servings/provenance/tag changes were already saved; your ingredient and step edits below were not."
            : 'This recipe changed elsewhere while you were editing. Nothing from this save went through yet — your edits below are still here.'}
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
        {!isMobile && <div className={styles.actions}>{actionButtons}</div>}
      </div>

      {isMobile && <div className={styles.mobileActionBar}>{actionButtons}</div>}

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>Ingredients</h2>
          <HelpTooltip label="Ingredients help">
            <p className={styles.helpText}>
              Type quantity, unit, then ingredient — like &quot;2 tbsp olive oil&quot;. The
              recognized quantity is highlighted; drag its edge if it split the line in the wrong
              place:
            </p>
            <DragBoundaryDemo />
            <p className={styles.helpText}>
              End a line with a colon to turn it into a section heading:
            </p>
            <SectionHeadingDemo />
          </HelpTooltip>
        </div>
        <div className={styles.panelBody}>
          <IngredientsField
            value={ingredientsText}
            onChange={setIngredientsText}
            onFieldBlur={(text) => reconcileIngredients(text)}
            overrides={ingredientOverrides}
            onOverridesChange={setIngredientOverrides}
          />
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>Steps</h2>
          <HelpTooltip label="Steps help">
            <p className={styles.helpText}>
              End a line with a colon to turn it into a section heading:
            </p>
            <SectionHeadingDemo />
            <p className={styles.helpText}>
              Numbered (&quot;1.&quot;) and bulleted (&quot;-&quot;) lists continue automatically
              when you press Enter.
            </p>
          </HelpTooltip>
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
