/**
 * Optional sample data so the admin dashboard has something to show in a demo.
 *
 *   npm run db:demo         add sample data
 *   npm run db:demo:clear   remove it again
 *
 * Adds:
 *  - 24 sample voters (voter numbers DEMO-001 … DEMO-024) with synthetic Rwandan identities
 *    (National IDs use serial block 99xxxxx). Their face descriptor is a constant
 *    out-of-range vector, so no real face can ever match them.
 *  - A CLOSED past election with results (ballots + participation records).
 *  - Verification attempts over the last 3 days with realistic face distances,
 *    so the verification log and distance chart are populated.
 *
 * The OPEN election from `npm run db:seed` is not touched — keep it clean for the live vote.
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PROVINCES, type Province } from "../src/lib/rwanda";

const prisma = new PrismaClient();
const PAST_TITLE = "Class Representative Election 2025 (sample data)";
const PREFIX = "DEMO-";

const names = [
  "Aline Mukamana", "Eric Niyonzima", "Grace Uwimana", "Jean Habimana", "Divine Ingabire", "Patrick Mugisha",
  "Clarisse Umutoni", "Kevin Nshimiyimana", "Sandrine Iradukunda", "Moses Tuyishime", "Diane Uwase", "Samuel Kayitare",
  "Joy Mutesi", "Fabrice Ndayisaba", "Esther Nyirahabimana", "Yves Manzi", "Ange Umuhoza", "Brian Hakizimana",
  "Chantal Mukeshimana", "David Rukundo", "Lydia Akimana", "Olivier Ishimwe", "Nadine Uwera", "Thierry Bizimana",
];

// Deterministic pseudo-random numbers so the sample data is the same every run.
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const gauss = (mean: number, sd: number) => mean + sd * Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
const clamp = (v: number) => Math.round(Math.min(0.99, Math.max(0.05, v)) * 1000) / 1000;

async function clear() {
  const past = await prisma.election.findFirst({ where: { title: PAST_TITLE } });
  if (past) await prisma.election.delete({ where: { id: past.id } }); // cascades candidates, ballots, participations
  const demo = await prisma.voter.findMany({ where: { voterNumber: { startsWith: PREFIX } }, select: { nationalId: true } });
  const attempts = await prisma.verificationAttempt.deleteMany({ where: { identifier: { in: demo.map((d) => d.nationalId) } } });
  const voters = await prisma.voter.deleteMany({ where: { voterNumber: { startsWith: PREFIX } } });
  console.log(`Removed sample data: ${past ? 1 : 0} election, ${voters.count} voters, ${attempts.count} attempts.`);
}

const places: [Province, string, string, string, string][] = [
  ["Kigali City", "Gasabo", "Kimironko", "Bibare", "Imena"],
  ["Kigali City", "Kicukiro", "Niboye", "Nyakabanda", "Isangano"],
  ["Kigali City", "Nyarugenge", "Nyamirambo", "Mumena", "Rugano"],
  ["Southern Province", "Huye", "Ngoma", "Butare", "Taba"],
  ["Northern Province", "Musanze", "Muhoza", "Mpenge", "Kigombe"],
  ["Western Province", "Rubavu", "Gisenyi", "Umuganda", "Bugoyi"],
  ["Eastern Province", "Rwamagana", "Kigabiro", "Sibagire", "Kabuga"],
];

async function add() {
  if (await prisma.election.findFirst({ where: { title: PAST_TITLE } })) {
    console.log("Sample data already present — run `npm run db:demo:clear` first to recreate it.");
    return;
  }

  const pinHash = await bcrypt.hash("482915", 10);
  const unmatchable = new Array(128).fill(1); // far from any real face descriptor
  const female = new Set([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]);
  const voters = await Promise.all(
    names.map((name, i) => {
      const [firstName, ...rest] = name.split(" ");
      const year = 1975 + ((i * 7) % 30);
      const sex = female.has(i) ? "FEMALE" : "MALE";
      const nationalId = `1${year}${sex === "MALE" ? 8 : 7}99${String(i + 1).padStart(5, "0")}000`;
      const [province, district, sector, cell, village] = places[i % places.length];
      if (!(PROVINCES[province] as readonly string[]).includes(district)) throw new Error(`Bad sample district ${district}`);
      return prisma.voter.create({
        data: {
          voterNumber: `${PREFIX}${String(i + 1).padStart(3, "0")}`,
          nationalId,
          firstName,
          lastName: rest.join(" "),
          dateOfBirth: new Date(Date.UTC(year, i % 12, 1 + (i % 27))),
          sex,
          phone: `+25078${String(1000000 + i * 37).slice(0, 7)}`,
          province,
          district,
          sector,
          cell,
          village,
          pinHash,
          faceDescriptor: unmatchable,
          consentAt: new Date(Date.now() - 40 * 86400_000),
        },
      });
    }),
  );

  const past = await prisma.election.create({
    data: {
      title: PAST_TITLE,
      description: "A previous election, included as sample data for the dashboard.",
      status: "CLOSED",
      createdAt: new Date(Date.now() - 30 * 86400_000),
      candidates: {
        create: [
          { name: "Sandrine Keza", party: "Voice of Students" },
          { name: "Emmanuel Gatete", party: "Campus Forward" },
          { name: "Ruth Ingabire", party: "Independent" },
        ],
      },
    },
    include: { candidates: true },
  });

  // 19 of 24 voted: 9 / 6 / 4
  const split = [9, 6, 4];
  let v = 0;
  for (let c = 0; c < split.length; c++) {
    for (let k = 0; k < split[c]; k++, v++) {
      await prisma.$transaction([
        prisma.participation.create({ data: { voterId: voters[v].id, electionId: past.id, receiptCode: `FV-DEMO-${String(v + 1).padStart(4, "0")}`, votedAt: new Date(Date.now() - 29 * 86400_000) } }),
        prisma.ballot.create({ data: { electionId: past.id, candidateId: past.candidates[c].id } }),
      ]);
    }
  }

  // Verification attempts over the last 3 days
  type A = { identifier: string; voterId: string; stage: string; success: boolean; reason: string | null; distance: number | null; createdAt: Date };
  const attempts: A[] = [];
  const when = () => new Date(Date.now() - rand() * 3 * 86400_000);
  for (let i = 0; i < 46; i++) {
    const voter = voters[Math.floor(rand() * voters.length)];
    const base = { identifier: voter.nationalId, voterId: voter.id, createdAt: when() };
    const r = rand();
    if (r < 0.66) attempts.push({ ...base, stage: "face", success: true, reason: null, distance: clamp(gauss(0.32, 0.06)) });
    else if (r < 0.82) attempts.push({ ...base, stage: "face", success: false, reason: "face_mismatch", distance: clamp(gauss(0.7, 0.08)) });
    else if (r < 0.92) attempts.push({ ...base, stage: "credentials", success: false, reason: "wrong_pin", distance: null });
    else attempts.push({ ...base, stage: "face", success: false, reason: "liveness", distance: null });
  }
  await prisma.verificationAttempt.createMany({ data: attempts });

  console.log(`Added sample data: ${voters.length} voters, 1 closed election (19 ballots), ${attempts.length} verification attempts.`);
}

(process.argv.includes("--clear") ? clear() : add())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
