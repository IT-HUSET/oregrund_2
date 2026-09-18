# Buyer case begränsat mänskligt inköpsbeslut

## Syfte

Simulera en halvdålig men praktisk inköpare. Inköparen försöker minska spill
jämfört med `base_case`, men använder bara uppenbara kombinationer och saknar
en global matematisk optimering. Resultatet måste normalt vara bättre än eller
lika med base case, men sämre än eller lika med `optimized_case`.

## Indata och gemensamma begränsningar

Använd samma kapplankor, stocklängder, enheter och sågklingebredd som i
`base_case.md`. Material får endast kombineras när följande är identiskt:

- materialtyp
- bredd i mm
- höjd i mm
- hållfasthetsklass

Kapplankornas längder behöver inte vara identiska för att kombineras. Exempel:
en 10 m stockplanka med två kapplankor på 6 m respektive 2 m lämnar 2 m spill
före hänsyn till sågklingebredd. Alla efterfrågade kapplankor måste levereras
exakt en gång. En kapplanka får aldrig delas, och en restbit från en annan
dimensionsgrupp får aldrig användas.

## Heuristik för inköparen

Inköparen får kapa högst två efterfrågade kapplankor ur en inköpt stockplanka.

1. Dela först upp kapplankor i kompatibla grupper med samma material, bredd,
   höjd och hållfasthetsklass. Olika längder är tillåtna inom gruppen.
2. Sortera varje grupp efter längd, längst först.
3. För den längsta ännu ej tilldelade kapplankan, leta efter högst en annan
   kapplanka som tillsammans ryms i en tillåten stocklängd inklusive
   sågklingebredd.
4. Välj en kombination som lämnar minst restbit, men bara bland direkta par
   där båda kapplankorna är ännu ej använda.
5. Om inget par ryms, köp en egen kortaste möjliga stockplanka enligt base case.
6. Fortsätt tills samtliga kapplankor är tilldelade.

Detta är medvetet en lokal greedy-metod. Modellen får inte göra om tidigare
val, leta bland tre eller fler kapplankor per stockplanka, eller använda global
backtracking. Syftet är att representera rimliga men ofullständiga manuella
inköpsbeslut.

## Spillberäkning

För en stockplanka med en eller två kapplankor:

```text
spill_mm = stocklängd_mm - summa(kapplankornas_längder_mm) - antal_kapningar * sågklingebredd_mm
```

Räkna också antal kapplankor per köpt stockplanka. Medelvärdet får aldrig överstiga
två i detta scenario.

## Krav på resultatfil

Skriv exempelvis `output/simulation_buyer_case.json`. Använd samma
totalfält som för base case och inkludera dessutom:

- `cut_patterns`, en lista av köpta stockplankor och de en eller två kapplankor de
  används till
- antal stockplankor med en kapplanka respektive två kapplankor
- antal återstående restbitar; dessa är spill och ska inte återanvändas
- besparing i spill jämfört med resultatet från `simulation_base_case.json`

Rapportera fel tydligt om en kapplanka inte ryms i någon stocklängd. Tyst
dimensionserättning eller bortfiltrering är inte tillåten.
