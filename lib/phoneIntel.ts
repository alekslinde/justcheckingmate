// Phone number intelligence — pure string analysis, no outbound requests.
//
// IMPORTANT LIMITATION: Caller ID (CLI) spoofing is a fundamental property of
// the SS7 signalling protocol. Any number can be presented as the source. The
// real originating number is embedded in carrier ANI/SS7 data that is only
// accessible to telcos and law enforcement. No civilian tool can unmask it.
//
// What we CAN determine from the number format alone:
// - Line type (mobile, fixed, VoIP, premium, free-call, shared-cost)
// - Country / geographic region (for AU fixed lines)
// - Spoofing risk level (based on number patterns and context)
// - Wangiri / premium-rate country risk

export interface PhoneIntel {
  lineType: "mobile" | "fixed" | "voip_likely" | "premium" | "freecall" | "shared_cost" | "emergency" | "unknown";
  region?: string;
  carrierHint?: string;
  country: string;
  isAustralian: boolean;
  wangiriRisk: boolean;
  highScamCountry: boolean;
  spoofingRisk: "low" | "medium" | "high" | "very_high";
  spoofingNotes: string[];
  normalised: string;
}

// ── Wangiri ("one ring") scam prefixes ────────────────────────────────────────
// Victim receives a single ring, calls back out of curiosity, and is charged
// international premium rates. Country codes chosen by operators because their
// local regulations allow high per-minute charges.
const WANGIRI_PREFIXES = [
  "252",  // Somalia
  "269",  // Comoros
  "675",  // Papua New Guinea
  "1242", // Bahamas
  "1246", // Barbados
  "1264", // Anguilla
  "1268", // Antigua and Barbuda
  "1284", // British Virgin Islands
  "1473", // Grenada
  "1649", // Turks and Caicos
  "1664", // Montserrat
  "1758", // Saint Lucia
  "1767", // Dominica
  "1784", // Saint Vincent and the Grenadines
  "1876", // Jamaica
  "1869", // Saint Kitts and Nevis
];

// Country codes frequently associated with scam call operations targeting Australia
const HIGH_SCAM_COUNTRY_CODES: Record<string, string> = {
  "234": "Nigeria",
  "237": "Cameroon",
  "216": "Tunisia",
  "256": "Uganda",
  "260": "Zambia",
  "263": "Zimbabwe",
  "381": "Serbia",
  "385": "Croatia",
  "386": "Slovenia",
  "387": "Bosnia and Herzegovina",
  "389": "North Macedonia",
  "420": "Czech Republic",
  "421": "Slovakia",
};

// NANP (North American Numbering Plan) — Caribbean/Pacific islands that share
// the +1 country code but have their own distinct 3-digit area codes.
const NANP_ISLANDS: Record<string, string> = {
  "1242": "Bahamas",
  "1246": "Barbados",
  "1264": "Anguilla",
  "1268": "Antigua and Barbuda",
  "1284": "British Virgin Islands",
  "1340": "US Virgin Islands",
  "1345": "Cayman Islands",
  "1441": "Bermuda",
  "1473": "Grenada",
  "1649": "Turks and Caicos",
  "1664": "Montserrat",
  "1670": "Northern Mariana Islands",
  "1671": "Guam",
  "1684": "American Samoa",
  "1758": "Saint Lucia",
  "1767": "Dominica",
  "1784": "Saint Vincent and the Grenadines",
  "1787": "Puerto Rico",
  "1809": "Dominican Republic",
  "1829": "Dominican Republic",
  "1868": "Trinidad and Tobago",
  "1869": "Saint Kitts and Nevis",
  "1876": "Jamaica",
  "1939": "Puerto Rico",
};

