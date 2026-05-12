## Problèmes identifiés

### 1. Shot clock ne redémarre pas automatiquement à chaque panier
- Dans `src/store/match.ts`, `autoResetShotClockOnScore` est à `false` par défaut.
- Même quand activé, le code remet la valeur à 24 mais ne relance pas (`isRunning` inchangé) ni ne synchronise avec le chrono principal.

### 2. Le bouton "Reprendre" après fin de période ne passe PAS au quart/mi-temps suivant
- Dans `src/routes/match.tsx` (ligne 471), "Reprendre" fait seulement `setInterPeriod(false)`.
- `handleEndOfPeriod` (l. 104) ouvre l'overlay mais n'appelle jamais `nextPeriod()`.
- Résultat : à la reprise, on reste sur Q1 avec chrono à 0, impossible de jouer.

## Corrections

### `src/store/match.ts`
- `DEFAULT_SETTINGS.autoResetShotClockOnScore` → `true` (comportement attendu basket).
- `addScore` : quand `autoResetShotClockOnScore && points > 0`, remettre `value: 24` ET `isRunning: timer.isRunning` (relance auto si chrono tourne, en respectant `shotClockSync`).
- `migrate` v3 : forcer `autoResetShotClockOnScore: true` pour les utilisateurs existants (optionnel, sinon laisser leur réglage).

### `src/routes/match.tsx`
- Bouton "Reprendre" (overlay inter-période) :
  - Si `period < totalPeriods` → appeler `nextPeriod()` (qui réinitialise le chrono à `totalSeconds` et shot clock à 24) avant `setInterPeriod(false)`.
  - Sinon → `handleEndMatch()`.
- `handleEndOfPeriod` : ne plus rien changer côté logique période ; juste buzzer + flash + ouvrir overlay (la transition se fait au "Reprendre").
- Bouton du bas "Qx →" : conserver, mais utiliser la même logique unifiée (helper `goNextPeriod`).

### Hors scope
- Pas de changement UI (mêmes overlays, mêmes boutons, mêmes labels).
- Pas de modification du SSR/SPA, du PWA, ni des autres réglages.

## Résultat attendu
- À chaque panier marqué : la shot clock revient à 24 et redémarre automatiquement si le chrono tourne.
- Quand le chrono atteint 0 : buzzer + overlay "Reprendre". Au clic sur "Reprendre" → période suivante chargée, chrono plein, shot clock 24, prêt à reprendre.
- En dernière période : "Reprendre" termine le match (résumé).
