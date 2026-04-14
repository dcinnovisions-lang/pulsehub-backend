const XLSX = require('xlsx');
const path = require('path');

// Data extracted from the image
const districts = [
  {
    sno: 1,
    district: 'Salem',
    icmMillets: 20,
    mnMixtureMillets: 2,
    fldMillet: 15,
    maizeCultivation: '',
    maizeMNMixture: '',
    maizeMaximSpray: '',
    ipmMaize: '',
    totalMilletsPhy: 37,
    totalMilletsFin: 2.22,
    bundCropPulses: '',
    icmPulses: 15,
    mnMixturePulses: '',
    fldPulses: 5,
    transplantedRedgram: '',
    dapFoliarPulses: ''
  },
  {
    sno: 2,
    district: 'Namakkal',
    icmMillets: '',
    mnMixtureMillets: '',
    fldMillet: 25,
    maizeCultivation: '',
    maizeMNMixture: '',
    maizeMaximSpray: '',
    ipmMaize: '',
    totalMilletsPhy: 25,
    totalMilletsFin: 1.50,
    bundCropPulses: 75,
    icmPulses: '',
    mnMixturePulses: '',
    fldPulses: 5,
    transplantedRedgram: '',
    dapFoliarPulses: ''
  },
  {
    sno: 3,
    district: 'Erode',
    icmMillets: 5,
    mnMixtureMillets: 5,
    fldMillet: 2,
    maizeCultivation: 6,
    maizeMNMixture: '',
    maizeMaximSpray: 45,
    ipmMaize: '',
    totalMilletsPhy: 63,
    totalMilletsFin: 3.78,
    bundCropPulses: '',
    icmPulses: '',
    mnMixturePulses: '',
    fldPulses: '',
    transplantedRedgram: '',
    dapFoliarPulses: ''
  },
  {
    sno: 4,
    district: 'Coimbatore',
    icmMillets: '',
    mnMixtureMillets: '',
    fldMillet: '',
    maizeCultivation: '',
    maizeMNMixture: '',
    maizeMaximSpray: '',
    ipmMaize: '',
    totalMilletsPhy: '',
    totalMilletsFin: '',
    bundCropPulses: '',
    icmPulses: '',
    mnMixturePulses: '',
    fldPulses: '',
    transplantedRedgram: '',
    dapFoliarPulses: ''
  },
  {
    sno: 5,
    district: 'Tiruppur',
    icmMillets: '',
    mnMixtureMillets: '',
    fldMillet: '',
    maizeCultivation: '',
    maizeMNMixture: '',
    maizeMaximSpray: '',
    ipmMaize: '',
    totalMilletsPhy: '',
    totalMilletsFin: '',
    bundCropPulses: '',
    icmPulses: '',
    mnMixturePulses: '',
    fldPulses: '',
    transplantedRedgram: '',
    dapFoliarPulses: ''
  },
  {
    sno: 6,
    district: 'Karur',
    icmMillets: '',
    mnMixtureMillets: '',
    fldMillet: '',
    maizeCultivation: '',
    maizeMNMixture: '',
    maizeMaximSpray: '',
    ipmMaize: '',
    totalMilletsPhy: '',
    totalMilletsFin: '',
    bundCropPulses: '',
    icmPulses: '',
    mnMixturePulses: '',
    fldPulses: '',
    transplantedRedgram: '',
    dapFoliarPulses: ''
  },
  {
    sno: 7,
    district: 'Perambalur',
    icmMillets: '',
    mnMixtureMillets: '',
    fldMillet: '',
    maizeCultivation: '',
    maizeMNMixture: '',
    maizeMaximSpray: '',
    ipmMaize: '',
    totalMilletsPhy: '',
    totalMilletsFin: '',
    bundCropPulses: '',
    icmPulses: '',
    mnMixturePulses: '',
    fldPulses: '',
    transplantedRedgram: '',
    dapFoliarPulses: ''
  },
  {
    sno: 8,
    district: 'Thanjavur',
    icmMillets: '',
    mnMixtureMillets: '',
    fldMillet: '',
    maizeCultivation: '',
    maizeMNMixture: '',
    maizeMaximSpray: '',
    ipmMaize: '',
    totalMilletsPhy: '',
    totalMilletsFin: '',
    bundCropPulses: '',
    icmPulses: '',
    mnMixturePulses: '',
    fldPulses: '',
    transplantedRedgram: '',
    dapFoliarPulses: ''
  },
  {
    sno: 9,
    district: 'Nagapattinam',
    icmMillets: '',
    mnMixtureMillets: '',
    fldMillet: '',
    maizeCultivation: '',
    maizeMNMixture: '',
    maizeMaximSpray: '',
    ipmMaize: '',
    totalMilletsPhy: '',
    totalMilletsFin: '',
    bundCropPulses: '',
    icmPulses: '',
    mnMixturePulses: '',
    fldPulses: '',
    transplantedRedgram: '',
    dapFoliarPulses: ''
  },
  {
    sno: 10,
    district: 'Pudukkottai',
    icmMillets: '',
    mnMixtureMillets: '',
    fldMillet: '',
    maizeCultivation: '',
    maizeMNMixture: '',
    maizeMaximSpray: '',
    ipmMaize: '',
    totalMilletsPhy: '',
    totalMilletsFin: '',
    bundCropPulses: '',
    icmPulses: '',
    mnMixturePulses: '',
    fldPulses: '',
    transplantedRedgram: '',
    dapFoliarPulses: ''
  },
  {
    sno: 11,
    district: 'Mayiladuthurai',
    icmMillets: '',
    mnMixtureMillets: '',
    fldMillet: '',
    maizeCultivation: '',
    maizeMNMixture: '',
    maizeMaximSpray: '',
    ipmMaize: '',
    totalMilletsPhy: '',
    totalMilletsFin: '',
    bundCropPulses: '',
    icmPulses: '',
    mnMixturePulses: '',
    fldPulses: '',
    transplantedRedgram: '',
    dapFoliarPulses: ''
  }
];

