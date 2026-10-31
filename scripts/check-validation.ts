// Quick self-check of the Rwanda validation rules: `npx tsx scripts/check-validation.ts`
import assert from "node:assert/strict";
import { formatNationalId, maskEmail, maskNationalId, maskPhone, nationalIdProblem, normalizeRwandaPhone, parseNationalId, weakPinProblem } from "../src/lib/rwanda";
import { registerVoterDetailsSchema, toFieldErrors } from "../src/lib/validation";

const ok = "1199080012345012";
assert.equal(nationalIdProblem(ok, { requireCitizen: true, checkAge: true }), null);
assert.deepEqual(parseNationalId(ok), { birthYear: 1990, sex: "MALE", citizen: true });
assert.equal(formatNationalId(ok), "1 1990 8 0012345 0 12");
assert.match(nationalIdProblem("119908001234501")!, /16 digits\. You entered 15/);
assert.match(nationalIdProblem("2199080012345012", { requireCitizen: true })!, /Only Rwandan citizens/);
assert.match(nationalIdProblem("1199050012345012")!, /Digit 6/);
assert.match(nationalIdProblem("1201580012345012", { checkAge: true })!, /at least 18/);
assert.match(nationalIdProblem("1309980012345012")!, /not a valid year/);

assert.equal(normalizeRwandaPhone("078 123 4567"), "+250781234567");
assert.equal(normalizeRwandaPhone("+250 72 123 4567"), "+250721234567");
assert.equal(normalizeRwandaPhone("0751234567"), null);
assert.equal(maskPhone("+250781234567"), "+250 78• ••• 567");
assert.equal(maskEmail("olivier@gmail.com"), "o•••••r@gmail.com");
assert.equal(maskNationalId(ok), "1 •••• • ••••345 • 12");

assert.ok(weakPinProblem("111111"));
assert.ok(weakPinProblem("123456"));
assert.ok(weakPinProblem("654321"));
assert.ok(weakPinProblem("121212"));
assert.ok(weakPinProblem("150390", { dob: "1990-03-15" }));
assert.equal(weakPinProblem("482915", { dob: "1990-03-15", nationalId: ok, phone: "+250781234567" }), null);

const good = {
  nationalId: ok,
  firstName: "Aline",
  lastName: "Mukamana",
  dateOfBirth: "1990-03-15",
  sex: "MALE",
  phone: "0781234567",
  email: "",
  province: "Kigali City",
  district: "Gasabo",
  sector: "Kimironko",
  cell: "Bibare",
  village: "Imena",
  pin: "482915",
  pinConfirm: "482915",
  consentBiometric: true,
};
const r = registerVoterDetailsSchema.safeParse(good);
assert.ok(r.success, JSON.stringify(!r.success && toFieldErrors(r.error)));

const bad = registerVoterDetailsSchema.safeParse({ ...good, dateOfBirth: "1991-03-15", sex: "FEMALE", district: "Huye", pinConfirm: "000000", email: "x@" });
assert.ok(!bad.success);
const e = toFieldErrors(bad.error);
assert.match(e.dateOfBirth, /born in 1990/);
assert.match(e.sex, /indicates male/);
assert.match(e.district, /not in Kigali City/);
assert.match(e.pinConfirm, /don't match/);
assert.match(e.email, /valid email/);

console.log("All validation checks passed.");
console.log(e);
