import { randomInt } from "node:crypto";

// Crockford-style alphabet without look-alikes (no 0/O, 1/I/L, U).
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Participation reference such as "FV-7K2P-9QXA" — random, not derived from the voter or the choice. */
export function newReceiptCode(): string {
  const part = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `FV-${part()}-${part()}`;
}

/** Voter number such as "FV-482913". */
export function newVoterNumber(): string {
  return `FV-${String(randomInt(100000, 1000000))}`;
}
