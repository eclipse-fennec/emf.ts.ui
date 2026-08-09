/**
 * Expression-Tick (Issue #7): EObjects sind keine Vue-Reactive-Sources —
 * Expression-Ergebnisse (Bindings, Visibility, Validierung, Conditional/
 * ForEach, condition-StyleRules) würden ohne Signal einfrieren.
 *
 * Alle expression-abhängigen computeds der Library lesen den globalen
 * Tick (trackExpressionTick); bei Modelländerungen wird er gebumpt:
 *
 * - Der UIModelComposer hängt automatisch einen EContentAdapter an das
 *   übergebene Domänenobjekt (useModelTick) — Widget-Edits und
 *   programmatische eSet-Aufrufe wirken damit sofort.
 * - Konsumenten rufen bumpExpressionTick() für Änderungen, die der
 *   Adapter nicht sieht (anderes Resource-Objekt, externe Quellen,
 *   Struktur-Änderungen am UIModel selbst).
 */
import { onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import { EContentAdapter, type EObject, type Notification } from '@emfts/core';

const expressionTick = ref(0);

/** Signalisiert eine Modelländerung — alle Expression-computeds werten neu aus. */
export function bumpExpressionTick(): void {
  expressionTick.value++;
}

/** In expression-abhängigen computeds lesen (reine Dependency). */
export function trackExpressionTick(): void {
  void expressionTick.value;
}

type Notifier = {
  eAdapterAdd?(a: EContentAdapter): void;
  eAdapterRemove?(a: EContentAdapter): boolean;
  eAdapters(): EContentAdapter[];
};

/**
 * Hängt einen EContentAdapter an das Domänenobjekt (inkl. Nachfahren)
 * und bumpt den Expression-Tick bei jeder Änderung. Reagiert auf
 * Wechsel des Objekts; räumt beim Scope-Ende auf.
 */
export function useModelTick(model: MaybeRefOrGetter<EObject | undefined>): void {
  class TickAdapter extends EContentAdapter {
    notifyChanged(notification: Notification): void {
      try {
        super.notifyChanged(notification);
      } catch {
        // SET mit Plain-Array (Editor-Commands auf generierten Impls):
        // Kind-Adaption des EContentAdapter erwartet ELists — für den
        // Tick reicht die Notification selbst.
      }
      if (notification.isTouch?.()) return;
      bumpExpressionTick();
      const current = toValue(model);
      if (current) attachTree(current);
    }
  }
  const adapter = new TickAdapter();

  function attachOne(obj: EObject): void {
    const notifier = obj as unknown as Notifier;
    if (!notifier.eAdapters().includes(adapter)) {
      if (notifier.eAdapterAdd) notifier.eAdapterAdd(adapter);
      else notifier.eAdapters().push(adapter);
    }
  }

  function attachTree(root: EObject): void {
    attachOne(root);
    for (const child of root.eAllContents()) attachOne(child);
  }

  function detachTree(root: EObject): void {
    const remove = (obj: EObject) => {
      const notifier = obj as unknown as Notifier;
      if (notifier.eAdapterRemove) {
        notifier.eAdapterRemove(adapter);
      } else {
        const adapters = notifier.eAdapters();
        const i = adapters.indexOf(adapter);
        if (i >= 0) adapters.splice(i, 1);
      }
    };
    remove(root);
    for (const child of root.eAllContents()) remove(child);
  }

  watch(
    () => toValue(model),
    (current, previous) => {
      if (previous) detachTree(previous);
      if (current) attachTree(current);
    },
    { immediate: true }
  );

  onScopeDispose(() => {
    const current = toValue(model);
    if (current) detachTree(current);
  });
}
