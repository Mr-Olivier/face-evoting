import { ArrowRight, Camera, EyeOff, KeyRound, ScanFace, ShieldCheck, UserCheck, Vote } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Avatar, Badge, ButtonLink } from "@/components/ui";

export const dynamic = "force-dynamic";

const steps = [
  { Icon: KeyRound, title: "Identify", text: "Enter the voter number and PIN you received at registration." },
  { Icon: ScanFace, title: "Verify", text: "Look at the camera and blink once. Your face is matched to your own enrolment only." },
  { Icon: Vote, title: "Vote", text: "Choose one candidate, review your choice and submit. You can vote only once." },
];

const pillars = [
  { Icon: UserCheck, title: "Two-factor identity", text: "Something you know (PIN) plus something you are (your face)." },
  { Icon: Camera, title: "Liveness check", text: "A blink is required, so a printed photo cannot vote." },
  { Icon: EyeOff, title: "Secret ballot", text: "Who voted and what was voted are stored in separate, unlinkable records." },
  { Icon: ShieldCheck, title: "One person, one vote", text: "Enforced by the database itself, even for simultaneous requests." },
];

export default async function HomePage() {
  const election = await prisma.election.findFirst({
    where: { status: "OPEN" },
    include: { candidates: { orderBy: { name: "asc" } } },
  });

  return (
    <div className="space-y-20">
      {/* Hero */}
      <section className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6">
          <Badge tone="primary">
            <ScanFace className="h-3.5 w-3.5" aria-hidden /> Face-verified e-voting
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            Vote securely in <span className="text-primary">under a minute.</span>
          </h1>
          <p className="max-w-xl text-lg text-muted">
            Confirm who you are with your voter number, PIN and a quick live face check, then cast one secret ballot.
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/verify" size="lg">
              Start voting <ArrowRight className="h-4 w-4" aria-hidden />
            </ButtonLink>
            <ButtonLink href="/#how-it-works" variant="secondary" size="lg">
              How it works
            </ButtonLink>
          </div>
        </div>

        <div className="card overflow-hidden">
          {election ? (
            <>
              <div className="border-b border-border p-6">
                <Badge tone="success" dot>
                  Voting is open
                </Badge>
                <h2 className="mt-3 text-xl font-bold">{election.title}</h2>
                {election.description && <p className="mt-1 text-sm text-muted">{election.description}</p>}
              </div>
              <ul className="divide-y divide-border">
                {election.candidates.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-6 py-3.5">
                    <Avatar name={c.name} src={c.photoUrl} size={40} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{c.name}</p>
                      {c.party && <p className="truncate text-sm text-muted">{c.party}</p>}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="bg-surface-2 px-6 py-3 text-xs text-muted">
                {election.candidates.length} candidates · results are published by the election officer after voting closes
              </div>
            </>
          ) : (
            <div className="p-8 text-center">
              <Badge>No open election</Badge>
              <p className="mt-3 text-muted">There is no election open for voting right now. Please check back later.</p>
            </div>
          )}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-24 space-y-8">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">How it works</h2>
          <p className="mt-2 text-muted">Three steps. Your face is checked on this device and only a numeric signature is sent, never a photo.</p>
        </div>
        <ol className="grid gap-4 md:grid-cols-3">
          {steps.map(({ Icon, title, text }, i) => (
            <li key={title} className="card p-6">
              <div className="flex items-center justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="text-sm font-bold text-subtle">0{i + 1}</span>
              </div>
              <h3 className="mt-5 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Security */}
      <section id="security" className="scroll-mt-24 space-y-8">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Built to protect every vote</h2>
          <p className="mt-2 text-muted">Every security decision is made on the server, not in your browser.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map(({ Icon, title, text }) => (
            <div key={title} className="card p-6">
              <Icon className="h-6 w-6 text-primary" aria-hidden />
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
