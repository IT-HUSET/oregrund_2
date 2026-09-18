# Buyer case begränsat mänskligt inköpsbeslut

## Syfte

Simulera en halvdålig men praktisk inköpare. Inköparen försöker minska spill
jämfört med `base_case`, men använder bara uppenbara kombinationer och saknar
en global matematisk optimering. Resultatet måste normalt vara bättre än eller
lika med base case, men sämre än eller lika med `optimized_case`.

## Indata och gemensamma begränsningar

Använd samma kapbitar, stocklängder, enheter och sågklingebredd som i
`base_case.md`. Material får endast kombineras när följande är identiskt:

- materialtyp
- bredd i mm
- höjd i mm
- hållfasthetsklass

Alla efterfrågade kapbitar måste levereras exakt en gång. En kapbit får aldrig
delas, och en restbit från en annan dimensionsgrupp får aldrig användas.

## Heuristik för inköparen

Inköparen får kapa högst två efterfrågade plankor ur en inköpt träbit.

1. Dela först upp kapbitar i kompatibla dimensionsgrupper.
2. Sortera varje grupp efter längd, längst först.
3. För den längsta ännu ej tilldelade kapbiten, leta efter högst en annan
   kapbit som tillsammans ryms i en tillåten stocklängd inklusive
   sågklingebredd.
4. Välj en kombination som lämnar minst restbit, men bara bland direkta par
   där båda kapbitarna är ännu ej använda.
5. Om inget par ryms, köp en egen kortaste möjliga stockbit enligt base case.
6. Fortsätt tills samtliga kapbitar är tilldelade.

Detta är medvetet en lokal greedy-metod. Modellen får inte göra om tidigare
val, leta bland tre eller fler kapbitar per stockbit, eller använda global
backtracking. Syftet är att representera rimliga men ofullständiga manuella
inköpsbeslut.

## Spillberäkning

För en stockbit med en eller två kapbitar:

```text
spill_mm = stocklängd_mm - summa(kaplängder_mm) - antal_kapningar * sågklingebredd_mm
```

Räkna också antal kapbitar per köpt träbit. Medelvärdet får aldrig överstiga
två i detta scenario.

## Krav på resultatfil

Skriv exempelvis `output/simulation_buyer_case.json`. Använd samma
totalfält som för base case och inkludera dessutom:

- `cut_patterns`, en lista av köpta stockbitar och de en eller två kapbitar de
  används till
- antal stockbitar med en kapbit respektive två kapbitar
- antal återstående restbitar; dessa är spill och ska inte återanvändas
- besparing i spill jämfört med resultatet från `simulation_base_case.json`

Rapportera fel tydligt om en kapbit inte ryms i någon stocklängd. Tyst
dimensionserättning eller bortfiltrering är inte tillåten.
