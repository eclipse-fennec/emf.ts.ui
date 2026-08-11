import type { EObject } from '@emfts/core';
import type { Expression } from '../generated/Expression';

/**
 * Wraps an EObject in a Proxy that allows string-based property access
 * by delegating to eClass().getEStructuralFeature(name) + eGet(feature).
 * This enables OCL/JS expressions like `self.firstName` to work on DynamicEObjects.
 */
/** EObject-Ergebnisse ebenfalls proxien, damit Ketten wie
 *  self.eType.name oder self.address.city funktionieren. */
function wrapResult(value: unknown): unknown {
  const v = value as { eClass?: unknown } | null;
  return v && typeof v.eClass === 'function' ? wrapEObject(v as EObject) : value;
}

function wrapEObject(context: EObject): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Proxy(context as any, {
    get(target, prop) {
      if (typeof prop !== 'string') return target[prop];
      // Wrap eGet so the OCL evaluator can call eGet('featureName') with a string
      if (prop === 'eGet') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (featureOrName: any) => {
          if (typeof featureOrName === 'string') {
            const f = target.eClass?.()?.getEStructuralFeature?.(featureOrName);
            return f ? wrapResult(target.eGet(f)) : undefined;
          }
          return wrapResult(target.eGet(featureOrName));
        };
      }
      if (prop in target) return target[prop];
      // Getter-Konvention für Meta-Objekte (EStructuralFeature etc.):
      // self.derived → isDerived(), self.name → getName(),
      // self.eType → getEType() (Ergebnis wieder proxied).
      // Vor dem eGet-Fallback, damit Meta-Ausdrücke in AllFeatures.filter
      // zuverlässig die Methoden-API treffen.
      const cap = prop.charAt(0).toUpperCase() + prop.slice(1);
      for (const accessor of [`get${cap}`, `is${cap}`]) {
        if (typeof target[accessor] === 'function') return wrapResult(target[accessor]());
      }
      // String-based feature access: self.firstName → eGet(feature)
      const feature = target.eClass?.()?.getEStructuralFeature?.(prop);
      if (feature) return wrapResult(target.eGet(feature));
      return undefined;
    }
  });
}

/**
 * Evaluates an Expression against an EObject context.
 * Returns true if the expression is absent (default: visible/valid).
 */
export function evaluateBoolean(
  expression: Expression | undefined,
  context: EObject
): boolean {
  if (!expression) return true;

  try {
    switch (expression.language) {
      case 'OCL':
        return evaluateOcl(expression.body, context);
      case 'AQL':
        return evaluateAql(expression.body, context);
      case 'JS':
        return evaluateJs(expression.body, context);
      default:
        console.warn(`[uimodel-composer] Unknown expression language: ${expression.language}`);
        return true;
    }
  } catch (e) {
    console.error(`[uimodel-composer] Expression evaluation failed (${expression.language}):`, e);
    return true;
  }
}

function evaluateOcl(body: string, context: EObject): boolean {
  // Delegate to @emfts/ocl EMFOclValidator
  // Lazy import to keep @emfts/ocl as optional peer dependency
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { EMFOclValidator } = (globalThis as any).__emftsOcl__ ?? {};
    if (!EMFOclValidator) {
      console.warn('[uimodel-composer] @emfts/ocl not registered. Call registerOclEvaluator() during setup.');
      return true;
    }
    const validator = new EMFOclValidator();
    const result = validator.evaluateExpression(body, wrapEObject(context));
    return result === true;
  } catch {
    return true;
  }
}

function evaluateAql(_body: string, _context: EObject): boolean {
  console.warn('[uimodel-composer] AQL evaluation not yet implemented.');
  return true;
}

function evaluateJs(body: string, context: EObject): boolean {
  // eslint-disable-next-line no-new-func
  const fn = new Function('self', `"use strict"; return (${body});`);
  const result = fn(wrapEObject(context));
  return Boolean(result);
}

/** Zusatzvariablen für die Auswertung (Meta-Ebene), z. B. feature/eClass. */
export type ExpressionExtras = Record<string, unknown>;

function wrapIfEObject(value: unknown): unknown {
  const v = value as { eClass?: unknown } | null;
  return v && typeof v.eClass === 'function' ? wrapEObject(v as EObject) : value;
}

/**
 * Werterhaltende Auswertung einer Expression (PropertyBinding, Issue #3).
 *
 * Kontext: self = context (Domänenobjekt); extras werden als zusätzliche
 * Variablen gebunden (EObjects automatisch proxied — Meta-Zugriffe wie
 * feature.name laufen über die Getter-Konvention).
 *
 * JS: voll unterstützt. OCL: auf self-Ausdrücke beschränkt, solange der
 * Evaluator keine Variablen bindet. Fail-open: undefined bei fehlender
 * Expression, unbekannter Sprache, fehlendem Evaluator oder Fehler —
 * der Aufrufer fällt dann auf den statischen Wert zurück.
 */
export function evaluateValue(
  expression: Expression | undefined,
  context: EObject,
  extras: ExpressionExtras = {}
): unknown {
  if (!expression?.body) return undefined;

  try {
    switch (expression.language) {
      case 'JS': {
        const names = Object.keys(extras);
        // eslint-disable-next-line no-new-func
        const fn = new Function('self', ...names, `"use strict"; return (${expression.body});`);
        return fn(wrapEObject(context), ...names.map((n) => wrapIfEObject(extras[n])));
      }
      case 'OCL': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { EMFOclValidator } = (globalThis as any).__emftsOcl__ ?? {};
        if (!EMFOclValidator) {
          console.warn('[uimodel-composer] @emfts/ocl not registered. Call registerOclEvaluator() during setup.');
          return undefined;
        }
        return new EMFOclValidator().evaluateExpression(expression.body, wrapEObject(context));
      }
      default:
        console.warn(`[uimodel-composer] evaluateValue: unsupported language ${expression.language}`);
        return undefined;
    }
  } catch (e) {
    console.error(`[uimodel-composer] Value expression failed (${expression.language}):`, e);
    return undefined;
  }
}

/**
 * Register the @emfts/ocl EMFOclValidator for OCL expression evaluation.
 * Call once during application setup.
 */
export function registerOclEvaluator(EMFOclValidator: unknown): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__emftsOcl__ = { EMFOclValidator };
}
