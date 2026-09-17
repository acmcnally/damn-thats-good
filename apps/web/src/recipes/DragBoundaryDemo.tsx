/**
 * Looping demo for the Ingredients help tooltip: "2 tbsp olive oil" with the
 * recognized-quantity highlight sliding between "2 tbsp" and "2 tbsp olive", handle
 * bar in tow — the same handle styling (`TokenizedField.module.css`) the real
 * IngredientsField drags. Pure CSS: two copies of the text stacked (see the module
 * CSS), the top one clipped to reveal only its highlighted portion, so both the
 * background/color highlight and the handle move in lockstep without touching the
 * DOM per frame.
 */

import styles from './DragBoundaryDemo.module.css';
import tokenizedStyles from './TokenizedField.module.css';

const TEXT = '2 tbsp olive oil';

export function DragBoundaryDemo() {
  return (
    <div className={styles.line} aria-hidden="true">
      <span className={styles.base}>{TEXT}</span>
      <span className={styles.highlight}>{TEXT}</span>
      <span className={`${tokenizedStyles.handle} ${styles.handle}`} />
    </div>
  );
}
