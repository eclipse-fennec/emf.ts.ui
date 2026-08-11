/**
 * Zentraler Editor-Zustand: EditingDomain + CommandStack (Undo/Redo),
 * Selektion, Modell-Version und XMI-Persistenz.
 *
 * Alle Modelländerungen laufen über Commands (Set/Add/Remove) —
 * dadurch sind sie rückgängig machbar und bumpen die version,
 * an der Baum, Property-Panel und Preview hängen.
 */
import { computed, ref, shallowRef, type ComputedRef, type InjectionKey, type Ref, type ShallowRef } from 'vue';
import { BasicCommandStack, BasicEditingDomain, type Command } from '@emfts/command';
import { bumpExpressionTick } from '@emfts/uimodel-composer';
import type { EClass, EObject, EStructuralFeature, XMIResource } from '@emfts/core';
import type { LoadedEditorData } from '../emf/loadEditorResources';
import { containmentFeatures } from './reflect';

/**
 * Minimales Set-Command über eSet mit Alt-Wert-Snapshot.
 *
 * Hintergrund: Die SetCommand/AddCommand/RemoveCommand aus @emfts/command
 * sind gegen die EList-API (contains/add/toArray) geschrieben — die
 * generierten emf-mode-Impls halten Many-Features aber als schlichte
 * Arrays. Dieses Command arbeitet mit eGet/eSet und geklonten Arrays
 * und ist damit gegen beide Repräsentationen robust.
 */
class FeatureSetCommand implements Command {
  private oldValue: unknown;

  constructor(
    private readonly owner: EObject,
    private readonly feature: EStructuralFeature,
    private readonly newValue: unknown
  ) {}

  private snapshot(value: unknown): unknown {
    return this.feature.isMany() && value ? [...(value as Iterable<unknown>)] : value;
  }

  canExecute(): boolean {
    return this.feature.isChangeable?.() !== false;
  }

  execute(): void {
    this.oldValue = this.snapshot(this.owner.eGet(this.feature));
    this.owner.eSet(this.feature, this.newValue);
  }

  canUndo(): boolean {
    return true;
  }

  undo(): void {
    this.owner.eSet(this.feature, this.oldValue);
  }

  redo(): void {
    this.owner.eSet(this.feature, this.newValue);
  }

  getResult(): Iterable<unknown> {
    return [this.owner];
  }

  getAffectedObjects(): Iterable<unknown> {
    return [this.owner];
  }

  getLabel(): string {
    return `Set ${this.feature.getName()}`;
  }

  getDescription(): string {
    return `Setzt ${this.feature.getName()} an ${this.owner.eClass().getName()}`;
  }

  dispose(): void {
    // nichts zu bereinigen
  }

  chain(_command: Command): Command {
    throw new Error('chain wird nicht unterstützt');
  }
}

export interface EditorContext {
  data: LoadedEditorData;
  /** Wird bei jeder Commandstack-Änderung inkrementiert. */
  version: Ref<number>;
  selected: ShallowRef<EObject | null>;
  dirty: Ref<boolean>;
  canUndo: ComputedRef<boolean>;
  canRedo: ComputedRef<boolean>;
  undo(): void;
  redo(): void;
  select(obj: EObject | null): void;
  /** Attribut/Referenz setzen (SetCommand). */
  setValue(owner: EObject, feature: EStructuralFeature, value: unknown): void;
  /** Wert zu Many-Feature hinzufügen (AddCommand). */
  addValue(owner: EObject, feature: EStructuralFeature, value: unknown): void;
  /** Wert aus Many-Feature entfernen (RemoveCommand). */
  removeValue(owner: EObject, feature: EStructuralFeature, value: unknown): void;
  /** Neues Kind unter owner.feature anlegen und selektieren. */
  addChild(owner: EObject, feature: EStructuralFeature, eClass: EClass): EObject | null;
  /** Objekt aus seinem Container entfernen. */
  removeObject(obj: EObject): void;
  /** Beide Modell-Resources als XMI-Strings serialisieren. */
  serialize(): { fileName: string; content: string }[];
}

export const EDITOR_KEY: InjectionKey<EditorContext> = Symbol('uimodel-editor');