// Abbreviated international prefix → country name table.
const COUNTRY_CODES: Record<string, string> = {
  "1":   "United States / Canada",
  "7":   "Russia / Kazakhstan",
  "20":  "Egypt",
  "27":  "South Africa",
  "30":  "Greece",
  "31":  "Netherlands",
  "32":  "Belgium",
  "33":  "France",
  "34":  "Spain",
  "36":  "Hungary",
  "39":  "Italy",
  "40":  "Romania",
  "41":  "Switzerland",
  "43":  "Austria",
  "44":  "United Kingdom",
  "45":  "Denmark",
  "46":  "Sweden",
  "47":  "Norway",
  "48":  "Poland",
  "49":  "Germany",
  "51":  "Peru",
  "52":  "Mexico",
  "53":  "Cuba",
  "54":  "Argentina",
  "55":  "Brazil",
  "56":  "Chile",
  "57":  "Colombia",
  "58":  "Venezuela",
  "60":  "Malaysia",
  "61":  "Australia",
  "62":  "Indonesia",
  "63":  "Philippines",
  "64":  "New Zealand",
  "65":  "Singapore",
  "66":  "Thailand",
  "81":  "Japan",
  "82":  "South Korea",
  "84":  "Vietnam",
  "86":  "China",
  "90":  "Turkey",
  "91":  "India",
  "92":  "Pakistan",
  "93":  "Afghanistan",
  "94":  "Sri Lanka",
  "95":  "Myanmar",
  "98":  "Iran",
  "212": "Morocco",
  "213": "Algeria",
  "216": "Tunisia",
  "218": "Libya",
  "220": "Gambia",
  "221": "Senegal",
  "223": "Mali",
  "224": "Guinea",
  "225": "Ivory Coast",
  "226": "Burkina Faso",
  "227": "Niger",
  "228": "Togo",
  "229": "Benin",
  "230": "Mauritius",
  "231": "Liberia",
  "232": "Sierra Leone",
  "233": "Ghana",
  "234": "Nigeria",
  "237": "Cameroon",
  "238": "Cape Verde",
  "239": "Sao Tome and Principe",
  "240": "Equatorial Guinea",
  "241": "Gabon",
  "242": "Republic of Congo",
  "243": "DR Congo",
  "244": "Angola",
  "248": "Seychelles",
  "249": "Sudan",
  "250": "Rwanda",
  "251": "Ethiopia",
  "252": "Somalia",
  "253": "Djibouti",
  "254": "Kenya",
  "255": "Tanzania",
  "256": "Uganda",
  "257": "Burundi",
  "258": "Mozambique",
  "260": "Zambia",
  "261": "Madagascar",
  "263": "Zimbabwe",
  "264": "Namibia",
  "265": "Malawi",
  "266": "Lesotho",
  "267": "Botswana",
  "268": "Eswatini",
  "269": "Comoros",
  "291": "Eritrea",
  "297": "Aruba",
  "298": "Faroe Islands",
  "299": "Greenland",
  "350": "Gibraltar",
  "351": "Portugal",
  "352": "Luxembourg",
  "353": "Ireland",
  "354": "Iceland",
  "355": "Albania",
  "356": "Malta",
  "357": "Cyprus",
  "358": "Finland",
  "359": "Bulgaria",
  "370": "Lithuania",
  "371": "Latvia",
  "372": "Estonia",
  "373": "Moldova",
  "374": "Armenia",
  "375": "Belarus",
  "376": "Andorra",
  "377": "Monaco",
  "380": "Ukraine",
  "381": "Serbia",
  "382": "Montenegro",
  "383": "Kosovo",
  "385": "Croatia",
  "386": "Slovenia",
  "387": "Bosnia and Herzegovina",
  "389": "North Macedonia",
  "420": "Czech Republic",
  "421": "Slovakia",
  "500": "Falkland Islands",
  "501": "Belize",
  "502": "Guatemala",
  "503": "El Salvador",
  "504": "Honduras",
  "505": "Nicaragua",
  "506": "Costa Rica",
  "507": "Panama",
  "509": "Haiti",
  "590": "Guadeloupe",
  "591": "Bolivia",
  "592": "Guyana",
  "593": "Ecuador",
  "594": "French Guiana",
  "595": "Paraguay",
  "596": "Martinique",
  "597": "Suriname",
  "598": "Uruguay",
  "670": "East Timor",
  "672": "Norfolk Island",
  "673": "Brunei",
  "674": "Nauru",
  "675": "Papua New Guinea",
  "676": "Tonga",
  "677": "Solomon Islands",
  "678": "Vanuatu",
  "679": "Fiji",
  "680": "Palau",
  "685": "Samoa",
  "686": "Kiribati",
  "687": "New Caledonia",
  "688": "Tuvalu",
  "689": "French Polynesia",
  "691": "Micronesia",
  "692": "Marshall Islands",
  "850": "North Korea",
  "852": "Hong Kong",
  "853": "Macau",
  "855": "Cambodia",
  "856": "Laos",
  "880": "Bangladesh",
  "886": "Taiwan",
  "960": "Maldives",
  "961": "Lebanon",
  "962": "Jordan",
  "963": "Syria",
  "964": "Iraq",
  "965": "Kuwait",
  "966": "Saudi Arabia",
  "967": "Yemen",
  "968": "Oman",
  "970": "Palestinian Territory",
  "971": "UAE",
  "972": "Israel",
  "973": "Bahrain",
  "974": "Qatar",
  "975": "Bhutan",
  "976": "Mongolia",
  "977": "Nepal",
  "992": "Tajikistan",
  "993": "Turkmenistan",
  "994": "Azerbaijan",
  "995": "Georgia",
  "996": "Kyrgyzstan",
  "998": "Uzbekistan",
};

