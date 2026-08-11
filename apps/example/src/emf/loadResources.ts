/**
 * Lädt form.xmi, persons.xmi, chart.xmi und demographics.xmi via BasicResourceSet.
 */
import {
  BasicResourceSet,
  XMIResourceFactory,
  XMIResource,
  EPackageRegistry,
  registerEcorePackage,
  URI,
} from '@emfts/core';
import type { EObject } from '@emfts/core';
import { UimodelPackage, UimodelFactory, registerOclEvaluator } from '@emfts/uimodel-composer';
import type { UIModel } from '@emfts/uimodel-composer';
import { DemographicStructurePackage, DemographicStructureFactory } from '../generated/demographic/index.js';
import { TransitPackage, TransitFactory } from '../generated/transit/index.js';
import { DiagrammodelPackage } from '../generated/diagrammodel/index.js';
import { DgePackage } from './DgePackage';
import { OclAdapter } from './oclAdapter';

export interface LoadedData {
  uiModel: UIModel;
  chartModel: UIModel;
  mapModel: UIModel;
  transitMapModel: UIModel;
  transitNetwork: EObject;
  persons: EObject[];
  dataset: EObject;
  diagramModel: EObject;
  ecoreDomain: EObject;
  personEClass: ReturnType<typeof DgePackage.eINSTANCE>['personClass'];
}

