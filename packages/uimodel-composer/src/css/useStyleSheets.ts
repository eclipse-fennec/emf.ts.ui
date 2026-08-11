/**
 * Reaktive Anbindung von StyleSheet-Modellen an den DOM.
 *
 * useStyleSheetCss   — beobachtet die Sheets per EContentAdapter und
 *                      liefert das generierte CSS als computed.
 * useStyleSheetInjection — hält zusätzlich ein <style>-Element im
 *                      document.head aktuell (SSR-sicher: no-op ohne DOM).
 */
import {
  computed,
  onScopeDispose,
  ref,
  toValue,
  watch,
  watchEffect,
  type ComputedRef,
  type InjectionKey,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue';
import { EContentAdapter, type EObject, type Notification } from '@emfts/core';
import type { StyleSheet } from '../generated/css/StyleSheet';
import { generateCssForSheets } from './cssEngine';

export interface StyleSheetContext {
  sheets: Ref<readonly StyleSheet[]>;
  /** Wird bei jeder Modelländerung inkrementiert (für abhängige computeds). */
  version: Ref<number>;
}

/** Injection-Key, über den UIModelComposer die aktiven Sheets bereitstellt. */
export const STYLE_SHEETS_KEY: InjectionKey<StyleSheetContext> = Symbol('uimodel-css:sheets');

let styleElementCounter = 0;

/** Beobachtet StyleSheets und liefert das generierte CSS reaktiv. */
export function useStyleSheetCss(
  sheets: MaybeRefOrGetter<readonly StyleSheet[]>
): { css: ComputedRef<string>; version: Ref<number> } {
  const version = ref(0);

  class SheetAdapter extends EContentAdapter {
    notifyChanged(notification: Notification): void {
      try {
        super.notifyChanged(notification);
      } catch {
        // SET mit Plain-Array (Editor-Commands auf generierten Impls):
        // die automatische Kind-Adaption des EContentAdapter erwartet
        // ELists — neue Kinder werden unten per attachTree nachadaptiert.
      }
      if (notification.isTouch?.()) return;
      version.value++;
      for (const sheet of attached) attachTree(sheet);
    }
  }
  const adapter = new SheetAdapter();
  let attached: EObject[] = [];

  type Notifier = {
    eAdapterAdd?(a: EContentAdapter): void;
    eAdapterRemove?(a: EContentAdapter): boolean;
    eAdapters(): EContentAdapter[];
  };

  function attachOne(obj: EObject): void {
    const notifier = obj as unknown as Notifier;
    if (!notifier.eAdapters().includes(adapter)) {
      if (notifier.eAdapterAdd) notifier.eAdapterAdd(adapter);
      else notifier.eAdapters().push(adapter);
    }
  }

  /** Adapter idempotent an das Objekt und alle Nachfahren hängen. */
  function attachTree(root: EObject): void {
    attachOne(root);
    for (const child of root.eAllContents()) attachOne(child);
  }

  function detachOne(obj: EObject): void {
    const notifier = obj as unknown as Notifier;
    if (notifier.eAdapterRemove) {
      notifier.eAdapterRemove(adapter);
    } else {
      const adapters = notifier.eAdapters();
      const i = adapters.indexOf(adapter);
      if (i >= 0) adapters.splice(i, 1);
    }
  }

  function detach(): void {
    for (const obj of attached) {
      detachOne(obj);
      for (const child of obj.eAllContents()) detachOne(child);
    }
    attached = [];
  }

  watch(
    () => [...toValue(sheets)],
    (list) => {
      detach();
      for (const sheet of list) {
        attachTree(sheet);
        attached.push(sheet);
      }
      version.value++;
    },
    { immediate: true }
  );

  onScopeDispose(detach);

  const css = computed(() => {
    void version.value; // Abhängigkeit auf Modelländerungen
    return generateCssForSheets([...toValue(sheets)]);
  });

  return { css, version };
}

/**
 * Injiziert das CSS der Sheets als <style>-Element in document.head
 * und hält es bei Modelländerungen aktuell.
 */
export function useStyleSheetInjection(
  sheets: MaybeRefOrGetter<readonly StyleSheet[]>
): { css: ComputedRef<string>; version: Ref<number> } {
  const { css, version } = useStyleSheetCss(sheets);

  if (typeof document !== 'undefined') {
    const el = document.createElement('style');
    el.id = `uimodel-css-${++styleElementCounter}`;
    el.setAttribute('data-uimodel-css', '');
    document.head.appendChild(el);

    watchEffect(() => {
      el.textContent = css.value;
    });

    onScopeDispose(() => {
      el.remove();
    });
  }

  return { css, version };
}