// Total row data
const totalRow = {
  sno: '',
  district: 'Total',
  icmMillets: 35,
  mnMixtureMillets: 17,
  fldMillet: 70,
  maizeCultivation: 6,
  maizeMNMixture: 45,
  maizeMaximSpray: 86,
  ipmMaize: 27,
  totalMilletsPhy: 286,
  totalMilletsFin: 17.16,
  bundCropPulses: 80,
  icmPulses: 90,
  mnMixturePulses: 20,
  fldPulses: 20,
  transplantedRedgram: 0,
  dapFoliarPulses: 0
};

// Create workbook
const workbook = XLSX.utils.book_new();

// Prepare data array for Excel
const excelData = [];

// First header row (main categories)
const headerRow1 = [
  'S.No',
  'Name of the District',
  'ICM in Millets',
  'MN Mixture Millets',
  'FLD on Millet / FLD on New Millet Variety / Millets Seed Kit',
  'Maize Cultivation practices',
  'Maize MN Mixture and Booster',
  'TNAU Maize Maxim Spray',
  'IPM in Maize FAW',
  'Total Millets',
  '', // Empty cell for second Total Millets column
  'Bund Crop - Pulses',
  'ICM in Pulses',
  'MN Mixture in pulses',
  'FLD in Pulses',
  'Transplanted Redgram',
  'DAP Foilar spray in Pulses'
];

// Second header row (sub-categories - all Phy except Total Millets which has Phy and Fin)
const headerRow2 = [
  '',
  '',
  'Phy',
  'Phy',
  'Phy',
  'Phy',
  'Phy',
  'Phy',
  'Phy',
  'Phy',
  'Fin',
  'Phy',
  'Phy',
  'Phy',
  'Phy',
  'Phy',
  'Phy'
];

excelData.push(headerRow1);
excelData.push(headerRow2);

// Add district rows
districts.forEach(district => {
  excelData.push([
    district.sno,
    district.district,
    district.icmMillets,
    district.mnMixtureMillets,
    district.fldMillet,
    district.maizeCultivation,
    district.maizeMNMixture,
    district.maizeMaximSpray,
    district.ipmMaize,
    district.totalMilletsPhy,
    district.totalMilletsFin,
    district.bundCropPulses,
    district.icmPulses,
    district.mnMixturePulses,
    district.fldPulses,
    district.transplantedRedgram,
    district.dapFoliarPulses
  ]);
});

// Add total row
excelData.push([
  totalRow.sno,
  totalRow.district,
  totalRow.icmMillets,
  totalRow.mnMixtureMillets,
  totalRow.fldMillet,
  totalRow.maizeCultivation,
  totalRow.maizeMNMixture,
  totalRow.maizeMaximSpray,
  totalRow.ipmMaize,
  totalRow.totalMilletsPhy,
  totalRow.totalMilletsFin,
  totalRow.bundCropPulses,
  totalRow.icmPulses,
  totalRow.mnMixturePulses,
  totalRow.fldPulses,
  totalRow.transplantedRedgram,
  totalRow.dapFoliarPulses
]);

// Create worksheet from data
const worksheet = XLSX.utils.aoa_to_sheet(excelData);

// Set column widths for better readability
const colWidths = [
  { wch: 8 },   // S.No
  { wch: 20 },  // Name of the District
  { wch: 12 },  // ICM in Millets
  { wch: 15 },  // MN Mixture Millets
  { wch: 50 },  // FLD on Millet...
  { wch: 20 },  // Maize Cultivation practices
  { wch: 22 },  // Maize MN Mixture and Booster
  { wch: 20 },  // TNAU Maize Maxim Spray
  { wch: 15 },  // IPM in Maize FAW
  { wch: 12 },  // Total Millets (Phy)
  { wch: 12 },  // Total Millets (Fin)
  { wch: 18 },  // Bund Crop - Pulses
  { wch: 12 },  // ICM in Pulses
  { wch: 18 },  // MN Mixture in pulses
  { wch: 12 },  // FLD in Pulses
  { wch: 20 },  // Transplanted Redgram
  { wch: 22 }   // DAP Foilar spray in Pulses
];

worksheet['!cols'] = colWidths;

// Add worksheet to workbook
XLSX.utils.book_append_sheet(workbook, worksheet, 'Agricultural Data');

// Generate filename with timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const filename = `agricultural_data_${timestamp}.xlsx`;
const filepath = path.join(__dirname, '..', '..', filename);

// Write file
XLSX.writeFile(workbook, filepath);

console.log(`✅ Excel file created successfully!`);
console.log(`📁 Location: ${filepath}`);
console.log(`📊 Total rows: ${excelData.length} (2 header rows + ${districts.length} district rows + 1 total row)`);
console.log(`📋 Total columns: ${headerRow1.length}`);




