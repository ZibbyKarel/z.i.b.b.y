import { describe, expect, it } from "vitest";
import { parseAirBankLayout } from "./extract.ts";

// Synthetic pypdf-layout text: header block, 2-line card payment, FX line, incoming transfer,
// outgoing transfer with an empty name, page break with footers, standing order.
const LAYOUT = [
  "=== PAGE 1",
  "                                                                                                    Ing. Test Tester",
  "                                                                                                    Ulice 1",
  "                                                                                                    100 00 Mesto",
  "",
  "Výpis z běžného účtu",
  "",
  "Číslo účtu: 1000000001 / 3030                                    Název účtu: Primary",
  "",
  "Období výpisu: 21. 4. 2024 - 21. 5. 2024                         Datum výpisu: 22. 5. 2024",
  "",
  "Počáteční zůstatek:                   1 000,00                   Připsáno na účet: 5 000,00",
  "",
  "Konečný zůstatek:                     2 400,50                   Odepsáno z účtu: 3 599,50",
  "",
  "",
  "Zaúčtování     Typ                      Název",
  "Provedení      Kód transakce            Číslo účtu / debetní karty        Detaily        Částka CZK       Poplatky",
  "",
  " 22.04.2024     Platba kartou           Ing. Test Tester                              Shop One Main Street 1,                                   -40,00        0,00",
  "18.04.2024      90000000001             123456******1234                              City, 30460, 30",
  "",
  " 23.04.2024     Platba kartou           Ing. Test Tester                              Euro Cafe Canal                                        -1 982,40        0,00",
  "21.04.2024      90000000002             123456******1234                              Amsterdam, 1017 SG, NLD",
  "                                                                                            77,32 EUR kurz: 25,122 CZK/EUR",
  "",
  " 24.04.2024     Příchozí úhrada         ACME TEST, S.R.O.                             Invoice 2024001                                         5 000,00        0,00",
  "24.04.2024      90000000003             721-77627311 / 0710                           ",
  "",
  " 24.04.2024     Odchozí úhrada                                                        VS1234567890                                           -1 500,00        0,00",
  "24.04.2024      90000000004             705-1234567 / 0710                            Test Tester",
  "",
  "                                                                      Pokračování na straně 2",
  "",
  "                                                                                                                                            1/2",
  "                                                            Air Bank a.s. / Evropská 2690/17 / 160 00 Praha 6",
  "=== PAGE 2",
  "Zaúčtování      Typ                        Název",
  "Provedení       Kód transakce              Číslo účtu / debetní karty",
  "",
  " 25.04.2024     Trvalý příkaz                                                         Rent May                                                  -77,10        0,00",
  "25.04.2024      90000000005             6850057 / 2700                                VS4140881154 / SS999",
  "                                                                                            Rent May",
  "",
].join("\n");

describe("parseAirBankLayout", () => {
  const { statement, tx } = parseAirBankLayout(LAYOUT, "2024-04_2024-05");

  it("parses the statement header from page 1", () => {
    expect(statement).toEqual({
      kind: "statement",
      id: "2024-04_2024-05",
      from: "2024-04-21",
      to: "2024-05-21",
      opening: 1000,
      closing: 2400.5,
      credits: 5000,
      debits: -3599.5,
    });
  });

  it("reads every transaction and reconciles to the header", () => {
    expect(tx).toHaveLength(5);
    const sumOf = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
    expect(sumOf(tx.map((t) => t.amount))).toBe(1400.5);
    expect(sumOf(tx.filter((t) => t.amount > 0).map((t) => t.amount))).toBe(5000);
  });

  it("card payment: cardholder column skipped, merchant from details", () => {
    expect(tx[0]).toMatchObject({
      date: "2024-04-22",
      amount: -40,
      type: "card",
      counterparty: "Shop One Main Street 1,",
      account: null,
    });
  });

  it("FX line becomes a negative original amount", () => {
    expect(tx[1]).toMatchObject({ amount: -1982.4, origAmount: -77.32, origCurrency: "EUR" });
  });

  it("incoming transfer keeps name, account and message", () => {
    expect(tx[2]).toMatchObject({
      type: "income",
      counterparty: "ACME TEST, S.R.O.",
      account: "721-77627311 / 0710",
      message: "Invoice 2024001",
    });
  });

  it("outgoing transfer without a name is a transfer", () => {
    expect(tx[3]).toMatchObject({ type: "transfer", amount: -1500, account: "705-1234567 / 0710" });
  });

  it("standing order after the page break (footer lines ignored)", () => {
    expect(tx[4]).toMatchObject({
      type: "standing-order",
      amount: -77.1,
      date: "2024-04-25",
      account: "6850057 / 2700",
    });
  });

  it("throws on a missing header", () => {
    expect(() => parseAirBankLayout("=== PAGE 1\nnothing", "x")).toThrow(/Období výpisu/);
  });
});
