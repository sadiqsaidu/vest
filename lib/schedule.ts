import { createHash } from "crypto";

export type Interval = "Monthly" | "Quarterly";

export type BeneficiaryInput = {
  label: string;
  wallet: string;
  allocation: bigint;
  cliff_months: number;
  vest_months: number;
  interval: Interval;
};

export type ScheduleEntry = {
  beneficiary_wallet: string;
  beneficiary_label: string;
  unlock_timestamp: number;
  amount: string;
};

const intervalToMonths = (i: Interval) => (i === "Quarterly" ? 3 : 1);

const SECONDS_PER_MONTH = 30 * 24 * 60 * 60;

export function generateSchedule(opts: {
  beneficiaries: BeneficiaryInput[];
  start_unix: number;
  test_mode_seconds: boolean;
}): ScheduleEntry[] {
  const { beneficiaries, start_unix, test_mode_seconds } = opts;
  const out: ScheduleEntry[] = [];

  for (const b of beneficiaries) {
    const step = intervalToMonths(b.interval);
    const n = Math.max(1, Math.floor(b.vest_months / step));

    const base = b.allocation / BigInt(n);
    const remainder = b.allocation - base * BigInt(n);

    for (let i = 0; i < n; i++) {
      const offsetMonths = b.cliff_months + i * step;
      const offsetSeconds = test_mode_seconds
        ? offsetMonths
        : offsetMonths * SECONDS_PER_MONTH;
      const amount = i === n - 1 ? base + remainder : base;
      out.push({
        beneficiary_wallet: b.wallet,
        beneficiary_label: b.label,
        unlock_timestamp: start_unix + offsetSeconds,
        amount: amount.toString(),
      });
    }
  }

  out.sort((a, b) => {
    if (a.unlock_timestamp !== b.unlock_timestamp)
      return a.unlock_timestamp - b.unlock_timestamp;
    return a.beneficiary_wallet.localeCompare(b.beneficiary_wallet);
  });

  return out;
}

export function computeCommitment(opts: {
  project_name: string;
  mint: string;
  schedule: ScheduleEntry[];
}): string {
  const canonical = JSON.stringify({
    project_name: opts.project_name,
    mint: opts.mint,
    schedule: opts.schedule.map((s) => ({
      beneficiary_wallet: s.beneficiary_wallet,
      beneficiary_label: s.beneficiary_label,
      unlock_timestamp: s.unlock_timestamp,
      amount: s.amount,
    })),
  });
  return createHash("sha256").update(canonical).digest("base64");
}
