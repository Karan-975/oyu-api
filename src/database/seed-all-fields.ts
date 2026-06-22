import { query, execute } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

interface SeedField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'email' | 'phone' | 'textarea' | 'dropdown' | 'radio' | 'checkbox' | 'date' | 'gps' | 'image_upload' | 'signature';
  required?: boolean;
  scoring?: boolean;
  options?: { label: string; value: string; score?: number }[];
}

interface SeedSection {
  title: string;
  description?: string;
  fields: SeedField[];
}

// 1. Borehole Recce spec (31+ fields, 4 sections)
const recceSections: SeedSection[] = [
  {
    title: 'Technical Assessment',
    description: 'Technical measurements and pump inspection',
    fields: [
      {
        key: 'functional_status',
        label: 'Functional Status',
        type: 'dropdown',
        required: true,
        scoring: true,
        options: [
          { label: 'Functional', value: 'functional', score: 10 },
          { label: 'Partially Functional', value: 'partially_functional', score: 5 },
          { label: 'Non Functional', value: 'non_functional', score: 0 }
        ]
      },
      { key: 'static_water_level', label: 'Static Water Level (meters)', type: 'number' },
      {
        key: 'casing_condition',
        label: 'Casing Condition',
        type: 'dropdown',
        required: true,
        scoring: true,
        options: [
          { label: 'Good', value: 'good', score: 10 },
          { label: 'Corroded', value: 'corroded', score: 5 },
          { label: 'Fractured', value: 'fractured', score: 0 }
        ]
      },
      {
        key: 'is_manual_handpump',
        label: 'Is Manual Handpump?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      }
    ]
  },
  {
    title: 'Pump & Cylinder Condition',
    description: 'Handle and internal components condition',
    fields: [
      {
        key: 'pump_strokes_type',
        label: 'Pump handle strokes to fetch water',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Normal strokes', value: 'Normal strokes' },
          { label: 'Excessive strokes', value: 'Excessive strokes' },
          { label: 'No water', value: 'No water' }
        ]
      },
      {
        key: 'visible_leakage',
        label: 'Is there any visible leakage around pump?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      {
        key: 'issue_repairable',
        label: 'Does the issue appear repairable?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Minor repair', value: 'Minor repair' },
          { label: 'Major repair', value: 'Major repair' },
          { label: 'Full pump replacement', value: 'Full pump replacement' },
          { label: 'Further inspection required', value: 'Further inspection required' }
        ]
      }
    ]
  },
  {
    title: 'Water Access & Usage',
    description: 'Water quality, alternative sources, contamination risk, usage behavior',
    fields: [
      {
        key: 'drinking_water_source',
        label: 'Is this borehole the main drinking water source in the area?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      {
        key: 'households_served',
        label: 'Number of households served',
        type: 'dropdown',
        required: true,
        options: [
          { label: '<50', value: '<50' },
          { label: '50–100', value: '50–100' },
          { label: '100–150', value: '100–150' },
          { label: '150–200', value: '150–200' },
          { label: '200–500', value: '200–500' },
          { label: '>500', value: '>500' }
        ]
      },
      {
        key: 'alternative_water_sources',
        label: 'Nearby alternative water sources',
        type: 'checkbox',
        options: [
          { label: 'River / Stream', value: 'River / Stream' },
          { label: 'Canal', value: 'Canal' },
          { label: 'Pond / Lake', value: 'Pond / Lake' },
          { label: 'Open Well', value: 'Open Well' },
          { label: 'Hand-dug Well', value: 'Hand-dug Well' },
          { label: 'Spring', value: 'Spring' },
          { label: 'Reservoir', value: 'Reservoir' },
          { label: 'Rainwater / Tanker', value: 'Rainwater / Tanker' },
          { label: 'Piped Water / Community Point', value: 'Piped Water / Community Point' },
          { label: 'Other', value: 'Other' }
        ]
      },
      {
        key: 'water_clear',
        label: 'Is the water clear (no visible particles)?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      {
        key: 'water_color',
        label: 'Is there any yellow, brown, green, or cloudy color?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      {
        key: 'water_smell_taste',
        label: 'Any smell or unusual taste from water?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      {
        key: 'visible_particles',
        label: 'Are there visible particles, mud, or sand in the water?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      {
        key: 'water_quality_tested',
        label: 'Water Quality Testing Done Before?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      {
        key: 'known_quality_issues',
        label: 'Any known Water quality issues (fluoride, salinity, etc.)?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' },
          { label: 'Unknown', value: 'Unknown' }
        ]
      },
      { key: 'known_quality_issues_details', label: 'If yes, please specify details', type: 'text' },
      {
        key: 'contamination_risk',
        label: 'Is there any risk of contamination nearby (toilets, drainage)?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      {
        key: 'boil_water_drinking',
        label: 'Do people in the area boil water for drinking purposes?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      }
    ]
  },
  {
    title: 'Additional Observations & Priority',
    description: 'Final recommendations and comments',
    fields: [
      {
        key: 'nearby_borehole_1km',
        label: 'Any nearby borehole within 1 km?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' },
          { label: 'Unknown', value: 'Unknown' }
        ]
      },
      {
        key: 'suitable_for_rehabilitation',
        label: 'Is the borehole suitable for rehabilitation?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' },
          { label: 'Needs technical inspection', value: 'Needs technical inspection' }
        ]
      },
      {
        key: 'site_feasibility_priority',
        label: 'Overall site feasibility / priority',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'High', value: 'High' },
          { label: 'Medium', value: 'Medium' },
          { label: 'Low', value: 'Low' }
        ]
      },
      {
        key: 'repair_required',
        label: 'Repair required',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Minor repair', value: 'Minor repair' },
          { label: 'Major repair', value: 'Major repair' },
          { label: 'Full pump replacement', value: 'Full pump replacement' },
          { label: 'New Drill', value: 'New Drill' }
        ]
      },
      { key: 'surveyor_remarks', label: 'Surveyor Remarks', type: 'textarea' }
    ]
  }
];

