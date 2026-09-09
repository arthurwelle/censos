// Substitui o d3 (273 KB) no que este site usava dele: viridis, escala
// sequencial, classificacao em classes e leitura de CSV.

// ------------------------------------------------------------- paletas
// Cada paleta e uma lista de pontos RGB; rampa() interpola linearmente entre
// eles. Amostrar em 9 a 16 pontos ja fica indistinguivel da rampa continua
// nesta aplicacao, e evita carregar uma biblioteca de cores inteira.
//
// A escolha padrao vem da DIRECAO do indicador, nao do gosto: viridis onde
// "mais" e melhor ou pior, cividis onde e composicao sem juizo (cor ou raca,
// condicao de ocupacao). Usar viridis numa composicao sugere um julgamento que
// o dado nao carrega. O usuario pode sobrepor isso pelo seletor.
const PONTOS = {
  viridis: [
    [68, 1, 84], [71, 24, 106], [72, 45, 117], [69, 65, 125], [64, 83, 129],
    [58, 100, 132], [52, 116, 134], [47, 131, 134], [42, 146, 133], [40, 160, 128],
    [45, 174, 120], [62, 187, 109], [88, 199, 94], [120, 209, 77], [156, 217, 59],
    [253, 231, 37],
  ],
  cividis: [
    [0, 32, 76], [0, 42, 102], [0, 52, 110], [39, 63, 108], [60, 74, 107],
    [76, 85, 107], [91, 95, 109], [104, 106, 112], [117, 117, 117], [131, 129, 120],
    [146, 140, 120], [161, 152, 118], [176, 165, 114], [192, 177, 109], [209, 191, 101],
    [253, 231, 55],
  ],
  magma: [
    [0, 0, 4], [10, 7, 35], [28, 16, 70], [53, 15, 106], [80, 18, 123],
    [105, 28, 128], [129, 37, 129], [153, 46, 126], [178, 54, 120], [202, 65, 108],
    [224, 82, 93], [241, 105, 79], [250, 133, 74], [254, 163, 86], [254, 194, 111],
    [252, 253, 191],
  ],
  plasma: [
    [13, 8, 135], [48, 5, 151], [75, 3, 161], [98, 0, 164], [120, 1, 161],
    [140, 10, 150], [159, 25, 137], [176, 42, 123], [191, 58, 110], [206, 74, 97],
    [220, 91, 84], [232, 110, 71], [243, 131, 58], [250, 155, 44], [253, 181, 32],
    [240, 249, 33],
  ],
  inferno: [
    [0, 0, 4], [9, 6, 30], [25, 11, 62], [48, 10, 90], [72, 12, 107],
    [96, 19, 110], [120, 28, 109], [144, 37, 103], [168, 47, 92], [191, 60, 78],
    [212, 76, 61], [230, 97, 42], [243, 122, 23], [250, 152, 9], [250, 185, 32],
    [252, 255, 164],
  ],
  // ColorBrewer: uma cor so, boa para impressao em tons de cinza
  azul: [
    [247, 251, 255], [222, 235, 247], [198, 219, 239], [158, 202, 225],
    [107, 174, 214], [66, 146, 198], [33, 113, 181], [8, 81, 156], [8, 48, 107],
  ],
  quente: [
    [255, 255, 204], [255, 237, 160], [254, 217, 118], [254, 178, 76],
    [253, 141, 60], [252, 78, 42], [227, 26, 28], [189, 0, 38], [128, 0, 38],
  ],
  verdeazul: [
    [255, 255, 217], [237, 248, 177], [199, 233, 180], [127, 205, 187],
    [65, 182, 196], [29, 145, 192], [34, 94, 168], [37, 52, 148], [8, 29, 88],
  ],
};

function lerp(a, b, t) { return a + (b - a) * t; }

function rampa(pontos, t) {
  const x = Math.max(0, Math.min(1, t)) * (pontos.length - 1);
  const i = Math.min(Math.floor(x), pontos.length - 2);
  const f = x - i;
  const a = pontos[i], b = pontos[i + 1];
  return `rgb(${Math.round(lerp(a[0], b[0], f))}, ${Math.round(lerp(a[1], b[1], f))}, ${Math.round(lerp(a[2], b[2], f))})`;
}

