export interface BootstrapPayload {
  nonce: string;
  powChallenge: string;
  challengeType: string;
  powDifficulty: number;
}

export function parseBootstrap(raw: any): BootstrapPayload | null {
  const nonce = String(raw?.nonce || "").trim();
  if (!nonce) return null;
  return {
    nonce,
    powChallenge: String(raw?.powChallenge || "").trim(),
    challengeType: String(raw?.challengeType || "").trim(),
    powDifficulty: Number(raw?.powDifficulty || 0) || 0
  };
}

function hasLeadingZeroNibbles(bytes: Uint8Array, difficulty: number): boolean {
  const fullBytes = Math.floor(Number(difficulty || 0) / 2);
  const hasHalfByte = (Number(difficulty || 0) & 1) === 1;
  for (let i = 0; i < fullBytes; i += 1) {
    if (bytes[i] !== 0) return false;
  }
  return !hasHalfByte || (bytes[fullBytes] & 0xf0) === 0;
}

async function deriveAltChallenge(challenge: string, nonce: string, solution: string, encoder: TextEncoder): Promise<string> {
  const input = encoder.encode(`pow:alt:${challenge}:${nonce}:${solution}`);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  let hex = "";
  for (let i = 0; i < 16; i += 1) {
    hex += hash[i].toString(16).padStart(2, "0");
  }
  return hex;
}

async function solveSinglePow(
  challengeType: string,
  challenge: string,
  nonce: string,
  difficulty: number,
  encoder: TextEncoder
): Promise<string> {
  const prefix = challengeType === "alt" ? `pow:${nonce}:` : `pow:${challenge}:`;
  const suffix = challengeType === "alt" ? `:${challenge}` : `:${nonce}:${challenge.length}`;
  const prefixBytes = encoder.encode(prefix);
  const suffixBytes = encoder.encode(suffix);
  const buf = new Uint8Array(prefixBytes.length + 10 + suffixBytes.length);
  buf.set(prefixBytes);

  for (let n = 0; n < 100000000; n += 1) {
    let value = n;
    let pos = prefixBytes.length;
    if (value === 0) buf[pos++] = 48;
    while (value > 0) {
      buf[pos++] = 48 + (value % 10);
      value = (value / 10) | 0;
    }
    for (let l = prefixBytes.length, r = pos - 1; l < r; l += 1, r -= 1) {
      const t = buf[l];
      buf[l] = buf[r];
      buf[r] = t;
    }
    buf.set(suffixBytes, pos);
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", buf.subarray(0, pos + suffixBytes.length)));
    if (hasLeadingZeroNibbles(hash, difficulty)) return String(n);
  }
  return "";
}

export async function solvePow(challenge: string, nonce: string, difficulty: number, challengeType = "classic"): Promise<string> {
  if (!challenge || !difficulty) return "";
  const encoder = new TextEncoder();
  const first = await solveSinglePow(challengeType, challenge, nonce, difficulty, encoder);
  if (!first || challengeType !== "alt") return first;
  const secondChallenge = await deriveAltChallenge(challenge, nonce, first, encoder);
  const second = await solveSinglePow(challengeType, secondChallenge, nonce, difficulty, encoder);
  return second ? `${first}.${second}` : "";
}
