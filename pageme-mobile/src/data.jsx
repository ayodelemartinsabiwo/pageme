// data.jsx — seed contacts, codes, and intercepted notifications

export const PAGER_CODES = [
  { code: "143", meaning: "I LOVE YOU" },
  { code: "07734", meaning: "HELLO (upside down)" },
  { code: "911", meaning: "EMERGENCY" },
  { code: "121", meaning: "CALL ME" },
  { code: "823", meaning: "THINKING OF YOU" },
  { code: "637", meaning: "ALWAYS & FOREVER" },
  { code: "477", meaning: "BEST FRIENDS" },
  { code: "303", meaning: "MOM" },
  { code: "404", meaning: "I DUNNO" },
  { code: "601", meaning: "HAPPY BIRTHDAY" },
  { code: "53*7", meaning: "BE MY GIRL" },
  { code: "1134", meaning: "HELL (upside down)" },
  { code: "5*", meaning: "MISS YOU" },
  { code: "182", meaning: "I HATE YOU" },
  { code: "0*0", meaning: "GOODBYE" },
];

export const SEED_INBOX = [
  { id: "p1", from: "JEN",  number: "555-0177", text: "143", time: "10:42 PM", date: "MAY 03", read: false, type: "code", source: "sms" },
  { id: "p2", from: "MIKE", number: "555-0142", text: "MEET AT THE DINER 9PM", time: "08:14 PM", date: "MAY 03", read: false, type: "text", source: "sms" },
  { id: "p3", from: "DAD",  number: "555-0001", text: "121", time: "06:30 PM", date: "MAY 03", read: true,  type: "code", source: "call" },
  { id: "p4", from: "WORK", number: "555-0420", text: "911", time: "03:02 PM", date: "MAY 03", read: true,  type: "code", source: "sms" },
];

// Simulated inbound notifications (would be intercepted from system in a real build)
export const INCOMING_QUEUE = [
  { from: "JEN",   number: "555-0177", text: "53*7", type: "code", source: "sms" },
  { from: "MIKE",  number: "555-0142", text: "WHERE ARE U?", type: "text", source: "sms" },
  { from: "MOM",   number: "555-0303", text: "303", type: "code", source: "call" },
  { from: "ALEX",  number: "555-0888", text: "07734", type: "code", source: "sms" },
  { from: "WORK",  number: "555-0420", text: "STAND UP IN 5", type: "text", source: "slack" },
  { from: "SAM",   number: "555-0221", text: "823", type: "code", source: "sms" },
];

export const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria",
  "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan",
  "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia",
  "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo (Congo-Brazzaville)", "Costa Rica",
  "Croatia", "Cuba", "Cyprus", "Czechia (Czech Republic)", "Democratic Republic of the Congo", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador",
  "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France",
  "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau",
  "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland",
  "Israel", "Italy", "Ivory Coast", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kuwait",
  "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg",
  "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico",
  "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar (Burma)", "Namibia", "Nauru",
  "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway", "Oman",
  "Pakistan", "Palau", "Palestine State", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal",
  "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe",
  "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia",
  "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria",
  "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey",
  "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States of America", "Uruguay", "Uzbekistan", "Vanuatu",
  "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
];
