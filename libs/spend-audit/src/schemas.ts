import { z } from "zod";

export const TX_TYPES = [
  "card",
  "transfer",
  "direct-debit",
  "standing-order",
  "cash",
  "fee",
  "income",
  "other",
] as const;

export const CATEGORIES = [
  "groceries",
  "food-delivery",
  "restaurants",
  "eshop",
  "household-goods",
  "kids",
  "clothing",
  "housing",
  "energy",
  "telco",
  "streaming",
  "software-cloud",
  "other-subscriptions",
  "transport-fuel",
  "transport-ride",
  "transport-public",
  "health",
  "education",
  "leisure",
  "travel",
  "insurance",
  "financial",
  "gifts-charity",
  "cash",
  "household-transfer",
  "savings-investment",
  "income",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type Bucket = "needs" | "wants" | "savings" | "none";

/** category -> [50/30/20 bucket, ČSÚ COICOP division (null = no clean counterpart, never benchmarked)]. */
export const CATEGORY_MAP: Record<Category, [Bucket, string | null]> = {
  groceries: ["needs", "01"],
  "food-delivery": ["wants", "11"],
  restaurants: ["wants", "11"],
  eshop: ["wants", null],
  "household-goods": ["needs", "05"],
  kids: ["needs", "13"],
  clothing: ["wants", "03"],
  housing: ["needs", "04"],
  energy: ["needs", "04"],
  telco: ["needs", "08"],
  streaming: ["wants", "08"],
  "software-cloud": ["wants", "08"],
  "other-subscriptions": ["wants", "09"],
  "transport-fuel": ["needs", "07"],
  "transport-ride": ["wants", "07"],
  "transport-public": ["needs", "07"],
  health: ["needs", "06"],
  education: ["needs", "10"],
  leisure: ["wants", "09"],
  travel: ["wants", "09"],
  insurance: ["needs", "12"],
  financial: ["none", "12"],
  "gifts-charity": ["wants", "13"],
  cash: ["none", null],
  "household-transfer": ["none", null],
  "savings-investment": ["savings", null],
  income: ["none", null],
  other: ["none", null],
};

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

export const StatementLine = z.object({
  kind: z.literal("statement"),
  id: z.string().min(1),
  from: date,
  to: date,
  /** null for a CSV export without balances: such a statement is not reconciled. */
  opening: z.number().nullable(),
  closing: z.number().nullable(),
  credits: z.number().nullish(),
  debits: z.number().nullish(),
});
export type Statement = z.infer<typeof StatementLine>;

export const TxLine = z.object({
  kind: z.literal("tx"),
  statement: z.string().min(1),
  date,
  amount: z.number(),
  currency: z.string().default("CZK"),
  origAmount: z.number().nullish(),
  origCurrency: z.string().nullish(),
  type: z.enum(TX_TYPES),
  counterparty: z.string().default(""),
  account: z.string().nullish(),
  message: z.string().default(""),
});
export type TxIn = z.infer<typeof TxLine>;

/** transactions.json row: anonymised account, derived merchant key, household flag. */
export const Tx = TxLine.omit({ kind: true }).extend({
  id: z.string(),
  merchant: z.string(),
  household: z.boolean(),
});
export type Tx = z.infer<typeof Tx>;

export const Categories = z.record(
  z.string(),
  z.object({
    name: z.string().min(1),
    category: z.enum(CATEGORIES),
    service: z.boolean().default(false),
  }),
);
export type CategoryMap = z.infer<typeof Categories>;

export const Benchmark = z.object({
  year: z.number().nullable(),
  source: z.string(),
  url: z.string(),
  householdType: z.string(),
  /** CZ-COICOP 2018 division ("01".."13") -> Kč per person per month; null = no benchmark. */
  perPersonMonthly: z.record(z.string(), z.number().nullable()),
});
export type Benchmark = z.infer<typeof Benchmark>;

// ---------------------------------------------------------------- findings

export const Recurring = z.object({
  id: z.string(),
  merchant: z.string(),
  name: z.string(),
  category: z.enum(CATEGORIES),
  cadence: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  count: z.number(),
  first: date,
  last: date,
  firstAmount: z.number(),
  lastAmount: z.number(),
  monthlyCost: z.number(),
  annualCost: z.number(),
  active: z.boolean(),
  priceCreep: z.object({ from: z.number(), to: z.number(), pct: z.number() }).nullable(),
  trial: z.boolean(),
  overlapGroup: z.enum(["streaming", "software-cloud"]).nullable(),
});
export type Recurring = z.infer<typeof Recurring>;

export const Duplicate = z.object({
  id: z.string(),
  merchant: z.string(),
  name: z.string(),
  amount: z.number(),
  dates: z.tuple([date, date]),
  resolved: z.boolean(),
  refundDate: date.nullable(),
});

export const Large = z.object({
  id: z.string(),
  date,
  merchant: z.string(),
  name: z.string(),
  category: z.enum(CATEGORIES),
  amount: z.number(),
  reason: z.string(),
});

const Merchantish = z.object({
  merchant: z.string(),
  name: z.string(),
  category: z.enum(CATEGORIES),
  total: z.number(),
  count: z.number(),
  ordersPerMonth: z.number(),
});

export const CategoryFinding = z.object({
  id: z.string(),
  category: z.enum(CATEGORIES),
  bucket: z.enum(["needs", "wants", "savings", "none"]),
  total: z.number(),
  monthlyAvg: z.number(),
  series: z.array(z.object({ month: z.string(), amount: z.number(), rolling3: z.number() })),
  yoyPct: z.number().nullable(),
  slopePctPerYear: z.number().nullable(),
});
export type CategoryFinding = z.infer<typeof CategoryFinding>;

export const Findings = z.object({
  period: z.object({ from: date, to: date, months: z.number() }),
  benchmarkSource: z.string(),
  recurring: z.array(Recurring),
  duplicates: z.array(Duplicate),
  large: z.array(Large),
  categories: z.array(CategoryFinding),
  /** ČSÚ comparison per COICOP division; `id` is the C- id of its largest category. */
  divisions: z.array(
    z.object({
      id: z.string(),
      division: z.string(),
      categories: z.array(z.string()),
      monthlyActual: z.number(),
      monthlyBenchmark: z.number(),
      excessMonthly: z.number(),
      flagged: z.boolean(),
    }),
  ),
  micro: z.object({
    threshold: z.number(),
    count: z.number(),
    total: z.number(),
    byCategory: z.array(z.object({ category: z.string(), count: z.number(), total: z.number() })),
    byMerchant: z.array(z.object({ merchant: z.string(), count: z.number(), total: z.number() })),
  }),
  top: z.object({ bySum: z.array(Merchantish), byCount: z.array(Merchantish) }),
  /** eshop/groceries merchants with >= 2 orders a month: membership (Prime-like) candidates. */
  memberships: z.array(Merchantish.extend({ id: z.string() })),
  fees: z.object({ feesTotal: z.number(), fxVolume: z.number(), fxCount: z.number() }),
  opaque: z.object({ cash: z.number(), householdTransfers: z.number(), shareOfDebits: z.number() }),
  cashflow: z.object({
    income: z.number(),
    debits: z.number(),
    savingsRate: z.number(),
    fixed: z.number(),
    variable: z.number(),
    split: z.object({
      needs: z.number(),
      wants: z.number(),
      savings: z.number(),
      other: z.number(),
    }),
  }),
});
export type Findings = z.infer<typeof Findings>;

// ---------------------------------------------------------------- needs / offers / savings

export const Needs = z.object({
  decisions: z
    .array(
      z.object({
        id: z.string(),
        decision: z.enum(["keep", "cancel", "cheaper", "unknown"]),
        requirements: z.string().default(""),
      }),
    )
    .default([]),
  duplicates: z.array(z.object({ id: z.string(), confirmed: z.boolean() })).default([]),
  categories: z
    .array(
      z.object({
        id: z.string(),
        decision: z.enum(["cut", "ok"]),
        targetMonthly: z.number().nullish(),
      }),
    )
    .default([]),
});
export type Needs = z.infer<typeof Needs>;

export const Offers = z.object({
  offers: z.array(
    z.object({
      item: z.string(),
      provider: z.string().default(""),
      plan: z.string().default(""),
      monthly: z.number(),
      activationFee: z.number().default(0),
      promoMonthly: z.number().nullish(),
      promoMonths: z.number().nullish(),
      url: z.string().default(""),
      checkedAt: z.string().default(""),
      conditions: z.string().default(""),
      missing: z.string().default(""),
      verified: z.boolean().default(false),
    }),
  ),
});
export type Offer = z.infer<typeof Offers>["offers"][number];

export const SavingsItem = z.object({
  id: z.string(),
  tier: z.enum(["certain", "verified", "target", "possible"]),
  kind: z.enum(["cancel", "duplicate", "offer", "category", "unanswered"]),
  /** Annualised saving (recurring items) or the one-off amount (duplicates). */
  annual: z.number(),
  oneOff: z.boolean(),
  /** Offers only: first-12 and first-24-month savings incl. activation fee and post-promo price. */
  saving12: z.number().nullable(),
  saving24: z.number().nullable(),
  label: z.string(),
  offer: Offers.shape.offers.element.nullable(),
});
export type SavingsItem = z.infer<typeof SavingsItem>;

export const Savings = z.object({
  headline: z.object({ certain: z.number(), verified: z.number(), total: z.number() }),
  target: z.number(),
  possible: z.number(),
  items: z.array(SavingsItem),
});
export type Savings = z.infer<typeof Savings>;
