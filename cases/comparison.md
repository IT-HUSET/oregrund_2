# Jämförelse av base case buyer case och optimized case

## Syfte

Använd denna fil för att jämföra tre simuleringar som bygger på exakt samma
ritningsdata, inköpskatalog, stocklängder och sågklingebredd. Den enda
tillåtna ursprungliga ritningsdatakällan är `data/components.xml`; samtliga tre
simuleringar ska ha läst samma `FRAMEPIECE`-poster från denna fil. Den enda
tillåtna inköpskatalogen är `data/stock_sizes.json`; samtliga ska ha använt
samma version och samma profiler från denna fil:

- `base_case`: en köpt stockplanka per kapplanka
- `buyer_case`: lokal greedy-kombination med högst två kapplankor per stockplanka
- `optimized_case`: global optimering med valfritt antal kompatibla kapplankor

En kombination är bara tillåten när material, bredd, höjd och hållfasthetsklass
är samma. Kapplankornas längder får vara olika. Till exempel är 6 m + 2 m från
en 10 m stockplanka tillåtet och ger 1 991 mm spill efter två sågsnitt om
4,5 mm.

Jämför inte resultat som bygger på olika indatamängder eller olika
stocklängder. I så fall ska skillnaden redovisas som ej jämförbar.

## Fält som ska jämföras

För varje scenario, sammanställ:

```json
{
  "scenario": "base_case",
  "required_length_m": 0,
  "purchased_length_m": 0,
  "waste_length_m": 0,
  "waste_percent_of_purchased_length": 0,
  "purchased_stock_pieces": 0,
  "delivered_cut_pieces": 0,
  "unsupported_cut_pieces": 0,
  "average_cut_pieces_per_stock_piece": 0
}
```

Beräkna dessutom för buyer case och optimized case:

- spillminskning i meter jämfört med base case
- spillminskning i procent jämfört med base case
- minskning i antal inköpta stockplankor jämfört med base case
- ytterligare spillminskning jämfört med buyer case

## Största konceptuella skillnader

| Område | Base case | Buyer case | Optimized case |
| --- | --- | --- | --- |
| Kapplankor per stockplanka | Exakt 1 | Högst 2 | Valfritt antal som ryms |
| Beslutsmetod | Ingen samordning | Lokal greedy | Global optimering |
| Kombination av olika längder | Nej | Ja, högst två kompatibla kapplankor | Ja, valfritt antal kompatibla kapplankor |
| Återanvändning av restlängd | Nej | Bara i uppenbara par vid första kapningen | Ja, genom hela kapmönstret |
| Förväntat spill | Högst | Lägre | Lägst eller lika lågt |
| Syfte | Referensvärde | Realistisk manuell nivå | Teoretiskt/bäst funnet resultat |

## Krav på jämförelseresultat

Skriv exempelvis `output/simulation_comparison.json` och en kort
maskinläsbar slutsats. Resultatet ska alltid ange vilka antaganden som är
gemensamma samt varna om en lösning inte uppfyller all efterfrågan. Ett lägre
spill är bara giltigt som förbättring när rätt antal kapplankor faktiskt har
producerats.

## Filer som Codex ska generera

Efter att de tre scenarioresultaten finns ska Codex skapa:

1. `compare_cases.py` - en körbar Python-fil som läser
   `output/simulation_base_case.json`, `output/simulation_buyer_case.json`
   och `output/simulation_optimized_case.json`.
2. `output/simulation_comparison.json` - jämförelseresultatet.

Skriptet måste först verifiera att alla tre resultat anger
`data/components.xml` som ritningsindatakälla, samma
`data/stock_sizes.json`-version och samma profiler, samma stocklängder och
`sågklingebredd_mm = 4.5`. Om detta inte stämmer ska jämförelsen avbrytas med
ett tydligt fel i resultatfilen i stället för att jämföra inkompatibla
spillvärden.