async function fetchXml(path: string): Promise<string> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status} beim Laden von ${path}`);
  return res.text();
}

export async function loadResources(): Promise<LoadedData> {
  // 1. Ecore-Basis registrieren
  registerEcorePackage();

  // 2. Basis-Packages zuerst registrieren (VegaPackage braucht UIModel in der Registry)
  const dge     = DgePackage.eINSTANCE;
  const uimodel = UimodelPackage.eINSTANCE;
  uimodel.setEFactoryInstance(UimodelFactory.eINSTANCE);
  EPackageRegistry.INSTANCE.set(dge.getNsURI()!,     dge);
  EPackageRegistry.INSTANCE.set(uimodel.getNsURI()!, uimodel);

  // 3. Vega-Package dynamisch importieren NACH Registrierung der Basis
  //    (UimodelVegaFactory hat eager init die UimodelVegaPackage._init() triggert,
  //     welche Component aus der EPackageRegistry liest)
  const { UimodelVegaPackage, UimodelVegaFactory } = await import('@emfts/uimodel-vega');
  const vegaPkg = UimodelVegaPackage.eINSTANCE;
  const demoPkg = DemographicStructurePackage.eINSTANCE;
  vegaPkg.setEFactoryInstance(UimodelVegaFactory.eINSTANCE);
  demoPkg.setEFactoryInstance(DemographicStructureFactory.eINSTANCE);
  EPackageRegistry.INSTANCE.set(vegaPkg.getNsURI()!,  vegaPkg);
  EPackageRegistry.INSTANCE.set(demoPkg.getNsURI()!,  demoPkg);

  // Maps-Package (QGIS-orientiert) ebenfalls dynamisch NACH der Basis registrieren
  const { UimodelMapsPackage, UimodelMapsFactory } = await import(
    '../../../../packages/uimodel-composer/src/generated/maps/index.js'
  );
  const mapsPkg = UimodelMapsPackage.eINSTANCE;
  mapsPkg.setEFactoryInstance(UimodelMapsFactory.eINSTANCE);
  EPackageRegistry.INSTANCE.set(mapsPkg.getNsURI()!,  mapsPkg);

  // Transit-Domäne (eigenständiges Package) registrieren
  const transitPkg = TransitPackage.eINSTANCE;
  transitPkg.setEFactoryInstance(TransitFactory.eINSTANCE);
  EPackageRegistry.INSTANCE.set(transitPkg.getNsURI()!, transitPkg);

  // Diagram-Packages registrieren
  const diagramPkg = DiagrammodelPackage.eINSTANCE;
  EPackageRegistry.INSTANCE.set(diagramPkg.getNsURI()!, diagramPkg);
  // Ecore metamodel — domain for the Ecore class diagram
  const { getEcorePackage } = await import('@emfts/core');
  const ecorePkg = getEcorePackage();
  EPackageRegistry.INSTANCE.set(ecorePkg.getNsURI()!, ecorePkg);

  // 3. ResourceSet + XMI-Factory aufbauen
  const rs = new BasicResourceSet();
  const xmiFactory = new XMIResourceFactory();
  rs.getResourceFactoryRegistry().getExtensionToFactoryMap().set('xmi', xmiFactory);

  // 4. Alle XMI-Dateien parallel laden
  const [formXml, personsXml, chartXml, demoXml, mapXml, transitXml, transitMapXml, ecoreDiagramXml, libraryEcoreXml] = await Promise.all([
    fetchXml('/form.xmi'),
    fetchXml('/persons.xmi'),
    fetchXml('/chart.xmi'),
    fetchXml('/demographics.xmi'),
    fetchXml('/map.xmi'),
    fetchXml('/transit.xmi'),
    fetchXml('/transitmap.xmi'),
    fetchXml('/ecore-class-diagram.xmi'),
    fetchXml('/library.ecore'),
  ]);

  // form.xmi → UIModel (PersonForm)
  const formResource = rs.createResource(URI.createURI('/form.xmi')) as XMIResource;
  formResource.loadFromString(formXml);
  if (formResource.getContents().length === 0) throw new Error('form.xmi konnte nicht geladen werden');
  const uiModel = formResource.getContents()[0] as UIModel;

  // chart.xmi → UIModel (DemographicCharts mit VegaView)
  const chartResource = rs.createResource(URI.createURI('/chart.xmi')) as XMIResource;
  chartResource.loadFromString(chartXml);
  if (chartResource.getContents().length === 0) throw new Error('chart.xmi konnte nicht geladen werden');
  const chartModel = chartResource.getContents()[0] as UIModel;

  // map.xmi → UIModel (DemographicMap mit MapView)
  const mapResource = rs.createResource(URI.createURI('/map.xmi')) as XMIResource;
  mapResource.loadFromString(mapXml);
  if (mapResource.getContents().length === 0) throw new Error('map.xmi konnte nicht geladen werden');
  const mapModel = mapResource.getContents()[0] as UIModel;

  // transit.xmi → TransitNetwork (Domänendaten für die Karte)
  const transitResource = rs.createResource(URI.createURI('/transit.xmi')) as XMIResource;
  transitResource.loadFromString(transitXml);
  if (transitResource.getContents().length === 0) throw new Error('transit.xmi konnte nicht geladen werden');
  const transitNetwork = transitResource.getContents()[0];

  // transitmap.xmi → UIModel (TransitMap mit MapView)
  const transitMapResource = rs.createResource(URI.createURI('/transitmap.xmi')) as XMIResource;
  transitMapResource.loadFromString(transitMapXml);
  if (transitMapResource.getContents().length === 0) throw new Error('transitmap.xmi konnte nicht geladen werden');
  const transitMapModel = transitMapResource.getContents()[0] as UIModel;

  // persons.xmi → dge:Company → employees
  const personsResource = rs.createResource(URI.createURI('/persons.xmi')) as XMIResource;
  personsResource.loadFromString(personsXml);
  if (personsResource.getContents().length === 0) throw new Error('persons.xmi konnte nicht geladen werden');

  const company    = personsResource.getContents()[0];
  const empFeature = dge.companyClass.getEStructuralFeature('employees')!;
  const personsList = company.eGet(empFeature) as Iterable<EObject> & { length?: number };
  const persons    = Array.from(personsList) as EObject[];

  // demographics.xmi → DemographicDataset
  const demoResource = rs.createResource(URI.createURI('/demographics.xmi')) as XMIResource;
  demoResource.loadFromString(demoXml);
  if (demoResource.getContents().length === 0) throw new Error('demographics.xmi konnte nicht geladen werden');
  const dataset = demoResource.getContents()[0];

  // ecore-class-diagram.xmi → DiagramModel
  // .ecore needs to be registered as xmi format too
  rs.getResourceFactoryRegistry().getExtensionToFactoryMap().set('ecore', xmiFactory);
  const ecoreDiagramResource = rs.createResource(URI.createURI('/ecore-class-diagram.xmi')) as XMIResource;
  ecoreDiagramResource.loadFromString(ecoreDiagramXml);
  if (ecoreDiagramResource.getContents().length === 0) throw new Error('ecore-class-diagram.xmi konnte nicht geladen werden');
  const diagramModel = ecoreDiagramResource.getContents()[0];

  // library.ecore → Ecore domain model (the domain data the diagram renders)
  const libraryResource = rs.createResource(URI.createURI('/library.ecore')) as XMIResource;
  libraryResource.loadFromString(libraryEcoreXml);
  if (libraryResource.getContents().length === 0) throw new Error('library.ecore konnte nicht geladen werden');
  const ecoreDomain = libraryResource.getContents()[0];

  // 5. OCL-Evaluator registrieren + vorparsen
  registerOclEvaluator(OclAdapter);
  await Promise.all([
    prepareOclValidations(uiModel),
    prepareDiagramOcl(diagramModel),
  ]);

  return { uiModel, chartModel, mapModel, transitMapModel, transitNetwork, persons, dataset, diagramModel, ecoreDomain, personEClass: dge.personClass };
}

/** Pre-parse all OCL expressions found in a DiagramModel (conditions, rowConditions). */
async function prepareDiagramOcl(diagramModel: EObject): Promise<void> {
  const tasks: Promise<void>[] = [];
  collectDiagramOclBodies(diagramModel, tasks);
  await Promise.all(tasks);
}

function eget(obj: EObject, name: string): any {
  const f = obj.eClass?.()?.getEStructuralFeature?.(name);
  return f ? obj.eGet(f) : undefined;
}

function toArray(val: any): EObject[] {
  if (!val) return [];
  if (Symbol.iterator in Object(val)) return Array.from(val as Iterable<EObject>);
  return [val as EObject];
}

function collectDiagramOclBodies(obj: EObject, tasks: Promise<void>[]): void {
  // Check for condition/rowCondition features (Expression-like objects with language+body)
  for (const featureName of ['condition', 'rowCondition']) {
    const expr = eget(obj, featureName) as EObject | undefined;
    if (expr) {
      const lang = String(eget(expr, 'language') ?? 'OCL');
      const body = eget(expr, 'body') as string | undefined;
      if (body && lang === 'OCL') {
        tasks.push(OclAdapter.preparse(body));
      }
    }
  }
  // Recurse into all containment features
  const eClass = obj.eClass?.();
  if (!eClass) return;
  for (const feature of eClass.getEAllStructuralFeatures()) {
    if (!('isContainment' in feature) || !(feature as { isContainment(): boolean }).isContainment()) continue;
    const value = obj.eGet(feature);
    if (!value) continue;
    if (Symbol.iterator in Object(value)) {
      for (const child of value as Iterable<EObject>) {
        collectDiagramOclBodies(child, tasks);
      }
    } else {
      collectDiagramOclBodies(value as EObject, tasks);
    }
  }
}

async function prepareOclValidations(uiModel: UIModel): Promise<void> {
  const preParseTasks: Promise<void>[] = [];
  collectOclBodies(uiModel as unknown as EObject, preParseTasks);
  await Promise.all(preParseTasks);
}

function collectOclBodies(obj: EObject, tasks: Promise<void>[]): void {
  const eClass = obj.eClass?.();
  if (!eClass) return;

  const className = eClass.getName();

  if (['InputWidget', 'TextAreaWidget', 'NumberWidget', 'CheckboxWidget', 'DateWidget',
       'ComboboxWidget', 'SelectWidget', 'ReferenceLinkWidget'].includes(className)) {
    const validationsFeature = eClass.getEStructuralFeature('validations');
    if (validationsFeature) {
      const validations = obj.eGet(validationsFeature) as Iterable<EObject>;
      for (const v of validations) {
        const langFeature = v.eClass().getEStructuralFeature('language');
        const bodyFeature = v.eClass().getEStructuralFeature('body');
        const lang = (langFeature ? v.eGet(langFeature) : 'OCL') as string ?? 'OCL';
        const body = (bodyFeature ? v.eGet(bodyFeature) : undefined) as string | undefined;
        if (body && lang === 'OCL') {
          tasks.push(OclAdapter.preparse(body));
        }
      }
    }
  }

  for (const feature of eClass.getEAllStructuralFeatures()) {
    if (!('isContainment' in feature) || !(feature as { isContainment(): boolean }).isContainment()) continue;
    const value = obj.eGet(feature);
    if (!value) continue;
    if (Symbol.iterator in Object(value)) {
      for (const child of value as Iterable<EObject>) {
        collectOclBodies(child, tasks);
      }
    } else {
      collectOclBodies(value as EObject, tasks);
    }
  }
}
