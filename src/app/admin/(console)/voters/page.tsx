import { prisma } from "@/lib/prisma";
import { edgeImpulseConfig } from "@/lib/edge-impulse-api";
import { maskNationalId, maskPhone } from "@/lib/rwanda";
import { Card, PageHeader } from "@/components/ui";
import EnrollVoterForm from "./EnrollVoterForm";
import VotersTable from "./VotersTable";

export const metadata = { title: "Voters" };

export default async function VotersPage() {
  const voters = await prisma.voter.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      voterNumber: true,
      nationalId: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      district: true,
      sector: true,
      isEligible: true,
      createdAt: true,
      _count: { select: { participations: true } },
    },
  });

  return (
    <>
      <PageHeader title="Voters" description="Register voters against their National ID with a live face capture, and manage the voter register." />
      <Card className="space-y-6">
        <div>
          <h2 className="font-semibold">Register a voter</h2>
          <p className="text-sm text-muted">Check the National ID card in person. Every field is validated before the face is captured.</p>
        </div>
        <EnrollVoterForm edgeImpulseConnected={edgeImpulseConfig().configured} />
      </Card>
      <Card className="space-y-4">
        <h2 className="font-semibold">Voter register ({voters.length})</h2>
        <VotersTable
          voters={voters.map((v) => ({
            id: v.id,
            voterNumber: v.voterNumber,
            nationalIdMasked: maskNationalId(v.nationalId),
            nationalIdLast: v.nationalId.slice(-6),
            fullName: `${v.firstName} ${v.lastName}`,
            phone: maskPhone(v.phone),
            hasEmail: Boolean(v.email),
            location: `${v.sector}, ${v.district}`,
            isEligible: v.isEligible,
            createdAt: v.createdAt.toISOString(),
            voted: v._count.participations > 0,
          }))}
        />
      </Card>
    </>
  );
}
