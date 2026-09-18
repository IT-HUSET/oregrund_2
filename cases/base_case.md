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
på 10 m kan alltså ge en kapplanka på 6 m och en på 2 m. Detta motsvarar 2 m
spill före sågklingebredd; med det obligatoriska 4,5 mm sågsnittet räknas
spillet längre ned.

## Indata

Använd alltid och endast `data/components.xml` som källa för detta scenario.
Filen är en strukturerad Vertex CAD-export och innehåller individuella
`FRAMEPIECE`-poster med `WIDTH`, `HEIGHT`, `LENGTH`, `MAT_CODE`, `USE` och
spårbar identifierare. Den är mer lämplig än PDF-ritningarna för exakta
spillberäkningar.

Vid inläsning av `FRAMEPIECE` ska `MAT_CODE = GL` mappas till materialtypen
`glulam`; övriga poster mappas till `timber`. Samma regel finns i
`data/stock_sizes.json` under `component_material_mapping` och måste användas
i alla scenarier.

Använd alltid `data/stock_sizes.json` som enda inköpskatalog för
stockplankor. Filen är den godkända, versionsstyrda simuleringsbasen och
innehåller en angiven leverantör per material-/dimension-/hållfasthetsprofil
samt tillåtna stocklängder. Läs `stock_profiles` och slå upp den refererade
`length_set`; hämta inte data från nätet.

Katalogen ska täckningstestas mot varje unik grupp i `components.xml`. En
stockplanka är tillåten enbart om samma material, bredd, höjd och
hållfasthetsklass finns i `stock_sizes.json`. Längden får vara längre än
kapplankans längd. Saknas en exakt grupp ska den rapporteras som
`unsupported`; substituera aldrig till en annan dimension eller
hållfasthetsklass.

Varje efterfrågad kapplanka måste minst innehålla:

```json
{
  "id": "unik-identitet",
  "material": "timber",
  "dimensions_mm": { "width": 45, "height": 95, "length": 3100 },
  "strength_class": "C24",
  "quantity": 1
}
```

Stocklängder ska komma från `data/stock_sizes.json`, inte från en hårdkodad lista.
Använd aldrig en kortare stockplanka än kapplankans längd plus
sågklingebredd.

## Sågsnitt

Använd `sågklingebredd_mm = 4.5` i alla beräkningar. Det representerar ett
sågsnitt inom intervallet 4-5 mm. Reservera 4,5 mm för varje kapplanka som tas
ut ur en stockplanka. Exempel: 6 000 mm + 2 000 mm från en 10 000 mm
stockplanka lämnar 1 991 mm spill när två sågsnitt om 4,5 mm räknas med.

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

Sågklingebredden är alltid 4,5 mm och ska redovisas i resultatet samt
appliceras på varje utförd kapning.

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

## Filer som Codex ska generera

När denna instruktion ges till en Codex-modell ska modellen skapa:

1. `simulate_base_case.py` - en körbar Python-fil som läser
   `data/components.xml`, bygger kapplankeindata och utför reglerna ovan.
2. `output/simulation_base_case.json` - resultatfilen från körningen.

Python-filen ska vara reproducerbar, använda millimeter internt och skriva
alla antaganden i resultatfilen. JSON-resultatet ska innehålla relevanta
diagnostikfält, till exempel antal inlästa `FRAMEPIECE`-poster, antal
kapplankor, antal köpta stockplankor, spill per kapmönster, katalogtäckning,
använt `profile_id` och angiven leverantör samt ej hanterade poster. Den får
inte läsa prisdata, använda nätet eller läsa andra filer som ritningsindata.
