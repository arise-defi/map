import { BuildingFootprint } from './building-footprint';

export interface CadastralParcel {
  ulpin: string;
  provisional_flag: boolean;
  survey_no: string;
  ward_id: string;
  locality_id: string;
  geom: string;
  road_id: string;
  road_class: string;
  corner_plot: boolean;
}

export interface CadastralBuilding {
  building_no: string;
  parcel_id: string;
  floors: number;
  height_m: number;
  footprint_geom: string;
  dsm_height_m: number;
  oc_ref: string;
}

export interface CadastralUnit {
  ptin: string;
  unit_no: string;
  building_id: string;
  usage: string;
  occupancy: string;
  plinth_area_sqm: number;
  plinth_area_sqft: number;
  carpet_area_sqm: number;
  carpet_area_sqft: number;
  legacy_no: string[];
}

export interface CadastralSegment {
  unit_id: string;
  segment_type: string;
  area_sqm: number;
  licence_ref: string;
}

export interface CadastralOwnerLink {
  unit_id: string;
  party_id: string;
  party_name: string;
  share_pct: string;
  from_date: string;
  to_date: string;
  source: string;
}

export interface CadastralAssessment {
  unit_id: string;
  type: string;
  arv: number;
  tax_rates_version: string;
  effective_from: string;
  status: string;
  workflow_id: string;
}

export interface CadastralDemand {
  unit_id: string;
  period: string;
  head: string;
  amount: number;
  rebate: number;
  net_amount: number;
  due_date: string;
  status: string;
}

export interface CadastralReceiptAdjustment {
  receipt_no: string;
  payment_ref: string;
  lines: Array<{ demand_id: string; amount: string }>;
  channel: string;
  realised_at: string;
  adj_type: string;
  reason: string;
  approver: string;
}

export interface CadastralNoticePetition {
  notice_type: string;
  served_at: string;
  served_by: string;
  geo_point: string;
  petition_no: string;
  grounds: string;
  lgl_case_ref: string;
}

export interface CadastralFloorDataModel {
  parcel: CadastralParcel;
  building: CadastralBuilding;
  unit: CadastralUnit;
  segment: CadastralSegment;
  owner_link: CadastralOwnerLink;
  assessment: CadastralAssessment;
  demand: CadastralDemand;
  receipt_adjustment: CadastralReceiptAdjustment;
  notice_petition: CadastralNoticePetition;
}

/**
 * Deterministically generates official cadastral, land registry, and property tax
 * data model records for a specific floor in a building.
 */
