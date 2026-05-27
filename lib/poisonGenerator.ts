// Generates plausible-but-completely-fake Australian personal data
// to feed to scammers, wasting their time and polluting their databases.

export interface PoisonProfile {
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  bankName: string;
  bsb: string;
  accountNumber: string;
  tfn: string;
  medicareNumber: string;
  creditCardNumber: string;
  creditCardExpiry: string;
  creditCardCvv: string;
  password: string;
  ipAddress: string;
  deviceId: string;
  notes: string; // Flavour text
}

// ────────────────────────────────────────────────────────────────────────────
// Data pools
// ────────────────────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  "Bruce", "Sheila", "Kylie", "Gary", "Karen", "Dale", "Bazza", "Dazza",
  "Tazza", "Chazza", "Sharon", "Darren", "Warren", "Narelle", "Raelene",
  "Tracey", "Leanne", "Simone", "Mick", "Cobber", "Johnno", "Robbo",
  "Dingo", "Bluey", "Wazza", "Gazza", "Thommo", "Hendo", "Macca",
  "Davo", "Stevo", "Thommo", "Watto", "Bretto", "Muzza",
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Wilson", "Taylor",
  "Anderson", "Thomas", "Jackson", "Harris", "Martin", "Thompson", "Garcia",
  "Nguyen", "Lee", "Robinson", "Walker", "Hall", "Young", "Hill",
  "Scott", "Green", "Baker", "Mitchell", "Campbell", "Turner", "Evans",
  "Footy", "Dunny", "Cobber", "Ripper", "Arvo", "Brekky",
];

const AU_STREETS = [
  "Wattle Street", "Gum Tree Lane", "Kangaroo Court", "Eucalyptus Drive",
  "Boomerang Avenue", "Billabong Road", "Koala Court", "Outback Way",
  "Vegemite Lane", "Pavlova Place", "Lamington Drive", "Snag Street",
  "Durack Circuit", "Flinders Way", "Burke Road", "Bondi Parade",
  "Harbour View Drive", "Reef Street", "Croc Lane", "Gday Place",
  "Federation Avenue", "Anzac Parade", "Digger Drive", "Strine Street",
];

const AU_SUBURBS_BY_STATE: Record<string, Array<[string, string]>> = {
  NSW: [["Penrith", "2750"], ["Parramatta", "2150"], ["Blacktown", "2148"], ["Campbelltown", "2560"], ["Liverpool", "2170"], ["Gosford", "2250"]],
  VIC: [["Dandenong", "3175"], ["Frankston", "3199"], ["Ringwood", "3134"], ["Footscray", "3011"], ["Sunshine", "3020"], ["Preston", "3072"]],
  QLD: [["Ipswich", "4305"], ["Caboolture", "4510"], ["Rockhampton", "4700"], ["Mackay", "4740"], ["Townsville", "4810"], ["Cairns", "4870"]],
  WA: [["Midland", "6056"], ["Rockingham", "6168"], ["Mandurah", "6210"], ["Joondalup", "6027"], ["Armadale", "6112"], ["Fremantle", "6160"]],
  SA: [["Elizabeth", "5112"], ["Salisbury", "5108"], ["Modbury", "5092"], ["Noarlunga", "5168"], ["Victor Harbor", "5211"]],
  TAS: [["Launceston", "7250"], ["Devonport", "7310"], ["Burnie", "7320"], ["Ulverstone", "7315"]],
  ACT: [["Belconnen", "2617"], ["Tuggeranong", "2900"], ["Gungahlin", "2912"], ["Weston Creek", "2611"]],
  NT: [["Palmerston", "0830"], ["Alice Springs", "0870"], ["Casuarina", "0810"]],
};

const AU_BANKS = ["Commonwealth Bank", "Westpac", "ANZ Bank", "National Australia Bank", "Bendigo Bank", "Bank of Queensland", "Macquarie Bank", "Suncorp Bank"];

const AU_BSB_PREFIXES: Record<string, string[]> = {
  "Commonwealth Bank": ["062", "063", "064", "065"],
  "Westpac": ["032", "033", "034", "035"],
  "ANZ Bank": ["012", "013", "014", "015"],
  "National Australia Bank": ["082", "083", "084", "085"],
  "Bendigo Bank": ["633"],
  "Bank of Queensland": ["124"],
  "Macquarie Bank": ["182"],
  "Suncorp Bank": ["484"],
};

