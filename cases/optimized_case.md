# Optimized case global kapoptimering

## Syfte

Simulera den bästa möjliga användningen av tillåtna stockplankor för att minimera
spill. Detta är ett 1D cutting-stock/bin-packing-problem och ska lösas per
kompatibel materialgrupp med en exakt metod eller en dokumenterad
högkvalitativ heuristik.

## Indata och icke förhandlingsbara krav

Använd alltid och endast `data/components.xml` som ritningskälla. Extrahera varje
`FRAMEPIECE` med dess `WIDTH`, `HEIGHT`, `LENGTH`, `MAT_CODE`, `USE` och
identifierare.

Använd Derome som enda inköpskälla och samma tidsstämplade
`output/derome_stock_catalog.json` som base case och buyer case. Katalogen
ska byggas från Deromes konstruktionsvirke-, limträbalk- och
trävarusortimentssidor, enligt länkarna i `base_case.md`, och innehålla
faktiskt tillgängliga stocklängder per material/dimension/hållfasthetsklass.
Endast katalogens stockplankor får användas; saknade exakta grupper ska
rapporteras som `unsupported` utan substitution.

Använd `sågklingebredd_mm = 4.5` i varje kapning. Kapplankor får bara kombineras om materialtyp, bredd, höjd och hållfasthetsklass
Kapplankor får bara kombineras om materialtyp, bredd, höjd och hållfasthetsklass
är identiska. Längden behöver inte vara identisk: en 10 m stockplanka kan
exempelvis kombineras för en 6 m och en 2 m kapplanka, med 2 m spill före kerf.
Varje efterfrågad kapplanka måste produceras exakt en gång.

För en kapplanka med längd `L` krävs platsen `L + kerf` i en stockplanka, med
undantaget att modeller kan välja att inte lägga kerf efter den sista kapningen
om denna konvention deklareras konsekvent i resultatet.

## Optimeringsmål

Primärt mål:

```text
minimera total spillängd
```

Sekundära mål, i denna ordning:

1. minimera antal inköpta stockplankor
2. minimera antal olika använda stocklängder
3. välj deterministiskt den lexikografiskt minsta ordningen av kapmönster

Modellen får lägga valfritt antal kompatibla kapplankor i samma stockplanka, så
länge kaplängder och sågklingebredd ryms. Till skillnad från buyer case ska
den hitta kombinationer som inte är uppenbara lokalt, exempelvis flera korta
kapplankor som tillsammans fyller restlängden från en lång kapplanka.

## Validering

Kontrollera före leverans att:

- varje kapplankas `id` förekommer exakt en gång i kapmönstren
- inget kapmönster överskrider vald stocklängd
- inga inkompatibla material, bredder, höjder eller hållfasthetsklasser kombineras
- summan av spill per stockplanka är lika med rapporterat totalt spill
- resultatet inte har större spill än buyer case för samma indata och
  antaganden; om det ändå sker måste optimeringsbegränsningen förklaras

## Krav på resultatfil

Skriv exempelvis `output/simulation_optimized_case.json`, med samma gemensamma
fält som de andra fallen samt:

- metod, solver/heuristik och eventuell tidsgräns
- ett kapmönster per köpt stockplanka med kapplanke-id:n och längder
- utnyttjandegrad per stockplanka
- total spillängd och spillprocent
- spillbesparing relativt base case och buyer case
- tydlig lista över kapplankor som inte kunde planeras

Om optimalitet kan bevisas ska `optimality_proven` vara `true`; annars ska
resultatet märkas som en bästa funnen lösning, inte som perfekt optimering.

## Filer som Codex ska generera

När denna instruktion ges till en Codex-modell ska modellen skapa:

1. `simulate_optimized_case.py` - en körbar Python-fil som läser
   `data/components.xml` och utför optimeringen per kompatibel grupp.
2. `output/simulation_optimized_case.json` - resultatfilen från körningen.

JSON-filen ska dokumentera metod, solver/heuristik, tidsgräns om en sådan
används, antal inlästa `FRAMEPIECE`-poster, kapmönster, spill per stockplanka,
totalt estimerat spill, 4,5 mm sågsnitt, katalogens hämtningstid,
optimalitetsstatus och ej hanterade poster. Den får inte läsa prisdata eller
använda en annan fil i `data/` som ritningsindatakälla.
