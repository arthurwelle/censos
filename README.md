# Censos Demográficos do Brasil, 1970–2022

Mapa interativo dos seis censos demográficos brasileiros, cada um desenhado na
malha do seu próprio ano — eram 3.952 municípios em 1970 contra 5.570 em 2022.
Site estático (MapLibre GL + PMTiles), publicado no GitHub Pages.

**[Abrir o mapa →](https://arthurwelle.github.io/censos/)**

## O que tem aqui

Este repositório publica **o site, e só ele**: os dados já agregados, as malhas
em PMTiles, o JavaScript, o CSS, as fontes e as três páginas.

```
site/
  index.html               o mapa
  metodologia-geral.html   as decisões, os limites e o que não deu certo
  metodologia.html         a fórmula de cada indicador em cada censo
  data/                    um CSV por (censo, nível geográfico) e as pirâmides
  geo/                     PMTiles das malhas de cada censo
  js/ css/ fonts/
```

O que **produz** o site — o notebook de extração do BigQuery e os scripts de R
e Python — fica de fora por decisão, não por tamanho: eles apontam por caminho
absoluto para microdados de acesso controlado na máquina local. O que se
publica aqui é o resultado agregado por município, estado e área de ponderação.
A página de metodologia cita cada script pelo nome, então dá para saber o que
gerou o quê.

## Fontes

| censo | origem |
|---|---|
| 2022 | microdados de área de ponderação, IBGE (acesso controlado) |
| 1970–2010 | microdados da amostra, IBGE, via BigQuery |
| 1980, parte | microdado original em SPSS (Cesit/Unicamp) — 53 municípios que a extração não localiza e 24 indicadores que ela não tem como produzir |

Malhas do [geobr](https://ipeagit.github.io/geobr/). Basemap do
[OpenFreeMap](https://openfreemap.org/) sobre
[OpenStreetMap](https://www.openstreetmap.org/copyright).

## Duas coisas que vale ler antes de usar

**Rendimento está em reais de janeiro de 2026.** Cada censo mediu dinheiro na
moeda da sua época; os oito indicadores monetários são deflacionados pelo INPC,
a partir da nota técnica de Corseuil & Foguel (IPEA, 2002). A conta está na
[página de metodologia](https://arthurwelle.github.io/censos/metodologia-geral.html#deflator).

**Cada censo está na malha do seu ano.** O mapa mostra o país como ele era em
cada data. Comparar "o mesmo município" ao longo do tempo exige Áreas Mínimas
Comparáveis, que é outro exercício e não está feito.

## Licença

Os dados são do IBGE. O código do site é livre para uso e adaptação.
