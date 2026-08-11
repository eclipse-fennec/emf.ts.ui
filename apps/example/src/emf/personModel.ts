/**
 * Programmatic UIModel + Person instances.
 *
 * Spiegelt form.xmi wider:
 *   MasterDetail
 *     ├─ master: TableView (PersonTable)
 *     └─ detail: FormView  (PersonFormView)
 *
 * In einer echten Anwendung werden diese Objekte aus XMI geladen:
 *   - form.xmi    → UIModel
 *   - persons.xmi → dge:Company.employees[]
 */
import type { EObject } from '@emfts/core';
import type {
  UIModel,
  MasterDetail,
  TableView,
  FormView,
  InputWidget,
  WidgetComponent,
} from '@emfts/uimodel-composer';
import { mockEClass, mockEAttribute, mockEObject } from './mockEObject';

// ── DGE Person EClass + Features ────────────────────────────────────────────

export const PersonEClass = mockEClass('Person');

export const firstNameAttr = mockEAttribute('firstName', PersonEClass);
export const lastNameAttr  = mockEAttribute('lastName',  PersonEClass);
export const emailAttr     = mockEAttribute('email',     PersonEClass);
export const phoneAttr     = mockEAttribute('phone',     PersonEClass);
export const jobTitleAttr  = mockEAttribute('jobTitle',  PersonEClass);

// ── UIModel helpers ──────────────────────────────────────────────────────────

function baseEObject(eclassName: string) {
  const cls = mockEClass(eclassName);
  return {
    eClass: () => cls,
    eGet: () => undefined,
    eSet: () => undefined,
    eIsSet: () => false,
    eUnset: () => undefined,
    eResource: () => null,
    eContainer: () => null,
    eContainingFeature: () => null,
    eContainmentFeature: () => null,
    eContents: () => [] as EObject[],
    eAllContents: () => ([] as EObject[])[Symbol.iterator](),
    eIsProxy: () => false,
    eCrossReferences: () => [] as EObject[],
    eInvoke: (): never => { throw new Error('not implemented'); },
  };
}

function makeInputWidget(
  name: string,
  label: string,
  feature: ReturnType<typeof mockEAttribute>,
  required = false,
  placeholder?: string,
): InputWidget {
  return {
    ...baseEObject('InputWidget'),
    name,
    targetClasses: [],
    styles: [],
    children: [],
    feature,
    label,
    placeholder,
    required,
    readOnly: false,
    validations: [],
    validationMappers: [],
  } as unknown as InputWidget;
}

// ── FormView ─────────────────────────────────────────────────────────────────

const personFormView: FormView = {
  ...baseEObject('FormView'),
  name: 'PersonFormView',
  group: 'person',
  targetClasses: [],
  styles: [],
  children: [],
  fields: [
    makeInputWidget('firstName', 'Vorname',          firstNameAttr, true),
    makeInputWidget('lastName',  'Nachname',          lastNameAttr,  true),
    makeInputWidget('email',     'E-Mail',            emailAttr,     true),
    makeInputWidget('phone',     'Telefon',           phoneAttr,     false, 'z.B. 0364112345'),
    makeInputWidget('jobTitle',  'Berufsbezeichnung', jobTitleAttr),
  ] as WidgetComponent[],
  validations: [],
  validationMappers: [],
} as unknown as FormView;

// ── TableView (Master) ────────────────────────────────────────────────────────

const personTableView: TableView = {
  ...baseEObject('TableView'),
  name: 'PersonTable',
  group: 'person',
  targetClasses: [PersonEClass],
  styles: [],
  children: [],
  tableStyle: {} as never,
} as unknown as TableView;

// ── MasterDetail ──────────────────────────────────────────────────────────────

const personMasterDetail: MasterDetail = {
  ...baseEObject('MasterDetail'),
  name: 'PersonMasterDetail',
  group: 'person',
  targetClasses: [],
  styles: [],
  children: [],
  master: personTableView,
  detail: personFormView,
} as unknown as MasterDetail;

// ── UIModel ───────────────────────────────────────────────────────────────────

export const personUIModel: UIModel = {
  ...baseEObject('UIModel'),
  name: 'PersonForm',
  targetClasses: [],
  styles: [],
  components: [personMasterDetail],
} as unknown as UIModel;

// ── 4 Personen (spiegelt persons.xmi wider) ───────────────────────────────────

export const persons: EObject[] = [
  mockEObject(PersonEClass, { firstName: 'Lena',   lastName: 'Fischer',  email: 'lena.fischer@dim.de',   phone: '0364112345', jobTitle: 'Software Architect' }),
  mockEObject(PersonEClass, { firstName: 'Markus', lastName: 'Hoffmann', email: 'markus.hoffmann@dim.de', phone: '0364123456', jobTitle: 'Senior Developer' }),
  mockEObject(PersonEClass, { firstName: 'Anna',   lastName: 'Schmidt',  email: 'anna.schmidt@dim.de',   phone: '0364134567', jobTitle: 'UX Designer' }),
  mockEObject(PersonEClass, { firstName: 'Jonas',  lastName: 'Weber',    email: 'jonas.weber@dim.de',    phone: '0364145678', jobTitle: 'DevOps Engineer' }),
];