// 'auto' devolve a paleta que a direcao do indicador pede
export function paleta(nome, dir) {
  const p = PONTOS[nome] ?? PONTOS[dir === 0 ? 'cividis' : 'viridis'];
  return (t) => rampa(p, t);
}

export const NOMES_PALETA = Object.keys(PONTOS);

// ========================================================= classes redondas
//
// Direcao da paleta, valida para tudo aqui:
//   dir = +1  alto e melhor: rampa normal
//   dir = -1  alto e pior: rampa invertida, senao o extremo ruim recebe a cor
//             que o olho le como boa
//   dir =  0  composicao sem juizo: paleta neutra (cividis)
//
// Houve duas escalas antes desta, e as duas falharam por motivos que a atual
// precisa continuar evitando:
//
//   LINEAR entre minimo e maximo. Quase todo indicador aqui e assimetrico:
//   renda tem mediana ~R$1.000 e cauda ate R$10.000; quilombola e estrangeiro
//   sao zero na maior parte do pais. A cauda estica o dominio e o mapa inteiro
//   afunda no primeiro terco da paleta.
//
//   QUANTIL, cor pela posicao no ranking. Resolvia o contraste e usava a paleta
//   toda em qualquer distribuicao, mas a legenda deixava de ser linear no
//   valor: virava rampa continua rotulada so com minimo, mediana e maximo, e
//   com distribuicao torta isso parece escala logaritmica. Ninguem conseguia
//   dizer que valor tinha uma cor do meio.
// A atual classifica em cortes REDONDOS escolhidos a partir da propria
// distribuicao. E o problema de "class intervals" (classInt no R, pretty() de
// Wilkinson, head/tails de Jiang); a versao aqui resolve os casos deste projeto
// sem precisar de tabela de cortes por indicador — sao 68 indicadores em 6
// censos e 3 niveis, com distribuicoes que nao se parecem.
//
// Quatro decisoes, nesta ordem (ver classesRedondas):
//
// 1. DISCRETA OU CONTINUA. Poucos valores distintos = uma classe por valor.
//    Cortar em intervalo o que so assume 5 valores inventa faixa que nao
//    existe no dado.
//
// 2. MASSA PONTUAL VIRA CLASSE PROPRIA. Valor unico com 10% ou mais dos casos
//    sai da faixa. Ver FRACAO_MASSA.
//
// 3. O PASSO SAI DO NUCLEO, NAO DA AMPLITUDE. Os cortes uniformes sao
//    calculados entre os percentis 2 e 98, nao entre o minimo e o maximo. Sem
//    isso, um municipio em 0% com o resto entre 90% e 100% daria passo de 20
//    pontos e um mapa de uma cor so: o outlier decide a escala do resto. O que
//    fica fora do nucleo vira "menos de X" e "X ou mais", em vez de ganhar
//    classes redondas quase vazias.
//
// 4. SE AINDA CONCENTRAR, TROCA DE ESTRATEGIA. Classe com mais de 40% dos casos
//    cai no plano B: cortes nos quantis arredondados para numeros limpos, com
//    espacamento desigual. Ver cortesPorQuantil.
//
// Devolve classes em ordem CRESCENTE:
//   { lo, hi }                   faixa fechada [lo, hi)
//   { hi, aberta: 'baixo' }      menos de hi
//   { lo, aberta: 'alto' }       lo ou mais
//   { lo, hi, exato: true }      valor unico (discreto ou massa pontual)
//   { ..., massa: true }         massa pontual, rotulada "exatamente X"
// mais 'n' (unidades na classe), preenchido aqui.

// Multiplos "redondos" de uma potencia de dez. 2,5 entra porque e o que da
// passo utilizavel quando 2 e pouco e 5 e demais (0,25 / 25 / 250).
const PASSOS = [1, 2, 2.5, 5];

