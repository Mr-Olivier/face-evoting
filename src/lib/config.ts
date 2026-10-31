// Server-side configuration (never import this from client components).
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}. Copy .env.example to .env.`);
  return value;
}

export const config = {
  get jwtSecret() {
    return new TextEncoder().encode(required("JWT_SECRET"));
  },
  get adminPassword() {
    return required("ADMIN_PASSWORD");
  },
  faceMatchThreshold: Number(process.env.FACE_MATCH_THRESHOLD ?? "0.5"),
  /**
   * Stricter limit used only to flag a possible DUPLICATE registration. Kept below the voting
   * threshold so two different people who merely look alike on a webcam aren't blocked;
   * an officer can still confirm "different person" when a pair falls under it.
   */
  duplicateFaceThreshold: Number(process.env.DUPLICATE_FACE_THRESHOLD ?? "0.4"),
  /** Time to complete the face check after the credentials step. */
  preauthMinutes: 5,
  /** Time to cast the ballot after the face check. */
  voterSessionMinutes: 5,
  adminSessionHours: 8,
  /** Failed checks (credentials or face) per National ID before a temporary lock. */
  maxFailedAttempts: 5,
  lockoutMinutes: 15,
  /** Failed checks per client IP in the same window (slows down ID guessing). */
  maxFailedPerIp: 30,
  descriptorLength: 128,
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  electionOffice: process.env.ELECTION_OFFICE_CONTACT ?? "your sector's election office",
};