export function getCadastralDataForFloor(
  b: BuildingFootprint,
  floorNum: number,
  totalFloors: number
): CadastralFloorDataModel {
  // Deterministic seed based on building ID + floor number
  const bId = String(b?.id || 'bld-0');
  let seed = 0;
  for (let i = 0; i < bId.length; i++) {
    seed = (seed * 31 + bId.charCodeAt(i)) % 100000;
  }
  seed = (seed + floorNum * 137) % 100000;

  const stateCode = '27'; // Standard State Code (e.g. Maharashtra / Karnataka)
  const districtCode = String(100 + (seed % 900));
  const subDistrict = String(10 + ((seed >> 2) % 90));
  const parcelNum = String(1000 + ((seed >> 4) % 9000));
  const ulpin = `${stateCode}-${districtCode}-${subDistrict}-${parcelNum}`;
  const surveyNo = `Survey No. ${(seed % 140) + 1}/${String.fromCharCode(65 + (seed % 4))}`;
  const wardId = `Ward ${(seed % 198) + 1} (${['North', 'South', 'Central', 'East', 'West'][seed % 5]} Zone)`;
  const locality = [
    'Indiranagar Sector 2',
    'Bandra West Hill Road',
    'Koramangala 4th Block',
    'Connaught Place Outer',
    'Jubilee Hills Road 36',
    'Whitefield Tech Hub',
    'Cyber City Phase II',
  ][seed % 7];
  const roadClass = [
    'Primary Arterial (24m Right-of-Way)',
    'Secondary Collector (18m)',
    'Commercial Corridor (30m)',
    'Sector Boulevard (20m)',
  ][seed % 4];
  const isCorner = seed % 3 === 0;

  const buildingNo = `${ulpin}-B01`;
  const totalHeight = b?.estimated_height_m || totalFloors * 3.5;
  const dsmHeight = Math.round((totalHeight + ((seed % 10) - 5) * 0.1) * 10) / 10;
  const ocRef = `OC/MNC/${2018 + (seed % 6)}/${String(1000 + (seed % 9000))}`;

  // Unit specific for this floor (Format: ULPIN-Bnn-Unnnn)
  const floorPad = String(floorNum).padStart(2, '0');
  const unitNum = `U${floorPad}01`;
  const unitNo = `${buildingNo}-${unitNum}`;
  const ptin = `PTIN-${20000000 + ((seed * 17) % 80000000)}`;

  const areaSqm = Math.round(b?.area_sqm || 0);
  const carpetSqm = Math.round(areaSqm * 0.85);
  const areaSqft = Math.round(b.area_sqft || areaSqm * 10.7639);
  const carpetSqft = Math.round(carpetSqm * 10.7639);

  let usage = 'Residential (High-Rise Suite)';
  let occupancy = seed % 2 === 0 ? 'Owner Occupied (Self)' : 'Tenant Occupied (Leased)';
  if (floorNum === 1) {
    usage = 'Commercial / Retail Lobby & Banking';
    occupancy = 'Commercial Occupancy';
  } else if (floorNum === totalFloors) {
    usage = 'Penthouse / Terrace Executive Lounge';
    occupancy = 'Owner Occupied (Self)';
  } else if (b.classification === 'Commercial') {
    usage = 'Commercial Corporate Office';
    occupancy = 'Corporate Lessee';
  } else if (b.classification === 'Industrial') {
    usage = 'Industrial Light Assembly & Logistics';
    occupancy = 'Operational Lessee';
  }

  // Segment on this floor (Part-area use taxed on its own area)
  let segmentType = 'Balcony & Utility Service Bay';
  let segmentArea = 24;
  let segmentLicence = `LIC/COMM/UTIL/${2022 + (seed % 3)}/103`;

  if (floorNum === 1) {
    segmentType = 'ATM & Banking Kiosk Zone';
    segmentArea = 18;
    segmentLicence = `LIC/ATM/${2021 + (seed % 4)}/992`;
  } else if (floorNum === totalFloors) {
    segmentType = 'Rooftop Telecom Tower & Hoarding';
    segmentArea = 45;
    segmentLicence = `LIC/TEL/TRAI/${2020 + (seed % 4)}/481`;
  }

  // Owner Link (Ownership history; party in citizen master)
  const firstNames = ['Rajesh', 'Ananya', 'Vikram', 'Pooja', 'Sunil', 'Meera', 'Arjun', 'Sneha', 'Kavita', 'Rohan'];
  const lastNames = ['Sharma', 'Verma', 'Patel', 'Reddy', 'Singhania', 'Nair', 'Iyer', 'Mehta', 'Gupta', 'Chopra'];
  const ownerName = `${firstNames[seed % firstNames.length]} ${lastNames[(seed >> 3) % lastNames.length]}`;
  const coOwner = `${firstNames[(seed + 3) % firstNames.length]} ${lastNames[(seed >> 3) % lastNames.length]}`;
  const partyId = `CITIZEN-IN-${100000 + (seed % 900000)}`;
  const sharePct = '100% (Joint Co-Ownership)';
  const fromDate = `${2016 + (seed % 7)}-0${(seed % 8) + 1}-15`;
  const ownerSource = `Registered Sale Deed (Doc No. ${(seed % 8000) + 1000}/${2016 + (seed % 7)})`;

  // Assessment (Calculated by rules engine DMN)
  const ratePerSqm = b.classification === 'Commercial' ? 750 : 520;
  const arv = Math.round(carpetSqm * ratePerSqm * 12);
  const taxRatesVer = 'DMN-UAV-v2024.2';
  const effectiveFrom = '01-Apr-2024';
  const assessStatus = 'Active & Approved (DMN Rules Engine)';
  const workflowId = `WF-ASSMT-2024-${String(1000 + (seed % 9000))}`;

  // Demand (Immutable lines; corrections by adjustment)
  const taxBase = Math.round(arv * 0.05);
  const healthCess = Math.round(taxBase * 0.1);
  const libraryCess = Math.round(taxBase * 0.05);
  const swmCess = 1800;
  const demandTotal = taxBase + healthCess + libraryCess + swmCess;
  const rebate = Math.round(demandTotal * 0.05);
  const netDue = demandTotal - rebate;

  // Receipt / Adjustment (Maker-checker on adjustments)
  const receiptNo = `RCP-2024-${String(10000 + (seed % 90000))}`;
  const paymentRef = `UPI/TXN/${String(100000000000 + ((seed * 89231) % 900000000000))}`;
  const channel = 'Online Municipal Portal (BBPS Gateway)';
  const realisedAt = `18-May-2024 14:32 IST`;
  const approver = 'MNC-ACCOUNTS-AUTO-VERIFIER';

  // Notice / Petition (Petitions become Legal cases)
  const noticeType = 'Annual Property Tax Return (Form-3 Verified)';
  const servedAt = '15-Nov-2023';
  const servedBy = `Ward Revenue Inspector (${wardId.split(' ')[0]})`;
  const petitionNo = 'None / Regularized Compliance';
  const grounds = 'Compliant self-assessment; zero outstanding encumbrance';
  const legalCaseRef = 'Clean Title (No Injunction or Lis Pendens)';

  return {
    parcel: {
      ulpin,
      provisional_flag: false,
      survey_no: surveyNo,
      ward_id: wardId,
      locality_id: locality,
      geom: `MultiPolygon (EPSG:4326, ${b?.polygon?.length || 4} Vertices)`,
      road_id: `RD-${(seed % 90) + 10}`,
      road_class: roadClass,
      corner_plot: isCorner,
    },
    building: {
      building_no: buildingNo,
      parcel_id: ulpin,
      floors: totalFloors,
      height_m: totalHeight,
      footprint_geom: `MultiPolygon (${b?.polygon?.length || 4} Coordinates)`,
      dsm_height_m: dsmHeight,
      oc_ref: ocRef,
    },
    unit: {
      ptin,
      unit_no: unitNo,
      building_id: buildingNo,
      usage,
      occupancy,
      plinth_area_sqm: areaSqm,
      plinth_area_sqft: areaSqft,
      carpet_area_sqm: carpetSqm,
      carpet_area_sqft: carpetSqft,
      legacy_no: [`OLD-${2017 + (seed % 5)}-${(seed % 800) + 100}`, `MNC-PID-${(seed % 9000) + 1000}`],
    },
    segment: {
      unit_id: unitNo,
      segment_type: segmentType,
      area_sqm: segmentArea,
      licence_ref: segmentLicence,
    },
    owner_link: {
      unit_id: unitNo,
      party_id: partyId,
      party_name: `${ownerName} & ${coOwner}`,
      share_pct: sharePct,
      from_date: fromDate,
      to_date: 'Present (Active)',
      source: ownerSource,
    },
    assessment: {
      unit_id: unitNo,
      type: 'Periodic Revision (DMN Rules Engine)',
      arv: arv,
      tax_rates_version: taxRatesVer,
      effective_from: effectiveFrom,
      status: assessStatus,
      workflow_id: workflowId,
    },
    demand: {
      unit_id: unitNo,
      period: 'H1/H2 FY 2024-25',
      head: `General Tax (₹${taxBase.toLocaleString()}) + Health Cess (₹${healthCess.toLocaleString()}) + Library Cess (₹${libraryCess.toLocaleString()}) + SWM (₹${swmCess.toLocaleString()})`,
      amount: demandTotal,
      rebate: rebate,
      net_amount: netDue,
      due_date: '30-Nov-2024',
      status: 'Paid in Full (Current)',
    },
    receipt_adjustment: {
      receipt_no: receiptNo,
      payment_ref: paymentRef,
      lines: [{ demand_id: `DMD-2024-${floorPad}`, amount: `₹ ${netDue.toLocaleString()}` }],
      channel: channel,
      realised_at: realisedAt,
      adj_type: 'None (Standard Realization)',
      reason: 'Regular Property Tax Realization',
      approver: approver,
    },
    notice_petition: {
      notice_type: noticeType,
      served_at: servedAt,
      served_by: servedBy,
      geo_point: b?.centroid ? `${b.centroid[1]?.toFixed(5) || 0}, ${b.centroid[0]?.toFixed(5) || 0}` : '23.81212, 91.27022',
      petition_no: petitionNo,
      grounds: grounds,
      lgl_case_ref: legalCaseRef,
    },
  };
}

