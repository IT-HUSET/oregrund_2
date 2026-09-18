# Jämförelse av base case buyer case och optimized case

## Syfte

Använd denna fil för att jämföra tre simuleringar som bygger på exakt samma
ritningsdata, stocklängder och sågklingebredd:

- `base_case`: en köpt träbit per kapbit
- `buyer_case`: lokal greedy-kombination med högst två kapbitar per träbit
- `optimized_case`: global optimering med valfritt antal kompatibla kapbitar

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
- minskning i antal inköpta träbitar jämfört med base case
- ytterligare spillminskning jämfört med buyer case

## Största konceptuella skillnader

| Område | Base case | Buyer case | Optimized case |
| --- | --- | --- | --- |
| Kapbitar per träbit | Exakt 1 | Högst 2 | Valfritt antal som ryms |
| Beslutsmetod | Ingen samordning | Lokal greedy | Global optimering |
| Återanvändning av restlängd | Nej | Bara i uppenbara par vid första kapningen | Ja, genom hela kapmönstret |
| Förväntat spill | Högst | Lägre | Lägst eller lika lågt |
| Syfte | Referensvärde | Realistisk manuell nivå | Teoretiskt/bäst funnet resultat |

## Krav på jämförelseresultat

Skriv exempelvis `output/simulation_comparison.json` och en kort
maskinläsbar slutsats. Resultatet ska alltid ange vilka antaganden som är
gemensamma samt varna om en lösning inte uppfyller all efterfrågan. Ett lägre
spill är bara giltigt som förbättring när rätt antal kapbitar faktiskt har
producerats.