export function createEditor(data: LoadedEditorData): EditorContext {
  const stack = new BasicCommandStack();
  const domain = new BasicEditingDomain(stack, data.resourceSet);

  const version = ref(0);
  const dirty = ref(false);
  stack.addCommandStackListener({
    commandStackChanged: () => {
      version.value++;
      dirty.value = true;
      // Struktur-/Attributänderungen am UIModel selbst sieht der
      // Model-Adapter des Composers nicht — explizit bumpen (Issue #7)
      bumpExpressionTick();
    },
  });

  const selected = shallowRef<EObject | null>(null);

  const canUndo = computed(() => {
    void version.value;
    return stack.canUndo();
  });
  const canRedo = computed(() => {
    void version.value;
    return stack.canRedo();
  });

  function execute(command: { canExecute(): boolean } | null): boolean {
    if (!command || !command.canExecute()) {
      console.warn('[editor] Command nicht ausführbar', command);
      return false;
    }
    stack.execute(command as never);
    return true;
  }

  // Die generierten emf-mode-Impls halten Many-Features als schlichte
  // Arrays (keine EList mit contains/add) — Add/RemoveCommand aus
  // @emfts/command greifen darauf nicht. Many-Änderungen laufen daher
  // als SetCommand mit geklontem Array: undo-fähig und notify-sicher.
  function listSet(owner: EObject, feature: EStructuralFeature, next: unknown[]): boolean {
    return execute(new FeatureSetCommand(owner, feature, next));
  }

  function currentList(owner: EObject, feature: EStructuralFeature): unknown[] {
    const value = owner.eGet(feature);
    return value ? [...(value as Iterable<unknown>)] : [];
  }

  function setValue(owner: EObject, feature: EStructuralFeature, value: unknown): void {
    execute(new FeatureSetCommand(owner, feature, value));
  }

  function addValue(owner: EObject, feature: EStructuralFeature, value: unknown): void {
    listSet(owner, feature, [...currentList(owner, feature), value]);
  }

  function removeValue(owner: EObject, feature: EStructuralFeature, value: unknown): void {
    listSet(owner, feature, currentList(owner, feature).filter((v) => v !== value));
  }

  function createInstance(eClass: EClass): EObject | null {
    const factory = eClass.getEPackage()?.getEFactoryInstance();
    if (!factory) {
      console.warn(`[editor] Keine Factory für ${eClass.getName()}`);
      return null;
    }
    const obj = factory.create(eClass);
    // sinnvolle Defaults, damit neue Objekte sichtbar/benannt sind
    const defaults: Record<string, unknown> = {
      name: `Neu${eClass.getName()}`,
      property: 'color',
      value: eClass.getName() === 'CssDeclaration' ? 'token(color-text)' : undefined,
    };
    for (const [attr, val] of Object.entries(defaults)) {
      if (val === undefined) continue;
      const f = eClass.getEStructuralFeature(attr);
      if (f && !obj.eGet(f)) obj.eSet(f, val);
    }
    return obj;
  }

  function addChild(owner: EObject, feature: EStructuralFeature, eClass: EClass): EObject | null {
    const child = createInstance(eClass);
    if (!child) return null;
    const ok = feature.isMany()
      ? listSet(owner, feature, [...currentList(owner, feature), child])
      : execute(new FeatureSetCommand(owner, feature, child));
    if (!ok) return null;
    selected.value = child;
    return child;
  }

  // eContainer wird von den generierten Settern nicht gepflegt —
  // Container daher über die Containment-Struktur der Wurzeln suchen.
  function findContainment(
    obj: EObject
  ): { container: EObject; feature: EStructuralFeature } | null {
    function visit(parent: EObject): { container: EObject; feature: EStructuralFeature } | null {
      for (const feature of containmentFeatures(parent.eClass())) {
        const value = parent.eGet(feature);
        if (!value) continue;
        const children = feature.isMany()
          ? [...(value as Iterable<EObject>)]
          : [value as EObject];
        if (children.includes(obj)) return { container: parent, feature };
        for (const child of children) {
          const found = visit(child);
          if (found) return found;
        }
      }
      return null;
    }
    for (const root of [data.uiModel, data.genericModel, data.overlay, data.styleSheet] as unknown as EObject[]) {
      if (root === obj) return null;
      const found = visit(root);
      if (found) return found;
    }
    return null;
  }

  function removeObject(obj: EObject): void {
    const containment = findContainment(obj);
    if (!containment) {
      console.warn('[editor] Wurzelobjekte können nicht gelöscht werden');
      return;
    }
    const { container, feature } = containment;
    const ok = feature.isMany()
      ? listSet(container, feature, currentList(container, feature).filter((v) => v !== obj))
      : execute(new FeatureSetCommand(container, feature, null));
    if (ok && selected.value === obj) selected.value = container;
  }

  function serialize(): { fileName: string; content: string }[] {
    const entries: [string, XMIResource][] = [
      ['person-form.xmi', data.formResource],
      ['styles.xmi', data.stylesResource],
      ['generic-default.uimodel.xmi', data.genericResource],
      ['workspace-overlay.uimodel.xmi', data.overlayResource],
    ];
    return entries.map(([fileName, resource]) => ({
      fileName,
      content: resource.saveToString(),
    }));
  }

  return {
    data,
    version,
    selected,
    dirty,
    canUndo,
    canRedo,
    undo: () => {
      if (stack.canUndo()) stack.undo();
    },
    redo: () => {
      if (stack.canRedo()) stack.redo();
    },
    select: (obj) => {
      selected.value = obj;
    },
    setValue,
    addValue,
    removeValue,
    addChild,
    removeObject,
    serialize,
  };
}
