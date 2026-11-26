import type { InjectionKey } from 'vue';

/**
 * Schachteltiefe der Unterformulare (Issue #25). Jedes SubFormWidget
 * erhöht sie um eins; bei `maxDepth` bricht die Schachtelung ab, damit
 * ein rekursives Modell — ein Ordner, der Ordner enthält — nicht endlos
 * rendert.
 */
export const SUBFORM_DEPTH_KEY: InjectionKey<number> = Symbol('uimodel:subFormDepth');
