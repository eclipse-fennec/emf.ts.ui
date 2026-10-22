/**
 * Kaskade über gesetzte Attribute: seit @emfts/codegen 0.0.2 starten
 * Attribute mit ihrem Default (layout=VERTICAL, readOnly=false, order=0)
 * statt undefined. Ungesetzte Werte dürfen Eltern-/Style-Werte nicht
 * überschreiben; explizit gesetzte Defaults (unsettable) schon.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { effectScope } from 'vue';
import { UimodelPackage } from '../generated/UimodelPackage';
import { UimodelFactory } from '../generated/UimodelFactory';
import { LayoutType } from '../generated/LayoutType';
import { resolveStyleChain, resolveStyleList } from './resolveStyleChain';
import { useWidgetConfig } from '../composables/useWidgetConfig';

const factory = UimodelFactory.eINSTANCE;

beforeAll(() => {
  UimodelPackage.eINSTANCE.setEFactoryInstance(factory);
});

describe('resolveStyleChain', () => {
  it('ein Kind ohne layout/order erbt die Werte des Elters', () => {
    const parent = factory.createLayoutStyle();
    parent.layout = LayoutType.GRID;
    parent.order = 3;
    const child = factory.createLayoutStyle();
    child.extends = parent;

    const resolved = resolveStyleChain(child);
    expect(resolved.layout).toBe(LayoutType.GRID);
    expect(resolved.order).toBe(3);
  });

  it('ein explizit gesetzter Default überschreibt den Elter', () => {
    const parent = factory.createLayoutStyle();
    parent.layout = LayoutType.GRID;
    const child = factory.createLayoutStyle();
    child.extends = parent;
    child.layout = LayoutType.VERTICAL;

    expect(resolveStyleChain(child).layout).toBe(LayoutType.VERTICAL);
  });

  it('ein späterer Style ohne readOnly überschreibt readOnly=true nicht', () => {
    const locked = factory.createWidgetStyle();
    locked.readOnly = true;
    const plain = factory.createWidgetStyle();

    expect(resolveStyleList([locked, plain]).readOnly).toBe(true);
  });
});

describe('useWidgetConfig', () => {
  function configOf(widgetSetup: (w: ReturnType<typeof factory.createInputWidget>) => void) {
    const style = factory.createWidgetStyle();
    style.readOnly = true;
    const widget = factory.createInputWidget();
    widget.styles.push(style);
    widgetSetup(widget);
    const scope = effectScope();
    const value = scope.run(() => useWidgetConfig(widget).value)!;
    scope.stop();
    return value;
  }

  it('ungesetztes widget.readOnly lässt den Style-Wert stehen', () => {
    expect(configOf(() => {}).readOnly).toBe(true);
  });

  it('explizites widget.readOnly=false überschreibt den Style', () => {
    expect(configOf((w) => { w.readOnly = false; }).readOnly).toBe(false);
  });
});
