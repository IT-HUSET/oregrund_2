# Base case en stockplanka per kapplanka

## Syfte

Simulera en medvetet enkel referensnivå för virkesutnyttjande. Varje
efterfrågad kapplanka får en egen inköpt stockplanka. Ingen restbit används för
en annan kapplanka. Detta är jämförelsevärdet som `buyer_case` och
`optimized_case` ska förbättra.

## Begrepp

- **Stockplanka**: den hela träbit/planka som köps in, till exempel 10 000 mm.
- **Kapplanka**: den längd som ska tas ut för byggnaden, till exempel 6 000 mm.
- **Spill**: längden som återstår efter kapning och eventuell sågklingebredd.

En stockplanka kan bara användas för kapplankor med samma material, bredd,
höjd och hållfasthetsklass. Längderna får däremot vara olika. En stockplanka
på 10 m kan alltså ge en kapplanka på 6 m och en på 2 m; utan sågklingebredd
blir då 2 m spill.

## Indata

Läs trädelar från `data/` eller från en redan framtagen datapunktsfil. Varje
efterfrågad kapplanka måste minst innehålla:

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
`[2400, 2700, 3000, ..., 12000]`. Använd aldrig en kortare stockplanka än kapplankans
längd plus sågklingebredd.

## Regler

1. Behandla varje kapplanka som en separat efterfrågan, även när flera har samma
   dimension och längd.
2. Välj den kortaste tillåtna stocklängden som rymmer just den kapplankan.
3. Köp en ny stockplanka per kapplanka.
4. Kapa exakt en kapplanka ur varje inköpt stockplanka.
5. Restlängden blir spill och får inte återanvändas.
6. Gruppera aldrig material med olika materialtyp, bredd, höjd eller
   hållfasthetsklass. De är inte utbytbara.
7. Om ingen tillåten stocklängd rymmer en kapplanka ska den rapporteras som
   `unsupported`; byt inte dimension och dela inte automatiskt kapplankan.

## Spillberäkning

För varje köpt stockplanka:

```text
spill_mm = stocklängd_mm - kapplankans_längd_mm - sågklingebredd_mm
```

Den normala startinställningen är `sågklingebredd_mm = 0`. Om en
sågklingebredd används ska den redovisas i resultatet och appliceras på varje
utförd kapning.

## Krav på resultatfil

Skriv en ny JSON-fil, exempelvis `output/simulation_base_case.json`, med:

- scenario-namn och använda antaganden
- stocklängder och sågklingebredd
- en rad per efterfrågad kapplanka med vald stocklängd och spill
- efterfrågad total längd, inköpt total längd och totalt spill
- spillprocent av inköpt längd
- antal köpta stockplankor, antal levererade kapplankor och antal ej möjliga kapplankor
- full spårbarhet från varje kapplanka tillbaka till dess ursprungliga `id`

Scenario är giltigt endast när antalet levererade kapplankor per unik
material/dimensions-/hållfasthetsgrupp är exakt lika stort som efterfrågan.