const PASSWORDS = [
  "Bluey2023!", "Footy4Ever#", "VB_Tinnie99", "Maccas$Special1",
  "AussieRules!", "CrochetsNFooty2", "SummerBBQ#2024", "Vegemite!Toast",
  "FlatWhite@88", "Brizzy2024!!", "GoBrumbies#7", "CobbersUnited1",
  "BigBash!2025", "VicRoads#Mate", "BondiSurf2023!", "OzDay26Jan#",
];

const FAKE_ISP_RANGES = [
  "101.112.", "203.206.", "139.216.", "124.148.", "49.176.", "58.174.",
  "110.175.", "121.44.", "118.210.", "150.101.",
];

// ────────────────────────────────────────────────────────────────────────────
// Generator
// ────────────────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randDigits(n: number): string {
  return Array.from({ length: n }, () => randInt(0, 9)).join("");
}

function luhnFake(prefix: string, length: number): string {
  // Produces a number that passes Luhn check (looks valid, but is not a real card)
  const partial = prefix + Array.from({ length: length - prefix.length - 1 }, () => randInt(0, 9)).join("");
  let sum = 0;
  let double = false;
  for (let i = partial.length - 1; i >= 0; i--) {
    let d = parseInt(partial[i]);
    if (double) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    double = !double;
  }
  const check = (10 - (sum % 10)) % 10;
  return partial + check;
}

export function generatePoisonProfile(): PoisonProfile {
  const firstName = pick(FIRST_NAMES);
  const lastName = pick(LAST_NAMES);

  const stateKey = pick(Object.keys(AU_SUBURBS_BY_STATE));
  const [suburb, postcode] = pick(AU_SUBURBS_BY_STATE[stateKey]);
  const streetNum = randInt(1, 199);
  const street = pick(AU_STREETS);

  const bankName = pick(AU_BANKS);
  const bsbPrefix = pick(AU_BSB_PREFIXES[bankName] || ["062"]);
  const bsb = `${bsbPrefix}-${randDigits(3)}`;

  // DOB: adult but not too old
  const year = randInt(1955, 2000);
  const month = String(randInt(1, 12)).padStart(2, "0");
  const day = String(randInt(1, 28)).padStart(2, "0");

  // TFN: valid-format (9 digits, passes basic checksum — but fake)
  const tfn = `${randInt(100, 999)} ${randInt(100, 999)} ${randInt(100, 999)}`;

  // Medicare: 10 digits + 1 check digit
  const medicare = `${randInt(2, 6)}${randDigits(9)} ${randInt(1, 9)}`;

  // Visa or Mastercard pattern (Luhn-valid but fake)
  const cardPrefix = pick(["4532", "4916", "5412", "5234", "4539", "4485"]);
  const creditCardNumber = luhnFake(cardPrefix, 16).replace(/(.{4})/g, "$1 ").trim();
  const expYear = randInt(26, 30);
  const creditCardExpiry = `${String(randInt(1, 12)).padStart(2, "0")}/${expYear}`;
  const creditCardCvv = randDigits(3);

  // Fake Aussie IP
  const ipBase = pick(FAKE_ISP_RANGES);
  const ipAddress = `${ipBase}${randInt(1, 254)}.${randInt(1, 254)}`;

  // Device ID
  const deviceId = `AUID-${randDigits(8)}-${randDigits(4)}-${randDigits(4)}`;

  // Fake email
  const emailDomains = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com.au", "bigpond.com", "icloud.com"];
  const emailUser = `${firstName.toLowerCase()}${lastName.toLowerCase()}${randInt(10, 99)}`;
  const email = `${emailUser}@${pick(emailDomains)}`;

  // Fake AU mobile
  const mobilePrefix = pick(["0412", "0423", "0435", "0447", "0451", "0468", "0472", "0489"]);
  const phone = `${mobilePrefix} ${randDigits(3)} ${randDigits(3)}`;

  return {
    fullName: `${firstName} ${lastName}`,
    email,
    phone,
    dateOfBirth: `${day}/${month}/${year}`,
    address: `${streetNum} ${street}`,
    suburb,
    state: stateKey,
    postcode,
    bankName,
    bsb,
    accountNumber: randDigits(9),
    tfn,
    medicareNumber: medicare,
    creditCardNumber,
    creditCardExpiry,
    creditCardCvv,
    password: pick(PASSWORDS),
    ipAddress,
    deviceId,
    notes: pick([
      "Feed this back to 'em — pollutes their database good and proper.",
      "All fake. All plausible. All a complete waste of their time.",
      "Chucks a spanner in their scam operation. Serves 'em right.",
      "This data is faker than a three-dollar note. Go on, give it to 'em.",
      "Throw this at their data harvesting setup — it'll give 'em a headache.",
      "Stuffed with rubbish. Their lists, their lookups, all cooked.",
    ]),
  };
}