// 2. Baseline Survey spec (45+ fields, 2 sections)
const baselineSections: SeedSection[] = [
  {
    title: 'Household Baseline Survey',
    description: 'Demographics, usage, health, fuel and consent',
    fields: [
      { key: 'survey_date', label: 'Date of Survey', type: 'date', required: true },
      { key: 'respondent_name', label: 'Respondent Name', type: 'text', required: true },
      {
        key: 'gender',
        label: 'Gender',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Male', value: 'Male' },
          { label: 'Female', value: 'Female' }
        ]
      },
      { key: 'contact_number', label: 'Contact Number', type: 'phone' },
      {
        key: 'survey_method',
        label: 'Survey Method',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Face-to-Face', value: 'Face-to-Face' },
          { label: 'Remote', value: 'Remote' },
          { label: 'Telephonic', value: 'Telephonic' }
        ]
      },
      {
        key: 'community_type',
        label: 'Type of Community',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Rural', value: 'Rural' },
          { label: 'Urban', value: 'Urban' },
          { label: 'Semi-Urban', value: 'Semi-Urban' }
        ]
      },
      { key: 'household_members', label: 'Number of Household Members', type: 'number', required: true },
      {
        key: 'primary_drinking_source',
        label: 'What is the nearby primary drinking water source?',
        type: 'checkbox',
        required: true,
        options: [
          { label: 'River / Rainwater', value: 'River / Rainwater' },
          { label: 'Spring (Protected)', value: 'Spring (Protected)' },
          { label: 'Spring (Unprotected)', value: 'Spring (Unprotected)' },
          { label: 'Surface Water', value: 'Surface Water' },
          { label: 'Lake / Pond', value: 'Lake / Pond' },
          { label: 'Borehole', value: 'Borehole' },
          { label: 'Tap Water', value: 'Tap Water' },
          { label: 'Well', value: 'Well' },
          { label: 'Other', value: 'Other' }
        ]
      },
      { key: 'months_non_functional', label: 'Months borehole has been non-functional', type: 'number' },
      {
        key: 'time_to_fetch_water',
        label: 'Time taken to fetch water (roundtrip)',
        type: 'dropdown',
        required: true,
        options: [
          { label: '< 30 mins', value: '< 30 mins' },
          { label: '> 30 mins', value: '> 30 mins' },
          { label: '> 1 hour', value: '> 1 hour' }
        ]
      },
      {
        key: 'distance_to_source',
        label: 'Distance to water source (kms)',
        type: 'dropdown',
        required: true,
        options: [
          { label: '< 2 km', value: '< 2 km' },
          { label: '> 2 km', value: '> 2 km' },
          { label: '3 to 5 km', value: '3 to 5 km' },
          { label: '> 5 km', value: '> 5 km' }
        ]
      },
      {
        key: 'who_fetches_water',
        label: 'Who fetches water mostly in family?',
        type: 'checkbox',
        required: true,
        options: [
          { label: 'Male', value: 'Male' },
          { label: 'Female', value: 'Female' },
          { label: 'Children', value: 'Children' }
        ]
      },
      {
        key: 'fetching_frequency',
        label: 'Frequency of fetching water',
        type: 'dropdown',
        required: true,
        options: [
          { label: '>1 times/day', value: '>1 times/day' },
          { label: '>3 times/day', value: '>3 times/day' },
          { label: '>5 times/day', value: '>5 times/day' }
        ]
      },
      {
        key: 'water_consumption_daily',
        label: 'Water consumption (litres/day)',
        type: 'dropdown',
        required: true,
        options: [
          { label: '>10 L', value: '>10 L' },
          { label: '>15 L', value: '>15 L' },
          { label: '>20 L', value: '>20 L' },
          { label: '>30 L', value: '>30 L' }
        ]
      },
      {
        key: 'boil_drinking_water',
        label: 'Do you boil water for drinking?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      {
        key: 'stove_type_boiling',
        label: 'Stove/Device used for boiling water',
        type: 'dropdown',
        options: [
          { label: 'Three-stone', value: 'Three-stone' },
          { label: 'Improved Cookstove', value: 'Improved Cookstove' },
          { label: 'Electric', value: 'Electric' },
          { label: 'Other', value: 'Other' }
        ]
      },
      { key: 'time_spent_boiling', label: 'Time spent in boiling water (mins/day)', type: 'number' },
      { key: 'water_boiled_quantity', label: 'Water boiled (litres/day)', type: 'number' },
      {
        key: 'fuel_type_boiling',
        label: 'Fuel type used in stove',
        type: 'dropdown',
        options: [
          { label: 'Wood', value: 'Wood' },
          { label: 'Charcoal', value: 'Charcoal' },
          { label: 'Pellets', value: 'Pellets' },
          { label: 'Briquettes', value: 'Briquettes' },
          { label: 'LPG', value: 'LPG' },
          { label: 'Electricity', value: 'Electricity' },
          { label: 'Other', value: 'Other' }
        ]
      },
      {
        key: 'fuel_quantity_daily',
        label: 'Daily Fuel quantity used',
        type: 'dropdown',
        options: [
          { label: '>10 Kg', value: '>10 Kg' },
          { label: '>15 Kg', value: '>15 Kg' },
          { label: '>20 Kg', value: '>20 Kg' },
          { label: '>25 Kg', value: '>25 Kg' }
        ]
      },
      { key: 'daily_fuel_cost', label: 'Daily fuel cost (currency)', type: 'number' },
      {
        key: 'illness_water_family',
        label: 'Any illness due to water in family?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      {
        key: 'who_gets_affected',
        label: 'Who mostly gets affected?',
        type: 'checkbox',
        options: [
          { label: 'Male', value: 'Male' },
          { label: 'Female', value: 'Female' },
          { label: 'Children', value: 'Children' }
        ]
      },
      {
        key: 'common_illnesses',
        label: 'Common illnesses in family',
        type: 'checkbox',
        options: [
          { label: 'Diarrhoea', value: 'Diarrhoea' },
          { label: 'Stomach Infection', value: 'Stomach Infection' },
          { label: 'Skin Infection', value: 'Skin Infection' },
          { label: 'Vomiting', value: 'Vomiting' },
          { label: 'Fever', value: 'Fever' }
        ]
      },
      {
        key: 'boiling_issues_faced',
        label: 'Issues faced due to boiling wood/smoke',
        type: 'checkbox',
        options: [
          { label: 'Smoke / Breathing', value: 'Smoke / Breathing' },
          { label: 'Eye irritation', value: 'Eye irritation' },
          { label: 'Other', value: 'Other' }
        ]
      },
      {
        key: 'extra_medical_expenses',
        label: 'Extra medical expenses due to illness?',
        type: 'dropdown',
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      { key: 'upload_stove_image', label: 'Upload stove image', type: 'image_upload' },
      { key: 'upload_beneficiary_photo', label: 'Upload photo of Beneficiary', type: 'image_upload' },
      {
        key: 'beneficiary_consent',
        label: 'I hereby provide my consent for the survey data collection and use.',
        type: 'checkbox',
        required: true,
        options: [
          { label: 'I agree', value: 'agree' }
        ]
      }
    ]
  },
  {
    title: 'Community Representative Survey',
    description: 'Local authority validation and carbon project agreements',
    fields: [
      { key: 'rep_name', label: 'Representative Name', type: 'text', required: true },
      {
        key: 'rep_role',
        label: 'Role',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Representative', value: 'Representative' },
          { label: 'Leader', value: 'Leader' },
          { label: 'Caretaker', value: 'Caretaker' }
        ]
      },
      {
        key: 'is_borehole_functional',
        label: 'Is the borehole currently functional?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' },
          { label: 'Partially', value: 'Partially' }
        ]
      },
      { key: 'breakdown_reason', label: 'Reason for breakdown (if non-functional)', type: 'text' },
      {
        key: 'used_for_drinking',
        label: 'Is the borehole used for drinking?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      {
        key: 'households_using_borehole',
        label: 'Total number of households using borehole',
        type: 'dropdown',
        required: true,
        options: [
          { label: '<50', value: '<50' },
          { label: '50–100', value: '50–100' },
          { label: '100–150', value: '100–150' },
          { label: '150–200', value: '150–200' },
          { label: '200–500', value: '200–500' }
        ]
      },
      {
        key: 'mainly_responsible_collection',
        label: 'Who is mainly responsible for water collection?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Women', value: 'Women' },
          { label: 'Children', value: 'Children' },
          { label: 'All', value: 'All' }
        ]
      },
      { key: 'alternative_water_source', label: 'Alternative water source nearby', type: 'text' },
      {
        key: 'boil_water_practice',
        label: 'Do people boil water before consuming?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      {
        key: 'commonly_used_fuel',
        label: 'Commonly used fuel for boiling water',
        type: 'dropdown',
        options: [
          { label: 'Firewood', value: 'Firewood' },
          { label: 'Charcoal', value: 'Charcoal' },
          { label: 'Other', value: 'Other' }
        ]
      },
      {
        key: 'illness_common_unsafe_water',
        label: 'Is illness from unsafe water common in the area?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      {
        key: 'total_time_collect_daily',
        label: 'Total time to collect water daily (mins)',
        type: 'dropdown',
        required: true,
        options: [
          { label: '< 30 mins', value: '< 30 mins' },
          { label: '> 30 mins', value: '> 30 mins' },
          { label: '> 1 hour', value: '> 1 hour' }
        ]
      },
      {
        key: 'water_committee_exists',
        label: 'Any Water committee exists for maintenance?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      {
        key: 'maintenance_fee_collected',
        label: 'Any Maintenance fee collected?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      {
        key: 'agree_rehabilitation',
        label: 'Do you agree to the rehabilitation of this borehole?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      {
        key: 'consent_carbon_project',
        label: 'Can you give consent for the carbon credit project?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      { key: 'agreement_details', label: 'Official agreement text / details', type: 'textarea' },
      { key: 'rep_signature', label: 'Signature of representative', type: 'signature' }
    ]
  }
];

