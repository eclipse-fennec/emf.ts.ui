/**
 * Lädt person-form.xmi (UIModel), styles.xmi (uimodel-css StyleSheet)
 * und persons.xmi (Domänendaten) in einen gemeinsamen ResourceSet.
 */
import {
  BasicResourceSet,
  EPackageRegistry,
  registerEcorePackage,
  URI,
  XMIResourceFactory,
  type EClass,
  type EObject,
  type ResourceSet,
  type XMIResource,
} from '@emfts/core';
import {
  UimodelPackage,
  UimodelFactory,
  resolveCrossResourceProxies,
  type UIModel,
  type UIModelOverlay,
} from '@emfts/uimodel-composer';
import type { StyleSheet } from '@emfts/uimodel-composer/css';
import { DgePackage } from './DgePackage';
import { applyEcoreAttributeTypes } from './applyEcoreAttributeTypes';
import uimodelEcoreXml from '../../../model/uimodel.ecore?raw';
import uimodelCssEcoreXml from '../../../model/uimodel-css.ecore?raw';
import genericDefaultXml from '../../../model/templates/generic-default.uimodel.xmi?raw';

export interface LoadedEditorData {
  resourceSet: ResourceSet;
  formResource: XMIResource;
  stylesResource: XMIResource;
  genericResource: XMIResource;
  overlayResource: XMIResource;
  uiModel: UIModel;
  /** Generisches AllFeatures-Default-Layout (model/templates/). */
  genericModel: UIModel;
  /** Workspace-Widget-Wahl-Overrides (Issue #8). */
  overlay: UIModelOverlay;
  styleSheet: StyleSheet;
  persons: EObject[];
  personClass: EClass;
  packages: ReturnType<typeof collectPackages>;
}

function collectPackages(...pkgs: unknown[]) {
  return pkgs as { getEClassifiers(): Iterable<unknown>; getName(): string }[];
}

async function fetchXml(path: string): Promise<string> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status} beim Laden von ${path}`);
  return res.text();
}

export async function loadEditorResources(): Promise<LoadedEditorData> {
  // 1. Packages registrieren (Reihenfolge: Basis vor Erweiterung)
  registerEcorePackage();
  const dge = DgePackage.eINSTANCE;
  const uimodel = UimodelPackage.eINSTANCE;
  uimodel.setEFactoryInstance(UimodelFactory.eINSTANCE);
  EPackageRegistry.INSTANCE.set(dge.getNsURI()!, dge);
  EPackageRegistry.INSTANCE.set(uimodel.getNsURI()!, uimodel);

  // CSS-Package dynamisch NACH der Basis (liest BaseStyle aus der Registry)
  const { UimodelCssPackage, UimodelCssFactory } = await import('@emfts/uimodel-composer/css');
  const cssPkg = UimodelCssPackage.eINSTANCE;
  cssPkg.setEFactoryInstance(UimodelCssFactory.eINSTANCE);
  EPackageRegistry.INSTANCE.set(cssPkg.getNsURI()!, cssPkg);

  // emfts-codegen setzt keine Attribut-eTypes/EEnums — für das reflektive
  // Property-Panel aus den .ecore-Quellen nachtragen
  applyEcoreAttributeTypes(uimodel, uimodelEcoreXml);
  applyEcoreAttributeTypes(cssPkg, uimodelCssEcoreXml);

  // 2. ResourceSet + XMI-Factory
  const rs = new BasicResourceSet();
  rs.getResourceFactoryRegistry().getExtensionToFactoryMap().set('xmi', new XMIResourceFactory());

  const [stylesXml, formXml, personsXml, overlayXml] = await Promise.all([
    fetchXml('/styles.xmi'),
    fetchXml('/person-form.xmi'),
    fetchXml('/persons.xmi'),
    fetchXml('/workspace-overlay.uimodel.xmi'),
  ]);

  // styles.xmi zuerst, damit person-form.xmi-Referenzen auflösbar sind
  const stylesResource = rs.createResource(URI.createURI('/styles.xmi')) as XMIResource;
  stylesResource.loadFromString(stylesXml);
  if (stylesResource.getContents().size() === 0) throw new Error('styles.xmi konnte nicht geladen werden');
  const styleSheet = stylesResource.getContents().get(0) as StyleSheet;

  const formResource = rs.createResource(URI.createURI('/person-form.xmi')) as XMIResource;
  formResource.loadFromString(formXml);
  if (formResource.getContents().size() === 0) throw new Error('person-form.xmi konnte nicht geladen werden');
  const uiModel = formResource.getContents().get(0) as UIModel;
  resolveCrossResourceProxies(formResource);

  const genericResource = rs.createResource(URI.createURI('/generic-default.uimodel.xmi')) as XMIResource;
  genericResource.loadFromString(genericDefaultXml);
  if (genericResource.getContents().size() === 0) throw new Error('generic-default.uimodel.xmi konnte nicht geladen werden');
  const genericModel = genericResource.getContents().get(0) as UIModel;

  const overlayResource = rs.createResource(URI.createURI('/workspace-overlay.uimodel.xmi')) as XMIResource;
  overlayResource.loadFromString(overlayXml);
  if (overlayResource.getContents().size() === 0) throw new Error('workspace-overlay.uimodel.xmi konnte nicht geladen werden');
  const overlay = overlayResource.getContents().get(0) as UIModelOverlay;
  resolveCrossResourceProxies(overlayResource);

  const personsResource = rs.createResource(URI.createURI('/persons.xmi')) as XMIResource;
  personsResource.loadFromString(personsXml);
  if (personsResource.getContents().size() === 0) throw new Error('persons.xmi konnte nicht geladen werden');
  const company = personsResource.getContents().get(0);
  const empFeature = dge.companyClass.getEStructuralFeature('employees')!;
  const persons = Array.from(company.eGet(empFeature) as Iterable<EObject>);

  return {
    resourceSet: rs,
    formResource,
    stylesResource,
    genericResource,
    overlayResource,
    uiModel,
    genericModel,
    overlay,
    styleSheet,
    persons,
    personClass: dge.personClass,
    packages: collectPackages(uimodel, cssPkg, dge),
  };
}
