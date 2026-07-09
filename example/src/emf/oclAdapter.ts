import { parseOclExpression, OclEvaluator } from '@emfts/ocl.langium';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OclExpression = any;

/**
 * Adapter that bridges @emfts/ocl.langium with the uimodel-composer's
 * registerOclEvaluator() interface.
 *
 * Usage:
 *   1. Call OclAdapter.preparse(body) for each OCL expression body (async, at startup).
 *   2. Call registerOclEvaluator(OclAdapter) once.
 */
export class OclAdapter {
  private static cache = new Map<string, OclExpression>();

  static async preparse(body: string): Promise<void> {
    if (this.cache.has(body)) return;
    const { expression, errors } = await parseOclExpression(body);
    if (errors.length > 0) {
      console.warn('[OclAdapter] Parse errors for expression:', body, errors);
    }
    if (expression) {
      this.cache.set(body, expression);
    }
  }

  evaluateExpression(body: string, context: unknown): boolean {
    const expr = OclAdapter.cache.get(body);
    if (!expr) {
      console.warn('[OclAdapter] Expression not pre-parsed, skipping validation:', body);
      return true;
    }
    try {
      const evaluator = new OclEvaluator();
      const result = evaluator.evaluateExpression(expr, context);
      return result === true || result === 'true';
    } catch (e) {
      console.error('[OclAdapter] Evaluation error:', e);
      return true;
    }
  }
}