function casasDe(passo) {
  const s = String(passo);
  if (s.includes('e')) return 6;
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

function passoRedondo(amplitude, alvo) {
  const bruto = amplitude / alvo;
  if (!(bruto > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  for (const p of PASSOS) if (p * mag >= bruto) return p * mag;
  return 10 * mag;
}

function proximoPasso(passo) {
  const mag = 10 ** Math.floor(Math.log10(passo) + 1e-9);
  const p = +(passo / mag).toFixed(6);
  const i = PASSOS.indexOf(p);
  if (i < 0) return passo * 2;
  return i === PASSOS.length - 1 ? 10 * mag : PASSOS[i + 1] * mag;
}

function gerarCortes(lo, hi, passo) {
  const dec = casasDe(passo);
  const out = [];
  for (let k = Math.ceil(lo / passo - 1e-9); k <= Math.floor(hi / passo + 1e-9); k++) {
    out.push(+(k * passo).toFixed(dec));
  }
  return out;
}

// Cortes de passo constante sobre o nucleo. E o caso normal, e o que produz a
// legenda que se espera ler: 0-10, 10-20, 20-30.
function cortesUniformes(ordenado, alvo, maxClasses) {
  const min = ordenado[0], max = ordenado[ordenado.length - 1];
  let lo = quantilOrdenado(ordenado, 0.02);
  let hi = quantilOrdenado(ordenado, 0.98);
  if (!(hi > lo)) { lo = min; hi = max; }

  let passo = passoRedondo(hi - lo, alvo);
  let cortes = gerarCortes(lo, hi, passo);
  // +1 porque a ponta aberta superior entra como classe
  while (cortes.length + 1 > maxClasses) {
    passo = proximoPasso(passo);
    cortes = gerarCortes(lo, hi, passo);
  }
  return cortes;
}

// Cortes nos QUANTIS, cada um arredondado para um numero limpo. Espacamento
// desigual: fino onde ha dado, largo onde nao ha.
//
// Existe para o caso que o passo constante nao resolve. Agua por rede em 1970
// tem mediana 5,5% e maximo 100%: qualquer passo redondo uniforme joga tres
// quartos dos municipios na primeira classe e o mapa fica de uma cor so. Nao e
// defeito do passo, e a distribuicao — mas um mapa de uma cor nao informa nada.
//
// A resolucao do arredondamento sai da distancia ate o quantil vizinho, entao o
// numero fica limpo sem encostar no corte seguinte.
function cortesPorQuantil(ordenado, alvo) {
  const q = [];
  for (let i = 1; i < alvo; i++) q.push(quantilOrdenado(ordenado, i / alvo));

  const out = [];
  for (let i = 0; i < q.length; i++) {
    const dEsq = i > 0 ? q[i] - q[i - 1] : Infinity;
    const dDir = i < q.length - 1 ? q[i + 1] - q[i] : Infinity;
    let d = Math.min(dEsq, dDir);
    if (!Number.isFinite(d) || d <= 0) d = (q[q.length - 1] - q[0]) || Math.abs(q[i]) || 1;
    // alvo 2: o passo fica em ~metade do vao, entao o arredondamento move o
    // corte no maximo um quarto dele e nao colide com o vizinho
    const s = passoRedondo(d, 2);
    out.push(+(Math.round(q[i] / s) * s).toFixed(casasDe(s)));
  }
  return [...new Set(out)].sort(ascendente);
}

// Monta as classes a partir de uma lista de cortes, conta e funde as vazias.
function montar(ordenado, cortes) {
  const min = ordenado[0], max = ordenado[ordenado.length - 1];
  const c = cortes.filter((v) => v >= min && v <= max);
  if (c.length < 2) return null;

  const cls = [];
  if (min < c[0]) cls.push({ hi: c[0], aberta: 'baixo' });
  for (let i = 0; i < c.length - 1; i++) cls.push({ lo: c[i], hi: c[i + 1] });

  // Se o ultimo corte redondo cair exatamente no maximo, a faixa aberta contem
  // so esse valor. "100% ou mais" num percentual e leitura errada de uma classe
  // que na verdade e "exatamente 100%".
  const topo = c[c.length - 1];
  cls.push(topo === max
    ? { lo: max, hi: max, exato: true, massa: true }
    : { lo: topo, aberta: 'alto' });

  return fundirVazias(contar(ordenado, cls));
}

const maiorFracao = (cls, n) => Math.max(...cls.map((c) => c.n)) / n;

// Escolhe entre passo constante e cortes por quantil, para um conjunto ja sem
// as massas pontuais.
function classificarCorpo(corpo, alvo, maxClasses, limiteConcentracao) {
  const n = corpo.length;
  const min = corpo[0], max = corpo[n - 1];
  if (min === max) return [{ lo: min, hi: max, aberta: 'ambas', n }];

  const distintos = [...new Set(corpo)];
  if (distintos.length <= 8) {
    return contar(corpo, distintos.map((v) => ({ lo: v, hi: v, exato: true })));
  }

  const uniforme = montar(corpo, cortesUniformes(corpo, alvo, maxClasses));
  if (uniforme && maiorFracao(uniforme, n) <= limiteConcentracao) return uniforme;

  // passo constante concentrou demais: tenta os cortes por quantil e fica com
  // o que distribuir melhor, para nao trocar uma legenda limpa por outra pior
  const porQuantil = montar(corpo, cortesPorQuantil(corpo, alvo));
  if (!porQuantil) return uniforme ?? [{ lo: min, hi: max, aberta: 'ambas', n }];
  if (!uniforme) return porQuantil;
  return maiorFracao(porQuantil, n) < maiorFracao(uniforme, n) ? porQuantil : uniforme;
}

// Fracao dos casos no mesmo valor a partir da qual ele ganha classe propria.
const FRACAO_MASSA = 0.1;

export function classesRedondas(ordenado, { alvo = 6, maxClasses = 9,
                                            limiteConcentracao = 0.4 } = {}) {
  const n = ordenado.length;
  if (!n) return [];
  const min = ordenado[0], max = ordenado[n - 1];
  if (min === max) return [{ lo: min, hi: max, aberta: 'ambas', n }];

  // MASSA PONTUAL. Um valor unico pode concentrar tanto caso que nenhuma faixa
  // consegue separa-lo: em 1970, 73,8% dos municipios tinham EXATAMENTE 0% de
  // esgoto por rede. Diluir esse zero dentro de "menos de 10%" esconde o fato
  // mais forte do mapa, e ainda arrasta os cortes do resto. Ele vira classe
  // propria, e o resto e classificado sem ele.
  const massa = FRACAO_MASSA * n;
  let ini = 0;
  while (ini < n && ordenado[ini] === min) ini++;
  let fim = n;
  while (fim > ini && ordenado[fim - 1] === max) fim--;

  const temBaixo = ini >= massa;
  const temAlto = (n - fim) >= massa;
  if (!temBaixo && !temAlto) {
    return classificarCorpo(ordenado, alvo, maxClasses, limiteConcentracao);
  }

  const corpo = ordenado.slice(temBaixo ? ini : 0, temAlto ? fim : n);
  const extras = (temBaixo ? 1 : 0) + (temAlto ? 1 : 0);
  const meio = corpo.length
    ? classificarCorpo(corpo, Math.max(2, alvo - extras),
                       Math.max(2, maxClasses - extras), limiteConcentracao)
    : [];

  // Com massa no topo, a ultima faixa do corpo deixa de ser aberta: "99,8% ou
  // mais" logo acima de uma classe que e exatamente 100% se contradiz.
  const ultima = meio[meio.length - 1];
  if (temAlto && ultima && ultima.aberta === 'alto') {
    delete ultima.aberta;
    ultima.hi = max;
  }

  return [
    ...(temBaixo ? [{ lo: min, hi: min, exato: true, massa: true, n: ini }] : []),
    ...meio,
    ...(temAlto ? [{ lo: max, hi: max, exato: true, massa: true, n: n - fim }] : []),
  ];
}

// Classe vazia gastaria uma cor da paleta e uma linha da legenda, mas nao pode
// ser simplesmente removida: isso abriria um buraco na particao, e um valor
// caido no buraco seria classificado com o rotulo da classe seguinte. Ex.: em
// frequencia escolar 6 a 14, com cortes 94/95/96/97/98 e nada entre 94 e 96,
// remover deixaria "menos de 94" ao lado de "96 a 97", e um estado com 95
// apareceria rotulado como 96 a 97.
//
// A classe vazia e fundida na seguinte, esticando o limite inferior dela. As
// pontas abertas nunca ficam vazias por construcao (so existem se ha dado
// fora do nucleo), entao a fusao sempre tem para onde ir.
function fundirVazias(classes) {
  const out = [];
  let pendente = null;          // limite inferior herdado da classe fundida
  for (let i = 0; i < classes.length; i++) {
    const c = classes[i];
    if (c.n === 0 && i < classes.length - 1) {
      pendente ??= (c.aberta === 'baixo' ? { aberta: 'baixo' } : { lo: c.lo });
      continue;
    }
    if (pendente) {
      if (pendente.aberta === 'baixo') { delete c.lo; c.aberta = 'baixo'; }
      else c.lo = pendente.lo;
      pendente = null;
    }
    out.push(c);
  }
  return out;
}

function contar(ordenado, classes) {
  for (const c of classes) c.n = 0;
  for (const v of ordenado) classes[indiceClasse(classes, v)].n++;
  return classes;
}

// Indice da classe que contem v. Varredura linear: sao no maximo 9 classes, e
// a busca binaria aqui custaria mais em codigo do que economiza.
//
// As classes de valor exato sao testadas ANTES das faixas. A massa pontual do
// topo fica depois da faixa aberta superior, que casa com qualquer coisa; sem
// a passada separada, o proprio valor da massa cairia nela.
export function indiceClasse(classes, v) {
  for (let i = 0; i < classes.length; i++) {
    if (classes[i].exato && v === classes[i].lo) return i;
  }
  for (let i = 0; i < classes.length; i++) {
    const c = classes[i];
    if (c.exato) continue;
    if (c.aberta === 'alto') return i;
    if (v < c.hi) return i;
  }
  return classes.length - 1;
}

// Cor por CLASSE: passos iguais na paleta, um por classe. Diferente da escala
// por quantil, onde a cor variava continuamente com a posicao no ranking.
//
// A cor sai do INDICE da classe, nunca de um valor representativo dela. Na
// classe aberta inferior nao existe valor representativo: o unico numero que
// ela carrega e o corte superior, que pertence a classe seguinte e devolveria
// a cor errada.
export function coresDasClasses(classes, dir = +1, nome = 'auto') {
  const p = paleta(nome, dir);
  const n = classes.length;
  return classes.map((_, i) => {
    const t = n > 1 ? i / (n - 1) : 0.5;
    return p(dir === -1 ? 1 - t : t);
  });
}

export function escalaClasses(classes, dir = +1, nome = 'auto') {
  const cores = coresDasClasses(classes, dir, nome);
  return (v) => cores[indiceClasse(classes, v)];
}

// quantil sobre um array JA ordenado (mesma semantica do d3.quantileSorted)
function quantilOrdenado(ordenado, p) {
  if (!ordenado.length) return undefined;
  if (ordenado.length === 1) return ordenado[0];
  const i = (ordenado.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lerp(ordenado[lo], ordenado[hi], i - lo);
}

// Quebra uma linha de CSV respeitando aspas. Necessario porque 511 nomes de
// area de ponderacao contem virgula ("Parque dos Carajas, Beira Rio"); um
// split(',') cru desloca todas as colunas seguintes dessas linhas e produz
// valores absurdos silenciosamente, em vez de erro.
function partirLinha(linha) {
  const campos = [];
  let atual = '';
  let dentroAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (dentroAspas && linha[i + 1] === '"') { atual += '"'; i++; }  // aspas escapada
      else dentroAspas = !dentroAspas;
    } else if (c === ',' && !dentroAspas) {
      campos.push(atual); atual = '';
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos;
}

// Le um CSV com cabecalho. Devolve array de objetos.
export async function lerCsv(url, mapear) {
  const r = await fetch(url);
  // Sem esta checagem um 404 devolve a pagina de erro do servidor, que o
  // parser abaixo trata como CSV: sai uma tabela de lixo, com cabecalho
  // '<!DOCTYPE html>' e valores NaN, e NADA reclama. Arquivo faltando tem de
  // dar erro, nao dado sem sentido.
  if (!r.ok) throw new Error(`${r.status} ao buscar ${url}`);
  const txt = await r.text();
  const linhas = txt.trim().split(/\r?\n/);
  const cab = partirLinha(linhas[0]);
  const out = new Array(linhas.length - 1);
  for (let i = 1; i < linhas.length; i++) {
    const campos = partirLinha(linhas[i]);
    const obj = {};
    for (let j = 0; j < cab.length; j++) obj[cab[j]] = campos[j];
    out[i - 1] = mapear ? mapear(obj) : obj;
  }
  return out;
}

export function ascendente(a, b) { return a - b; }