// 3. LSC Consultation spec (15+ fields, 2 sections)
const lscSections: SeedSection[] = [
  {
    title: 'Basic Details',
    description: 'Meeting organizer and attendance documentation',
    fields: [
      { key: 'meeting_date', label: 'Date of Meeting', type: 'date', required: true },
      { key: 'meeting_venue', label: 'Venue / Location', type: 'text', required: true },
      { key: 'organizer_details', label: 'Organizer details', type: 'text', required: true },
      {
        key: 'purpose_explained',
        label: 'Purpose explained in the meeting?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      { key: 'total_attendees', label: 'Total attendees in Meeting', type: 'number', required: true },
      {
        key: 'attendance_sheet_filled',
        label: 'Attendance sheet filled & signed properly?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      { key: 'upload_attendance_sheet', label: 'Upload photo of attendance sheet', type: 'image_upload' },
      { key: 'minutes_of_meeting', label: 'Minutes of Meeting (MoM) text', type: 'textarea' },
      { key: 'upload_fpic_forms', label: 'Upload photos of FPIC forms', type: 'image_upload' }
    ]
  },
  {
    title: 'Feedback from Community',
    description: 'Community feedback, support, expectations and gender checks',
    fields: [
      {
        key: 'project_explained_clearly',
        label: 'Did the Project explained clearly?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      {
        key: 'opportunity_ask_questions',
        label: 'Did you have the opportunity to ask questions?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      {
        key: 'expecting_improved_access',
        label: 'Are you expecting improved water access after Borehole Rehabilitation?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      { key: 'concerns_suggestions', label: 'Any concerns / suggestions from project?', type: 'textarea' },
      {
        key: 'women_participation',
        label: 'Did we have women participation in the meeting?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      {
        key: 'support_rehabilitation',
        label: 'Do you support the Borehole Rehabilitation project?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      }
    ]
  }
];

// 4. Monitoring Survey spec (28+ fields, 5 sections)
const monitoringSections: SeedSection[] = [
  {
    title: 'Basic Information',
    description: 'Initial monitoring parameters',
    fields: [
      { key: 'surveyor_name', label: 'Name of Surveyor', type: 'text', required: true },
      { key: 'monitoring_date', label: 'Date of Survey', type: 'date', required: true },
      { key: 'rehab_date', label: 'Date of Borehole Rehabilitation', type: 'date' },
      { key: 'community_representative_name', label: 'Community Representative Name', type: 'text', required: true },
      { key: 'contact_number', label: 'Contact Number', type: 'phone' },
      {
        key: 'gender',
        label: 'Gender',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Male', value: 'Male' },
          { label: 'Female', value: 'Female' }
        ]
      },
      { key: 'address', label: 'Landmark, Village, State details', type: 'textarea' }
    ]
  },
  {
    title: 'Borehole Status & Functionality',
    description: 'Rehabilitated pump condition and operation',
    fields: [
      {
        key: 'borehole_operational',
        label: 'Is the rehabilitated borehole operational?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      { key: 'parts_fixed', label: 'Which parts were fixed during rehabilitation?', type: 'textarea' },
      {
        key: 'current_drinking_source',
        label: 'Current source of drinking water',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Borehole', value: 'Borehole' },
          { label: 'Nearby River', value: 'Nearby River' }
        ]
      },
      { key: 'distance_from_household', label: 'Distance of borehole from household (Km)', type: 'number' },
      {
        key: 'water_availability_daily',
        label: 'Water availability per day',
        type: 'dropdown',
        required: true,
        options: [
          { label: '<4 hrs', value: '<4 hrs' },
          { label: '4–6 hrs', value: '4–6 hrs' },
          { label: '6–8 hrs', value: '6–8 hrs' },
          { label: '>8 hrs', value: '>8 hrs' }
        ]
      },
      {
        key: 'time_to_fetch_water_mon',
        label: 'Time taken to fetch water daily',
        type: 'dropdown',
        required: true,
        options: [
          { label: '>10 mins', value: '>10 mins' },
          { label: '>15 mins', value: '>15 mins' },
          { label: '>20 mins', value: '>20 mins' }
        ]
      },
      {
        key: 'water_quantity_fetched',
        label: 'Quantity of water fetched daily',
        type: 'dropdown',
        required: true,
        options: [
          { label: '>10 L', value: '>10 L' },
          { label: '>15 L', value: '>15 L' },
          { label: '>20 L', value: '>20 L' },
          { label: '>30 L', value: '>30 L' }
        ]
      }
    ]
  },
  {
    title: 'Water Access Improvement',
    description: 'Post-rehab water consumption patterns',
    fields: [
      {
        key: 'water_per_person_daily',
        label: 'Water available per person per day',
        type: 'dropdown',
        required: true,
        options: [
          { label: '<5 L', value: '<5 L' },
          { label: '5–10 L', value: '5–10 L' },
          { label: '10–20 L', value: '10–20 L' },
          { label: ' >20 L', value: ' >20 L' }
        ]
      },
      {
        key: 'fetching_frequency_mon',
        label: 'Frequency of fetching water',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Daily', value: 'Daily' },
          { label: 'Alternate days', value: 'Alternate days' },
          { label: 'Twice a week', value: 'Twice a week' },
          { label: 'Weekly', value: 'Weekly' }
        ]
      },
      {
        key: 'consistent_access',
        label: 'Consistent access to borehole?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      }
    ]
  },
  {
    title: 'Fuel Use & Cost Impact',
    description: 'Economic benefit and stove usage impact',
    fields: [
      {
        key: 'reduction_fuel_expenses',
        label: 'Reduction in fuel expenses?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      {
        key: 'cookstove_used_boil',
        label: 'Is cookstove still used to boil water?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      {
        key: 'previous_fuel_used',
        label: 'Previous fuel used for boiling',
        type: 'dropdown',
        options: [
          { label: 'Firewood', value: 'Firewood' },
          { label: 'Charcoal', value: 'Charcoal' },
          { label: 'Other', value: 'Other' }
        ]
      },
      {
        key: 'dependency_reduced',
        label: 'Has dependency on traditional fuel reduced?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      }
    ]
  },
  {
    title: 'Health & Social Impact',
    description: 'Health improvements, training and photo attachments',
    fields: [
      {
        key: 'health_improvement',
        label: 'Improvement in health after using borehole?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      {
        key: 'training_received',
        label: 'Any training received on borehole use/maintenance?',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Yes', value: 'Yes' },
          { label: 'No', value: 'No' }
        ]
      },
      {
        key: 'maintenance_frequency',
        label: 'Frequency of borehole maintenance',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Every 3 months', value: 'Every 3 months' },
          { label: 'Every 6 months', value: 'Every 6 months' },
          { label: 'Annually', value: 'Annually' }
        ]
      },
      { key: 'upload_monitoring_photo', label: 'Upload rehabilitated borehole image', type: 'image_upload' }
    ]
  }
];

async function seedSurvey(moduleId: string, sections: SeedSection[]) {
  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const sec = sections[sIdx];
    const secId = uuidv4();
    await execute(
      `INSERT INTO form_sections (id, module_id, title, description, order_index, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [secId, moduleId, sec.title, sec.description ?? null, sIdx]
    );

    for (let fIdx = 0; fIdx < sec.fields.length; fIdx++) {
      const f = sec.fields[fIdx];
      const fId = uuidv4();
      await execute(
        `INSERT INTO form_fields (id, section_id, label, field_key, field_type, placeholder, is_required, has_scoring, order_index)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [fId, secId, f.label, f.key, f.type, null, f.required ? 1 : 0, f.scoring ? 1 : 0, fIdx]
      );

      if (f.options) {
        for (let oIdx = 0; oIdx < f.options.length; oIdx++) {
          const opt = f.options[oIdx];
          await execute(
            `INSERT INTO field_options (id, field_id, label, value, score, order_index)
             VALUES (UUID(), ?, ?, ?, ?, ?)`,
            [fId, opt.label, opt.value, opt.score ?? null, oIdx]
          );
        }
      }
    }
  }
}

