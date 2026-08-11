/**
 * EMF.ts setup: registers the DGE and UIModel packages,
 * then loads form.xmi and persons.xmi via BasicResourceSet.
 */
import {
  BasicResourceSet,
  XMIResourceFactory,
  EPackageRegistry,
} from '@emfts/core';
import type { EObject } from '@emfts/core';
import type { UIModel } from '@emfts/uimodel-composer';
import { UimodelPackage } from './UimodelPackageShim';
import { DgePackage } from './DgePackage';

export interface LoadedData {
  uiModel: UIModel;
  persons: EObject[];
}

export async function loadData(): Promise<LoadedData> {
  // 1. Register packages globally
  const dgePackage = DgePackage.eINSTANCE;
  const uimodelPackage = UimodelPackage.eINSTANCE;

  EPackageRegistry.INSTANCE.put(dgePackage.getNsURI()!, dgePackage);
  EPackageRegistry.INSTANCE.put(uimodelPackage.getNsURI()!, uimodelPackage);

  // 2. Build resource set with XMI factory
  const rs = new BasicResourceSet();
  const factory = new XMIResourceFactory();
  rs.getResourceFactoryRegistry().getExtensionToFactoryMap().put('xmi', factory);
  rs.getResourceFactoryRegistry().getExtensionToFactoryMap().put('ecore', factory);

  // 3. Load UIModel (form.xmi)
  const formResource = await rs.getResourceAsync(
    createURI('/form.xmi'), true
  );
  if (!formResource) throw new Error('Could not load form.xmi');
  const uiModel = formResource.getContents()[0] as UIModel;

  // 4. Load domain data (persons.xmi)
  const personsResource = await rs.getResourceAsync(
    createURI('/persons.xmi'), true
  );
  if (!personsResource) throw new Error('Could not load persons.xmi');

  // The root is a Company — employees are its contained objects
  const company = personsResource.getContents()[0];
  const employees = company.eGet(
    dgePackage.getEClassifier('Company')!
      .getEStructuralFeature('employees')
  ) as EObject[];

  return { uiModel, persons: employees };
}

function createURI(path: string) {
  // In browser, resolve relative to the current page
  const { URI } = require('@emfts/core');
  return URI.createURI(window.location.origin + path);
}
