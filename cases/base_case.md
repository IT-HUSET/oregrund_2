# Base case en träbit per planka

## Syfte

Simulera en medvetet enkel referensnivå för virkesutnyttjande. Varje
efterfrågad planka/kapbit får en egen inköpt träbit. Ingen restbit används för
en annan kapbit. Detta är jämförelsevärdet som `buyer_case` och
`optimized_case` ska förbättra.

## Indata

Läs trädelar från `data/` eller från en redan framtagen datapunktsfil. Varje
efterfrågad kapbit måste minst innehålla:

```json
{
  "id": "unik-identitet",
  "material": "timber",
  "dimensions_mm": { "width": 45, "height": 95, "length": 3100 },
  "strength_class": "C24",
  "quantity": 1
}
```

Stocklängder ska ges som en konfigurerbar lista i millimeter, exempelvis
`[2400, 2700, 3000, ..., 12000]`. Använd aldrig en kortare träbit än kapbitens
längd plus sågklingebredd.

## Regler

1. Behandla varje kapbit som en separat efterfrågan, även när flera har samma
   dimension och längd.
2. Välj den kortaste tillåtna stocklängden som rymmer just den kapbiten.
3. Köp en ny stockbit per kapbit.
4. Kapa exakt en kapbit ur varje inköpt stockbit.
5. Restlängden blir spill och får inte återanvändas.
6. Gruppera aldrig material med olika materialtyp, bredd, höjd eller
   hållfasthetsklass. De är inte utbytbara.
7. Om ingen tillåten stocklängd rymmer en kapbit ska den rapporteras som
   `unsupported`; byt inte dimension och dela inte automatiskt kapbiten.

## Spillberäkning

För varje köpt träbit:

```text
spill_mm = stocklängd_mm - kaplängd_mm - sågklingebredd_mm
```

Den normala startinställningen är `sågklingebredd_mm = 0`. Om en
sågklingebredd används ska den redovisas i resultatet och appliceras på varje
utförd kapning.

## Krav på resultatfil

Skriv en ny JSON-fil, exempelvis `output/simulation_base_case.json`, med:

- scenario-namn och använda antaganden
- stocklängder och sågklingebredd
- en rad per efterfrågad kapbit med vald stocklängd och spill
- efterfrågad total längd, inköpt total längd och totalt spill
- spillprocent av inköpt längd
- antal köpta träbitar, antal levererade kapbitar och antal ej möjliga kapbitar
- full spårbarhet från varje kapbit tillbaka till dess ursprungliga `id`

Scenario är giltigt endast när antalet levererade kapbitar per unik
material/dimensions-/hållfasthetsgrupp är exakt lika stort som efterfrågan.
