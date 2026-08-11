/**
 * Integrationstest: styles.xmi (StyleSheet-Modell) laden, Cross-Resource-
 * Referenzen auflösen und CSS generieren — der komplette Pfad, den auch
 * die Editor-App nutzt.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  BasicResourceSet,
  EPackageRegistry,
  registerEcorePackage,
  URI,
  XMIResourceFactory,
  type XMIResource,
} from '@emfts/core';
import { UimodelPackage } from '../generated/UimodelPackage';
import { UimodelFactory } from '../generated/UimodelFactory';
import type { UIModel } from '../generated/UIModel';
import type { InputWidget } from '../generated/InputWidget';
import type { StyleSheet } from '../generated/css/StyleSheet';
import { generateCss } from './cssEngine';
import { componentCssClasses, referencedStyleClasses } from './componentClasses';
import { resolveCrossResourceProxies } from '../utils/resolveProxies';

const STYLES_XMI = readFileSync(
  resolve(__dirname, '../../model/examples/styles.xmi'),
  'utf-8'
);

const FORM_XMI = `<?xml version="1.0" encoding="UTF-8"?>
<uimodel:UIModel xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:uimodel="http://uimodel/1.0" name="TestForm">
  <components xsi:type="uimodel:FormView" name="F1">
    <fields xsi:type="uimodel:InputWidget" name="email" label="E-Mail">
      <styles href="styles.xmi#s-accent"/>
    </fields>
  </components>
</uimodel:UIModel>`;

let sheet: StyleSheet;
let uiModel: UIModel;

beforeAll(async () => {
  registerEcorePackage();
  const uimodel = UimodelPackage.eINSTANCE;
  uimodel.setEFactoryInstance(UimodelFactory.eINSTANCE);
  EPackageRegistry.INSTANCE.set(uimodel.getNsURI()!, uimodel);

  // CSS-Package dynamisch NACH der Basis registrieren (liest BaseStyle
  // aus der EPackageRegistry beim _init)
  const { UimodelCssPackage, UimodelCssFactory } = await import('../generated/css/index');
  const cssPkg = UimodelCssPackage.eINSTANCE;
  cssPkg.setEFactoryInstance(UimodelCssFactory.eINSTANCE);
  EPackageRegistry.INSTANCE.set(cssPkg.getNsURI()!, cssPkg);

  const rs = new BasicResourceSet();
  rs.getResourceFactoryRegistry().getExtensionToFactoryMap().set('xmi', new XMIResourceFactory());

  const stylesResource = rs.createResource(URI.createURI('/styles.xmi')) as XMIResource;
  stylesResource.loadFromString(STYLES_XMI);
  sheet = stylesResource.getContents().get(0) as StyleSheet;

  const formResource = rs.createResource(URI.createURI('/person-form.xmi')) as XMIResource;
  formResource.loadFromString(FORM_XMI);
  uiModel = formResource.getContents().get(0) as UIModel;

  // Cross-Resource-Proxies (styles.xmi#…) auflösen
  resolveCrossResourceProxies(formResource);
});

describe('styles.xmi laden', () => {
  it('loads the StyleSheet with tokens, themes, styles and rules', () => {
    expect(sheet.eClass().getName()).toBe('StyleSheet');
    expect(sheet.name).toBe('person-editor');
    expect(sheet.tokens.length).toBeGreaterThanOrEqual(10);
    expect(sheet.themes.length).toBe(1);
    expect(sheet.styles.length).toBe(2);
    expect(sheet.rules.length).toBe(4);
  });

  it('resolves token references in theme overrides', () => {
    const dark = sheet.themes[0];
    // XMI-geladene EBoolean-Attribute kommen als String — Engine coerct via eBool
    expect(String(dark.dark)).toBe('true');
    expect(dark.overrides[0].token?.name).toBe('color-primary');
  });

  it('resolves the extends chain and targetClass references', () => {
    const accent = sheet.styles.find((s) => s.name === 'accent')!;
    expect(accent.extends?.name).toBe('card');
    const widgetBase = sheet.rules.find((r) => r.name === 'widget-base')!;
    expect(widgetBase.targetClass?.getName()).toBe('WidgetComponent');
  });

  it('generates CSS with tokens, theme, rules and styles', () => {
    const css = generateCss(sheet);
    expect(css).toContain('--uic-color-primary: #5b5fd6;');
    expect(css).toContain('.uicss-theme-dark {');
    expect(css).toContain('.uim-c-WidgetComponent {');
    expect(css).toContain('.uim-c-WidgetComponent.uim-s-required {');
    expect(css).toContain('.uic-accent:hover {');
    // condition-Regel bekommt die Stamping-Klasse im Selektor
    expect(css).toMatch(/\.uim-c-WidgetComponent\.uicss-cond-person-editor-\d+/);
  });
});

describe('XMI-Roundtrip', () => {
  it('serialisiert das StyleSheet zurück nach XMI', () => {
    const xml = (sheet.eResource() as XMIResource).saveToString();
    expect(xml).toContain('uicss:StyleSheet');
    expect(xml).toContain('name="color-primary"');
    expect(xml).toContain('property="border-left"');
    expect(xml).toContain('state="HOVER"');
    // erneut laden → gleiche Struktur
    const rs2 = sheet.eResource()!.getResourceSet()!;
    const reload = rs2.createResource(URI.createURI('/styles-roundtrip.xmi')) as XMIResource;
    reload.loadFromString(xml);
    const sheet2 = reload.getContents().get(0) as StyleSheet;
    expect(sheet2.styles.length).toBe(sheet.styles.length);
    expect(sheet2.rules.length).toBe(sheet.rules.length);
    expect(generateCss(sheet2)).toContain('.uic-accent {');
  });
});

describe('Cross-Resource-Referenz UIModel → StyleSheet', () => {
  it('resolves Component.styles into the stylesheet resource', () => {
    const form = uiModel.components[0] as unknown as { fields: InputWidget[] };
    const email = form.fields[0];
    expect(referencedStyleClasses(email.styles)).toEqual(['uic-card', 'uic-accent']);
    const classes = componentCssClasses(email, { sheets: [sheet] });
    expect(classes).toContain('uim-c-InputWidget');
    expect(classes).toContain('uic-accent');
  });
});
