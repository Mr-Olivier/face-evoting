// Self-check of the PIN-reset code logic: `npx tsx --env-file=.env scripts/check-pin-reset.ts`
import assert from "node:assert/strict";
import { jwtVerify } from "jose";
import { newOtp, otpMatches, pinFingerprint, signResetToken } from "../src/lib/pin-reset";
import { config } from "../src/lib/config";

(async () => {
  for (let i = 0; i < 1000; i++) assert.match(newOtp(), /^\d{6}$/);

  const otp = "042917";
  const token = await signResetToken({ voterId: "v1", nationalId: "1199080012345012", otp, pinHash: "$2a$10$oldhash", verified: false });
  const { payload } = await jwtVerify(token, config.jwtSecret);
  assert.equal(payload.typ, "pin_reset");
  assert.notEqual(payload.otp, otp, "code must never be stored in plain text");
  assert.ok(otpMatches(otp, "v1", payload.jti!, payload.otp as string), "correct code accepted");
  assert.ok(!otpMatches("042918", "v1", payload.jti!, payload.otp as string), "wrong code rejected");
  assert.ok(!otpMatches(otp, "v2", payload.jti!, payload.otp as string), "code bound to the voter");
  assert.equal(payload.pf, pinFingerprint("$2a$10$oldhash"));
  assert.notEqual(pinFingerprint("$2a$10$oldhash"), pinFingerprint("$2a$10$newhash"), "PIN change invalidates the token");

  console.log("PIN reset checks passed.");
})();
