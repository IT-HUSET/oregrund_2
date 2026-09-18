// Swedish display names for IFC property sets, properties, quantities and enum values.
// Names without a translation are shown as they appear in the file.

const SET_NAMES: Record<string, string> = {
  Pset_BeamCommon: 'Gemensamma egenskaper – balk',
  Pset_BuildingCommon: 'Gemensamma egenskaper – byggnad',
  Pset_BuildingElementProxyCommon: 'Gemensamma egenskaper – övrig byggdel',
  Pset_BuildingUse: 'Byggnadsanvändning',
  Pset_ColumnCommon: 'Gemensamma egenskaper – stolpe',
  Pset_CoveringCommon: 'Gemensamma egenskaper – beklädnad',
  Pset_ElectricApplianceTypeCommon: 'Gemensamma egenskaper – elapparat',
  Pset_FurnitureTypeCommon: 'Gemensamma egenskaper – möbel',
  Pset_Insulation: 'Isolering',
  Pset_LandRegistration: 'Fastighetsregistrering',
  Pset_PlateCommon: 'Gemensamma egenskaper – skiva',
  Pset_Sheet: 'Skiva',
  Pset_WallCommon: 'Gemensamma egenskaper – vägg',
  Qto_BeamBaseQuantities: 'Mängder – balk',
  Qto_ColumnBaseQuantities: 'Mängder – stolpe',
  Qto_PlateBaseQuantities: 'Mängder – skiva',
  Qto_WallBaseQuantities: 'Mängder – vägg',
  VertexQuantitySet: 'Mängder (Vertex)',
}

const ENTRY_NAMES: Record<string, string> = {
  AcousticRating: 'Ljudklass',
  Area: 'Area',
  BuildingID: 'Byggnads-ID',
  CrossSectionArea: 'Tvärsnittsarea',
  Description: 'Beskrivning',
  Finish: 'Ytbehandling',
  FireProtectionClass: 'Brandskyddsklass',
  FireRating: 'Brandklass',
  GrossPlannedArea: 'Planerad bruttoarea',
  GrossSideArea: 'Bruttosidoarea',
  GrossSurfaceArea: 'Bruttoytarea',
  GrossVolume: 'Bruttovolym',
  GrossWeight: 'Bruttovikt',
  Height: 'Höjd',
  IsExternal: 'Utvändig',
  LandTitleID: 'Fastighetsbeteckning',
  Length: 'Längd',
  LoadBearing: 'Bärande',
  MarketCategory: 'Marknadskategori',
  'Material code': 'Materialkod',
  NetArea: 'Nettoarea',
  NetFloorArea: 'Nettogolvarea',
  NetSideArea: 'Nettosidoarea',
  NetVolume: 'Nettovolym',
  NetWeight: 'Nettovikt',
  'Nominal length': 'Nominell längd',
  'Nominal thickness': 'Nominell tjocklek',
  'Nominal weight': 'Nominell vikt',
  'Nominal width': 'Nominell bredd',
  NumberOfStoreys: 'Antal våningar',
  PlanningControlStatus: 'Planstatus',
  Reference: 'Beteckning',
  Slope: 'Lutning',
  Span: 'Spännvidd',
  Status: 'Status',
  ThermalTransmittance: 'U-värde',
  Thickness: 'Tjocklek',
  Type: 'Typ',
  Width: 'Bredd',
  YearOfConstruction: 'Byggår',
}

// Vertex BD stores the strength grade (e.g. C16) in the covering's Finish property.
const SET_ENTRY_NAMES: Record<string, string> = {
  'Pset_CoveringCommon.Finish': 'Hållfasthetsklass',
}

const VALUES: Record<string, string> = {
  Yes: 'Ja',
  No: 'Nej',
  UNSET: 'Ej angiven',
  NOTDEFINED: 'Ej definierad',
  USERDEFINED: 'Användardefinierad',
  NEW: 'Ny',
  EXISTING: 'Befintlig',
  DEMOLISH: 'Rivs',
  TEMPORARY: 'Tillfällig',
}

export function setLabel(setName: string): string {
  return SET_NAMES[setName] ?? setName
}

export function entryLabel(setName: string, entryName: string): string {
  return SET_ENTRY_NAMES[`${setName}.${entryName}`] ?? ENTRY_NAMES[entryName] ?? entryName
}

export function valueLabel(value: string): string {
  return VALUES[value] ?? value
}
