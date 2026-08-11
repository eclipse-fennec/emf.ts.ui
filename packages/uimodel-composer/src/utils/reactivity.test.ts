import { describe, expect, it } from 'vitest';
import { computed } from 'vue';
import { bumpExpressionTick, trackExpressionTick } from './reactivity';

describe('Expression-Tick (Issue #7)', () => {
  it('invalidiert tracking computeds beim Bump', () => {
    let evaluations = 0;
    let externalValue = 'a';
    const result = computed(() => {
      trackExpressionTick();
      evaluations++;
      return externalValue;
    });

    expect(result.value).toBe('a');
    expect(result.value).toBe('a'); // gecacht
    expect(evaluations).toBe(1);

    externalValue = 'b';
    expect(result.value).toBe('a'); // ohne Bump: stale (EObjects sind nicht reaktiv)

    bumpExpressionTick();
    expect(result.value).toBe('b');
    expect(evaluations).toBe(2);
  });
});
