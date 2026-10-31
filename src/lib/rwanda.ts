/**
 * Rwanda-specific identity rules, shared by the browser (instant feedback)
 * and the server (authoritative validation).
 *
 * National ID (Indangamuntu) — 16 digits:
 *
 *   1  1990  8  0012345  0  12
 *   │   │    │     │     │   └─ security / check digits
 *   │   │    │     │     └───── issue frequency
 *   │   │    │     └─────────── serial number
 *   │   │    └───────────────── sex: 8 = male, 7 = female
 *   │   └────────────────────── year of birth
 *   └────────────────────────── 1 = Rwandan citizen (2 = refugee, 3 = foreign resident)
 */

export const VOTING_AGE = 18;

export const PROVINCES = {
  "Kigali City": ["Gasabo", "Kicukiro", "Nyarugenge"],
  "Northern Province": ["Burera", "Gakenke", "Gicumbi", "Musanze", "Rulindo"],
  "Southern Province": ["Gisagara", "Huye", "Kamonyi", "Muhanga", "Nyamagabe", "Nyanza", "Nyaruguru", "Ruhango"],
  "Eastern Province": ["Bugesera", "Gatsibo", "Kayonza", "Kirehe", "Ngoma", "Nyagatare", "Rwamagana"],
  "Western Province": ["Karongi", "Ngororero", "Nyabihu", "Nyamasheke", "Rubavu", "Rusizi", "Rutsiro"],
} as const;

export type Province = keyof typeof PROVINCES;
export const PROVINCE_NAMES = Object.keys(PROVINCES) as Province[];

export const digitsOnly = (v: string) => v.replace(/\D/g, "");

/** "1199080012345012" → "1 1990 8 0012345 0 12" (works on partial input too). */
export function formatNationalId(value: string): string {
  const d = digitsOnly(value).slice(0, 16);
  const groups = [1, 4, 1, 7, 1, 2];
  const out: string[] = [];
  let i = 0;
  for (const g of groups) {
    if (i >= d.length) break;
    out.push(d.slice(i, i + g));
    i += g;
  }
  return out.join(" ");
}

export type NationalIdInfo = { birthYear: number; sex: "MALE" | "FEMALE"; citizen: boolean };

/** Returns a human-friendly problem with the ID, or null if the structure is valid. */
export function nationalIdProblem(value: string, opts: { requireCitizen?: boolean; checkAge?: boolean } = {}): string | null {
  const d = digitsOnly(value);
  if (d.length === 0) return "Enter the 16-digit National ID number.";
  if (d.length !== 16) return `A National ID has 16 digits. You entered ${d.length}.`;
  const kind = d[0];
  if (!["1", "2", "3"].includes(kind)) return "The first digit must be 1 (citizen), 2 (refugee) or 3 (foreign resident). Check the number on the ID card.";
  if (opts.requireCitizen && kind !== "1")
    return "Only Rwandan citizens can vote. This ID number starts with " + kind + ", which is issued to refugees or foreign residents.";
  const year = Number(d.slice(1, 5));
  const now = new Date().getFullYear();
  if (year < 1900 || year > now) return `Digits 2–5 are the year of birth, but ${d.slice(1, 5)} is not a valid year.`;
  if (d[5] !== "7" && d[5] !== "8") return "Digit 6 shows sex and must be 8 (male) or 7 (female). Check the number on the ID card.";
  if (opts.checkAge && now - year < VOTING_AGE - 1) return `This ID belongs to someone born in ${year}. Voters must be at least ${VOTING_AGE} years old.`;
  return null;
}

export function parseNationalId(value: string): NationalIdInfo | null {
  if (nationalIdProblem(value)) return null;
  const d = digitsOnly(value);
  return { birthYear: Number(d.slice(1, 5)), sex: d[5] === "8" ? "MALE" : "FEMALE", citizen: d[0] === "1" };
}

/** Accepts 0781234567, 781234567, 250781234567, +250 78 123 4567 → "+250781234567". */
export function normalizeRwandaPhone(value: string): string | null {
  const d = digitsOnly(value);
  const m = d.match(/^(?:250|0)?(7[2389]\d{7})$/);
  return m ? `+250${m[1]}` : null;
}

export function formatRwandaPhone(e164: string): string {
  const m = e164.match(/^\+250(\d{2})(\d{3})(\d{4})$/);
  return m ? `+250 ${m[1]} ${m[2]} ${m[3]}` : e164;
}

export function ageOn(dob: Date, on = new Date()): number {
  let age = on.getFullYear() - dob.getFullYear();
  const m = on.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < dob.getDate())) age--;
  return age;
}

/** Rejects PINs that are easy to guess. Returns a problem or null. */
export function weakPinProblem(pin: string, context: { dob?: string; nationalId?: string; phone?: string } = {}): string | null {
  if (!/^\d{6}$/.test(pin)) return "The PIN must be exactly 6 digits.";
  if (/^(\d)\1{5}$/.test(pin)) return "Don't use the same digit six times.";
  const asc = "0123456789012", desc = "9876543210987";
  if (asc.includes(pin) || desc.includes(pin)) return "Don't use a sequence like 123456 or 654321.";
  if (/^(\d\d)\1\1$/.test(pin) || /^(\d{3})\1$/.test(pin)) return "Don't use a repeating pattern like 121212 or 123123.";
  if (context.dob) {
    const [y, m, dd] = context.dob.split("-");
    if (y && m && dd && [dd + m + y.slice(2), y.slice(2) + m + dd, m + dd + y.slice(2), y + m.slice(0, 2)].includes(pin))
      return "Don't use the date of birth as the PIN.";
  }
  const nid = context.nationalId ? digitsOnly(context.nationalId) : "";
  if (nid && nid.includes(pin)) return "Don't use digits from the National ID as the PIN.";
  const phone = context.phone ? digitsOnly(context.phone) : "";
  if (phone && phone.endsWith(pin)) return "Don't use the end of the phone number as the PIN.";
  return null;
}

// ---------- Masking (for display; never weakens what is stored) ----------

export function maskNationalId(nid: string): string {
  const d = digitsOnly(nid);
  if (d.length !== 16) return "••••";
  return `${d[0]} •••• • ••••${d.slice(10, 13)} • ${d.slice(14)}`;
}

export function maskPhone(e164: string): string {
  const m = e164.match(/^\+250(\d{2})\d{3}(\d{4})$/);
  return m ? `+250 ${m[1]}• ••• ${m[2].slice(1)}` : "••••";
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "••••";
  const visible = user.length <= 2 ? user[0] : `${user[0]}${"•".repeat(Math.min(6, user.length - 2))}${user[user.length - 1]}`;
  return `${visible}@${domain}`;
}

export const fullName = (v: { firstName: string; lastName: string }) => `${v.firstName} ${v.lastName}`;

/** Kigali time for anything shown to voters/officers. */
export function formatKigali(date: Date, withTime = true): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kigali",
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(date) + (withTime ? " (Kigali time)" : "");
}
