/**
 * Splash — the unauthenticated landing at `/`. Centered wordmark + a "Log in"
 * button that kicks off the hosted AuthKit flow. Frozen-scope requirement (the
 * issue's "Unauthenticated: splash screen"). On any other path, `AuthGate`
 * redirects straight through `signIn()` instead of showing this.
 */

import styles from './fullscreen.module.css';

interface SplashProps {
  onLogIn: () => void;
}

export function Splash({ onLogIn }: SplashProps) {
  return (
    <div className={styles.screen}>
      <div className={styles.splashBar}>
        <button type="button" className={styles.loginButton} onClick={onLogIn}>
          Log in
        </button>
      </div>
      <div className={styles.splashBody}>
        <h1 className={`${styles.wordmark} ${styles.wordmarkLarge}`}>Damn That&rsquo;s Good</h1>
      </div>
    </div>
  );
}
