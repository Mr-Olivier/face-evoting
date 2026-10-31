// Request schemas — shared by the browser (inline field errors) and the server (authoritative).
import { z } from "zod";
import {
  PROVINCES,
  PROVINCE_NAMES,
  VOTING_AGE,
  ageOn,
  digitsOnly,
  nationalIdProblem,
  normalizeRwandaPhone,
  parseNationalId,
  weakPinProblem,
  type Province,
} from "./rwanda";

const custom = z.ZodIssueCode.custom;

const descriptor = z.array(z.number().finite()).length(128, "Face descriptor must contain 128 numbers");

const nationalId = (opts: { requireCitizen?: boolean; checkAge?: boolean }) =>
  z
    .string({ required_error: "Enter the 16-digit National ID number." })
    .transform(digitsOnly)
    .superRefine((v, ctx) => {
      const problem = nationalIdProblem(v, opts);
      if (problem) ctx.addIssue({ code: custom, message: problem });
    });

const personName = (label: string) =>
  z
    .string({ required_error: `Enter the ${label.toLowerCase()}.` })
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(2, `${label} must have at least 2 letters.`)
        .max(50, `${label} must be 50 characters or fewer.`)
        .regex(/^[\p{L}][\p{L}' -]*$/u, `${label} can only contain letters, spaces, hyphens and apostrophes.`),
    );

const placeName = (label: string) =>
  z
    .string({ required_error: `Enter the ${label.toLowerCase()}.` })
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(2, `Enter the ${label.toLowerCase()}.`)
        .max(60, `${label} must be 60 characters or fewer.`)
        .regex(/^[\p{L}0-9][\p{L}0-9' .-]*$/u, `${label} contains characters that aren't allowed.`),
    );

const pin6 = z.string({ required_error: "Enter the 6-digit PIN." }).regex(/^\d{6}$/, "The PIN must be exactly 6 digits.");

// ---------- Voter registration (election officer) ----------

export const registerVoterFields = z.object({
  nationalId: nationalId({ requireCitizen: true, checkAge: true }),
  firstName: personName("First name"),
  lastName: personName("Last name"),
  dateOfBirth: z.string({ required_error: "Enter the date of birth." }).regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date of birth."),
  sex: z.enum(["MALE", "FEMALE"], { errorMap: () => ({ message: "Select the sex shown on the ID card." }) }),
  phone: z.string({ required_error: "Enter a mobile number." }).transform((v, ctx) => {
    const n = normalizeRwandaPhone(v);
    if (!n) {
      ctx.addIssue({ code: custom, message: "Enter a Rwandan mobile number, e.g. 078 123 4567 (MTN 078/079 or Airtel 072/073)." });
      return z.NEVER;
    }
    return n;
  }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(120, "Email must be 120 characters or fewer.")
    .refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid email address, e.g. name@example.com.")
    .optional()
    .transform((v) => (v ? v : undefined)),
  province: z.enum(PROVINCE_NAMES as [Province, ...Province[]], { errorMap: () => ({ message: "Select a province." }) }),
  district: z.string({ required_error: "Select a district." }).min(1, "Select a district."),
  sector: placeName("Sector"),
  cell: placeName("Cell"),
  village: placeName("Village"),
  pin: pin6,
  pinConfirm: z.string({ required_error: "Re-enter the PIN." }),
  consentBiometric: z.literal(true, {
    errorMap: () => ({ message: "The voter must consent to biometric processing before registration." }),
  }),
});

type FieldsIn = z.input<typeof registerVoterFields>;
type FieldsOut = z.output<typeof registerVoterFields>;

/** Parses each field on its own, keeping only the valid ones (so cross-checks can run alongside field errors). */
function partialParse(raw: unknown): Partial<FieldsOut> {
  const src = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(registerVoterFields.shape)) {
    const r = (schema as z.ZodTypeAny).safeParse(src[key]);
    if (r.success) out[key] = r.data;
  }
  return out as Partial<FieldsOut>;
}

/** Cross-field rules. Each runs only when the fields it needs are individually valid. */
function crossCheck(d: Partial<FieldsOut>, ctx: z.RefinementCtx) {
  const info = d.nationalId ? parseNationalId(d.nationalId) : null;
  if (d.dateOfBirth) {
    const dob = new Date(`${d.dateOfBirth}T00:00:00Z`);
    if (Number.isNaN(dob.getTime())) {
      ctx.addIssue({ code: custom, path: ["dateOfBirth"], message: "Enter a valid date of birth." });
    } else {
      const age = ageOn(dob);
      if (dob > new Date()) ctx.addIssue({ code: custom, path: ["dateOfBirth"], message: "Date of birth can't be in the future." });
      else if (age < VOTING_AGE) ctx.addIssue({ code: custom, path: ["dateOfBirth"], message: `The voter is ${age}. Voters must be at least ${VOTING_AGE}.` });
      else if (age > 120) ctx.addIssue({ code: custom, path: ["dateOfBirth"], message: "Check the date of birth. The voter would be over 120 years old." });
      if (info && dob.getUTCFullYear() !== info.birthYear)
        ctx.addIssue({
          code: custom,
          path: ["dateOfBirth"],
          message: `The National ID says born in ${info.birthYear}, but this date is in ${dob.getUTCFullYear()}. One of them is wrong.`,
        });
    }
  }
  if (info && d.sex && info.sex !== d.sex)
    ctx.addIssue({ code: custom, path: ["sex"], message: `The National ID number indicates ${info.sex.toLowerCase()}. Check the ID card.` });
  if (d.province && d.district) {
    const districts = PROVINCES[d.province] as readonly string[];
    if (!districts.includes(d.district)) ctx.addIssue({ code: custom, path: ["district"], message: `${d.district} is not in ${d.province}.` });
  }
  if (d.pin) {
    const weak = weakPinProblem(d.pin, { dob: d.dateOfBirth, nationalId: d.nationalId, phone: d.phone });
    if (weak) ctx.addIssue({ code: custom, path: ["pin"], message: weak });
    if (d.pinConfirm !== undefined && d.pin !== d.pinConfirm) ctx.addIssue({ code: custom, path: ["pinConfirm"], message: "The two PINs don't match." });
  }
}

/** Field errors and cross-field errors are reported together, in one pass. */
function withCrossChecks<T extends z.ZodTypeAny>(schema: T) {
  return z
    .unknown()
    .superRefine((raw, ctx) => {
      const r = schema.safeParse(raw);
      if (!r.success) for (const issue of r.error.issues) ctx.addIssue(issue);
      crossCheck(partialParse(raw), ctx);
    })
    .transform((raw, ctx) => {
      const r = schema.safeParse(raw);
      if (!r.success) {
        ctx.addIssue({ code: custom, message: "Invalid registration." });
        return z.NEVER;
      }
      return r.data as z.output<T>;
    });
}

/** Identity + credentials only (used by the form before face capture). */
export const registerVoterDetailsSchema = withCrossChecks(registerVoterFields);

/** Full request body accepted by POST /api/admin/voters. */
export const registerVoterSchema = withCrossChecks(
  registerVoterFields.extend({
    samples: z.array(descriptor).min(3, "Capture at least 3 face samples.").max(10, "Capture at most 10 face samples."),
  }),
);

export type RegisterVoterInput = FieldsIn & { samples: number[][] };

// ---------- Voter self-service ----------

export const voterLookupSchema = z.object({
  nationalId: nationalId({}),
  pin: pin6,
});

export const pinResetRequestSchema = z.object({
  nationalId: nationalId({}),
});

export const pinResetVerifySchema = z.object({
  code: z.string({ required_error: "Enter the 6-digit code from the email." }).regex(/^\d{6}$/, "The code has exactly 6 digits."),
});

export const pinResetCompleteSchema = z
  .object({
    pin: pin6,
    pinConfirm: z.string({ required_error: "Re-enter the new PIN." }),
  })
  .superRefine((d, ctx) => {
    if (d.pin !== d.pinConfirm) ctx.addIssue({ code: custom, path: ["pinConfirm"], message: "The two PINs don't match." });
  });

export const verifyFaceSchema = z.object({
  descriptor,
  livenessPassed: z.boolean(),
});

export const castVoteSchema = z.object({
  candidateId: z.string().min(1),
});

// ---------- Admin ----------

export const createCandidateSchema = z.object({
  electionId: z.string().min(1),
  name: z.string().trim().min(2, "Candidate name must have at least 2 characters.").max(100),
  party: z.string().trim().max(100).optional(),
  bio: z.string().trim().max(500).optional(),
  photoUrl: z.string().trim().max(500).optional(),
});

export const updateElectionSchema = z.object({
  status: z.enum(["DRAFT", "OPEN", "CLOSED"]),
});

export const createElectionSchema = z.object({
  title: z.string().trim().min(3, "Title must have at least 3 characters.").max(120),
  description: z.string().trim().max(300).optional(),
});

export const updateVoterSchema = z.object({
  isEligible: z.boolean(),
});

export const testEmailSchema = z.object({
  to: z.string().trim().email("Enter a valid email address."),
});

const box = z.object({ x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive() });

export const datasetUploadSchema = z.object({
  kind: z.enum(["face", "background"]),
  /** "auto" = 80 % training / 20 % testing per upload, like Edge Impulse's automatic split. */
  split: z.enum(["auto", "training", "testing"]).default("training"),
  consent: z.boolean(),
  subjectCode: z
    .string()
    .trim()
    .max(20)
    .regex(/^[A-Za-z0-9-]*$/, "Use letters, numbers and dashes only.")
    .optional(),
  images: z
    .array(
      z.object({
        dataUrl: z.string().startsWith("data:image/jpeg;base64,", "Images must be JPEG.").max(2_000_000, "Image is too large."),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        boxes: z.array(box).max(10),
      }),
    )
    .min(1)
    .max(10),
});

/** Turns a ZodError into { field: firstMessage } for inline form errors. */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
