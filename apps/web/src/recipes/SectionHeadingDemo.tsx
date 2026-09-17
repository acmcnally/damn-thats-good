/**
 * Looping demo for a help tooltip: types out "For the sauce:" and, the instant the
 * colon lands, snaps the line into the app's real section-heading style (matching
 * `.eheading` in TokenizedField.module.css — same accent color/underline a real
 * heading gets). Pure CSS (a `steps()` width reveal), no JS timer — see the module
 * CSS for the keyframe breakdown. Shared by the Ingredients and Steps help
 * tooltips, since sectioning works the same in both fields.
 */

import styles from './SectionHeadingDemo.module.css';

export function SectionHeadingDemo() {
  return (
    <div className={styles.demo} aria-hidden="true">
      <span className={styles.text}>For the sauce:</span>
    </div>
  );
}