// AU geographic STD codes → region names (ACMA number plan)
const AU_STD: Record<string, string> = {
  "02": "New South Wales / ACT",
  "03": "Victoria / Tasmania",
  "07": "Queensland",
  "08": "Western Australia / South Australia / Northern Territory",
};

// 04xx prefixes commonly allocated to VoIP/virtual number providers in AU.
// Number portability makes carrier-level attribution unreliable, but these
// ranges are often used by VoIP MVNOs, burner SIM providers, and virtual
// number services — all of which make spoofing trivial.
const AU_VOIP_MOBILE_PREFIXES = new Set([
  "0480", "0481", "0482", "0483", "0484",
  "0485", "0486", "0487", "0488", "0489",
]);

function lookupCountry(digits: string): string {
  if (digits.startsWith("1")) {
    return NANP_ISLANDS[digits.slice(0, 4)] ?? "United States / Canada";
  }
  for (let len = Math.min(digits.length, 3); len >= 1; len--) {
    const c = COUNTRY_CODES[digits.slice(0, len)];
    if (c) return c;
  }
  return "Unknown";
}

export function analysePhone(raw: string): PhoneIntel {
  const cleaned = raw.replace(/[\s\-().+]/g, "");
  const spoofingNotes: string[] = [];
  let spoofingRisk: PhoneIntel["spoofingRisk"] = "low";

  function bump(risk: PhoneIntel["spoofingRisk"]) {
    const order = ["low", "medium", "high", "very_high"];
    if (order.indexOf(risk) > order.indexOf(spoofingRisk)) spoofingRisk = risk;
  }

  // Too short to be a real number
  if (cleaned.length < 6) {
    return {
      lineType: "unknown",
      country: "Unknown",
      isAustralian: false,
      wangiriRisk: false,
      highScamCountry: false,
      spoofingRisk: "very_high",
      spoofingNotes: ["Number is too short to be real — caller ID has been manipulated"],
      normalised: raw.trim(),
    };
  }

  // Obvious fake patterns
  if (/^(\d)\1{5,}$/.test(cleaned)) {
    spoofingNotes.push("Repetitive digit pattern — this number is almost certainly fabricated");
    bump("very_high");
  }

  // ── Australian numbers ─────────────────────────────────────────────────────
  let isAu = false;
  let local = "";

  if (cleaned.startsWith("61") && cleaned.length >= 11) {
    isAu = true;
    local = "0" + cleaned.slice(2);
  } else if (cleaned.startsWith("0") && cleaned.length >= 6) {
    isAu = true;
    local = cleaned;
  }

  if (isAu) {
    if (["000", "112", "106"].includes(cleaned)) {
      return { lineType: "emergency", country: "Australia", isAustralian: true, wangiriRisk: false, highScamCountry: false, spoofingRisk: "low", spoofingNotes: [], normalised: cleaned };
    }

    const norm = local;

    // Premium rate 190x — major red flag
    if (norm.startsWith("0190")) {
      spoofingNotes.push("Premium rate number — calling or texting this costs significantly more than a standard call");
      bump("very_high");
      return { lineType: "premium", country: "Australia", isAustralian: true, wangiriRisk: false, highScamCountry: false, spoofingRisk, spoofingNotes, normalised: `+61 ${norm.slice(1)}` };
    }

    // Free call 1800
    if (norm.startsWith("01800")) {
      spoofingNotes.push("Free-call 1800 numbers are commonly faked by scammers pretending to be banks or government — always verify by calling the number from the organisation's official website");
      bump("medium");
      return { lineType: "freecall", region: "National — free call", country: "Australia", isAustralian: true, wangiriRisk: false, highScamCountry: false, spoofingRisk, spoofingNotes, normalised: `1800 ${norm.slice(5, 8)} ${norm.slice(8)}` };
    }

    // Shared cost 1300 / 13xx
    if (norm.startsWith("01300") || /^0?13\d{2,4}$/.test(norm)) {
      spoofingNotes.push("1300/13xx numbers are commonly faked by scammers pretending to be the ATO, myGov, or Centrelink — verify by calling the number from the government website");
      bump("medium");
      return { lineType: "shared_cost", region: "National — shared cost", country: "Australia", isAustralian: true, wangiriRisk: false, highScamCountry: false, spoofingRisk, spoofingNotes, normalised: norm.startsWith("0") ? norm.slice(1) : norm };
    }

    // Mobile 04xx
    if (norm.startsWith("04") && norm.length === 10) {
      const prefix4 = norm.slice(0, 4);
      const isVoip = AU_VOIP_MOBILE_PREFIXES.has(prefix4);
      if (isVoip) {
        spoofingNotes.push("This number range is commonly used by internet phone and virtual number services — the caller's real identity is easily hidden");
        bump("medium");
      }
      return {
        lineType: isVoip ? "voip_likely" : "mobile",
        region: "Australian mobile",
        carrierHint: isVoip ? "VoIP / virtual number provider (likely)" : undefined,
        country: "Australia",
        isAustralian: true,
        wangiriRisk: false,
        highScamCountry: false,
        spoofingRisk,
        spoofingNotes,
        normalised: `+61 ${norm.slice(1, 3)} ${norm.slice(3, 7)} ${norm.slice(7)}`,
      };
    }

    // Geographic fixed line (STD)
    const stdCode = norm.slice(0, 2);
    if (AU_STD[stdCode] && norm.length === 10) {
      spoofingNotes.push("Landline numbers are easy to fake — a local area code doesn't mean the caller is actually nearby or who they claim to be");
      bump("medium");
      return {
        lineType: "fixed",
        region: AU_STD[stdCode],
        country: "Australia",
        isAustralian: true,
        wangiriRisk: false,
        highScamCountry: false,
        spoofingRisk,
        spoofingNotes,
        normalised: `+61 ${norm.slice(1, 2)} ${norm.slice(2, 6)} ${norm.slice(6)}`,
      };
    }

    // Unrecognised AU format
    spoofingNotes.push("Number doesn't match any known Australian phone format — it may be fabricated or disguised");
    bump("high");
    return { lineType: "unknown", country: "Australia", isAustralian: true, wangiriRisk: false, highScamCountry: false, spoofingRisk, spoofingNotes, normalised: norm };
  }

  // ── International numbers ──────────────────────────────────────────────────
  const intl = cleaned.replace(/^0+/, "");

  const isWangiri = WANGIRI_PREFIXES.some((p) => intl.startsWith(p));
  if (isWangiri) {
    spoofingNotes.push("Country frequently used in Wangiri ('one ring') scams — you receive one ring, call back, and are charged international premium rates");
    bump("very_high");
  }

  const highScamEntry = Object.entries(HIGH_SCAM_COUNTRY_CODES).find(([code]) => intl.startsWith(code));
  if (highScamEntry) {
    spoofingNotes.push(`International call from ${highScamEntry[1]} — a country frequently associated with scam call operations targeting Australia`);
    bump("high");
  }

  const country = lookupCountry(intl);

  return {
    lineType: "unknown",
    country,
    isAustralian: false,
    wangiriRisk: isWangiri,
    highScamCountry: !!highScamEntry || isWangiri,
    spoofingRisk,
    spoofingNotes,
    normalised: intl ? `+${intl}` : raw.trim(),
  };
}