async function main() {
  try {
    console.log('Connected to DB.');

    // Fetch form modules
    const modules = await query<any>('SELECT id, slug FROM form_modules');
    const recceModule = modules.find(m => m.slug === 'borehole_recce');
    const baselineModule = modules.find(m => m.slug === 'baseline_survey');
    const lscModule = modules.find(m => m.slug === 'lsc_survey');
    const monitoringModule = modules.find(m => m.slug === 'monitoring_survey');

    if (!recceModule || !baselineModule || !lscModule || !monitoringModule) {
      console.error('Form modules not found! Run npm run db:seed first.');
      process.exit(1);
    }

    // Clear old form configuration
    console.log('Clearing old sections, fields and options for core modules...');
    const moduleIds = [recceModule.id, baselineModule.id, lscModule.id, monitoringModule.id];
    const sections = await query<any>('SELECT id FROM form_sections WHERE module_id IN (?)', [moduleIds]);
    const sectionIds = sections.map(s => s.id);
    
    if (sectionIds.length > 0) {
      const fields = await query<any>('SELECT id FROM form_fields WHERE section_id IN (?)', [sectionIds]);
      const fieldIds = fields.map(f => f.id);
      
      if (fieldIds.length > 0) {
        await execute('DELETE FROM field_options WHERE field_id IN (?)', [fieldIds]);
        await execute('DELETE FROM form_fields WHERE id IN (?)', [fieldIds]);
      }
      await execute('DELETE FROM form_sections WHERE id IN (?)', [sectionIds]);
    }
    console.log('Cleared successfully.');

    // Seed sections & fields
    console.log('Seeding Borehole Recce fields...');
    await seedSurvey(recceModule.id, recceSections);

    console.log('Seeding Baseline Survey fields...');
    await seedSurvey(baselineModule.id, baselineSections);

    console.log('Seeding LSC Consultation fields...');
    await seedSurvey(lscModule.id, lscSections);

    console.log('Seeding Monitoring Survey fields...');
    await seedSurvey(monitoringModule.id, monitoringSections);

    console.log('Seeding Complete!');
    process.exit(0);
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exit(1);
  }
}

main();
