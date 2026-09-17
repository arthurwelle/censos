// Nota metodológica da figura.
//
// O mesmo rótulo não é a mesma pergunta em 1970 e em 2022. "Recebe
// aposentadoria, pensão ou benefício" é, em 1970, a SITUAÇÃO PRINCIPAL DE
// EMPREGO declarada como "aposentado", medida por família; em 2022 é a
// existência de rendimento de aposentadoria, pensão, Bolsa Família, BPC ou
// aluguel, entre pessoas de 14 anos ou mais. São coisas diferentes, e a série
// continua valendo — o que não pode é a figura sair do site sem dizer isso.
//
// A página de metodologia já mostra a fórmula de cada censo, mas ela fica
// AQUI, e a figura vai para um relatório, um slide, um tuíte. Esta nota
// reconstrói, a partir do mesmo site/data/metodologia.json, a frase que diz o
// que cada censo considerou, para ela viajar dentro da imagem.
//
// Nada é escrito à mão: o texto sai da fórmula que rodou na extração. Onde a
// fórmula usa apelido sem glossário (1980 tem alguns), a cláusula sai crua, em
// vez de virar prosa inventada — o que é feio, mas é verdade.

let dados = null;
let pedido = null;

export function carregarMetodologia() {
  pedido ??= fetch('./data/metodologia.json')
    .then((r) => r.json())
    .then((d) => (dados = d))
    // Sem a metodologia a figura ainda sai; só sai sem nota. Falhar aqui não
    // pode impedir alguém de salvar o PNG.
    .catch(() => (dados = { anos: {}, fonte: {} }));
  return pedido;
}

// ------------------------------------------------------- leitura da fórmula
// As fórmulas vêm de três gerações de código: SQL do BigQuery (IF(cond, peso,
// 0)), DuckDB/R (CASE WHEN cond THEN w ELSE 0 END) e descrições em prosa para
// o que não é filtro ("mediana ponderada de D0360"). O peso multiplicando não
// interessa à nota: o que interessa é a CONDIÇÃO.
function desembrulhar(f) {
  const s = String(f ?? '').trim();
  let m;
  // IF(cond, peso, 0). A separação tem de contar parênteses: 1970 e 1991
  // aninham IF dentro do peso, e um corte por expressão regular trazia metade
  // do peso para dentro da condição -- a nota dizia o que a fórmula não diz.
  if (/^IF\(/i.test(s) && s.endsWith(')')) {
    const args = dividir(s.slice(3, -1), ',');
    if (args.length === 3 && args[2] === '0') return args[0];
  }
  if ((m = s.match(/^CASE\s+WHEN\s+(.+?)\s+THEN\s+.+\s+ELSE\s+0\s+END$/is))) return m[1];
  if ((m = s.match(/^soma de\s+\S+\s+quando\s+(.+)$/i))) return m[1];
  return s;
}

const ehLetra = (c) => c !== undefined && /[A-Za-z0-9_]/.test(c);

// Quebra em pedaços de um nível só, respeitando parênteses, aspas e o AND
// que pertence a um BETWEEN. Sem esse cuidado, "BETWEEN 6 AND 14" viraria duas
// cláusulas e a frase diria uma coisa que a fórmula não diz. Serve para AND,
// OR e para a vírgula que separa os argumentos de IF().
function dividir(s, sep) {
  const partes = [];
  let prof = 0, ini = 0, pendentes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'") { const j = s.indexOf("'", i + 1); i = j < 0 ? s.length : j; continue; }
    if (c === '(') { prof++; continue; }
    if (c === ')') { prof--; continue; }
    if (prof !== 0) continue;
    if (sep === ',') {
      if (c !== ',') continue;
      partes.push(s.slice(ini, i));
      ini = i + 1;
      continue;
    }
    if (ehLetra(s[i - 1])) continue;
    const m = s.slice(i).match(/^(BETWEEN|AND|OR)\b/i);
    if (!m) continue;
    const pal = m[1].toUpperCase();
    i += pal.length - 1;
    if (pal === 'BETWEEN') { pendentes++; continue; }
    if (pal === 'AND' && pendentes > 0) { pendentes--; continue; }
    if (pal !== sep) continue;
    partes.push(s.slice(ini, i - pal.length + 1));
    ini = i + 1;
  }
  partes.push(s.slice(ini));
  return partes.map((p) => p.trim()).filter(Boolean);
}

// ----------------------------------------------- SQL reescrito para o leigo
// A fórmula é gravada como rodou, e a página de metodologia a mostra assim
// porque existe para caçar erro. Numa figura que vai para um relatório, porém,
// "IF(SAFE_CAST(v013 AS INT64) = 5, -1, SAFE_CAST(v013 AS INT64))" não diz
// nada a quem lê. Aqui a fórmula é reescrita ANTES de virar frase: sai o que é
// mecânica do SQL (conversão de tipo, peso amostral, sentinela de ignorado) e
// fica a condição. Nenhuma troca inventa: cada uma é uma leitura exata do que
// aquele trecho faz.
const PESO = /^(peso_amostral|peso|w|p001|v054|v603|v604|v7301|D0111|P0111|F0111)$/;
const ehPeso = (v, g) => PESO.test(v) || /^peso\b|fator para expans/i.test(g[v]?.desc ?? '');
const nomeVar = (v, g) => (g[v] ? limpar(g[v].desc) : v);

function fechaDe(s, abre) {
  let prof = 0;
  for (let i = abre; i < s.length; i++) {
    const c = s[i];
    if (c === "'") { const j = s.indexOf("'", i + 1); i = j < 0 ? s.length : j; continue; }
    if (c === '(') prof++;
    else if (c === ')' && --prof === 0) return i;
  }
  return -1;
}

// Troca cada chamada NOME(...) pelo que fn devolver. null deixa a chamada como
// está (e as chamadas de dentro dela continuam sendo visitadas).
function trocarChamadas(s, nome, fn) {
  const re = new RegExp(`\\b${nome}\\s*\\(`, 'g');
  let out = '', i = 0, m;
  while ((m = re.exec(s))) {
    const abre = m.index + m[0].length - 1;
    const fecha = fechaDe(s, abre);
    if (fecha < 0) break;
    const dentro = s.slice(abre + 1, fecha);
    const r = fn(dividir(dentro, ','), dentro);
    if (r == null) continue;
    out += s.slice(i, m.index) + r;
    i = fecha + 1;
    re.lastIndex = i;
  }
  return out + s.slice(i);
}

// Trechos já escritos em português entram na fórmula como ⟦n⟧ e só voltam a
// ser texto no fim. Sem isso, trocarSobras() leria a palavra traduzida como se
// fosse o nome de uma variável e a traduziria de novo.
const CONTAGEM = '\u0001';
const guardar = (ctx, t) => `⟦${ctx.frag.push(t) - 1}⟧`;
function soltar(t, frag) {
  let r = t, antes;
  do {
    antes = r;
    r = r.replace(/⟦(\d+)⟧/g, (_, n) => {
      const f = frag[n];
      return f.startsWith(CONTAGEM) ? `número de pessoas com ${f.slice(1)}` : f;
    });
  } while (r !== antes);
  return r;
}

const texto = (f, g) => clausulas(f, g).join(' e ');

function legivel(s, ctx) {
  const g = ctx.gloss;
  let t = String(s ?? '');

  // conversão de tipo não muda o que se mede
  t = t.replace(/(\w+)::\w+/g, '$1');
  for (const f of ['SAFE_CAST', 'CAST']) {
    t = trocarChamadas(t, f, (_, d) => d.replace(/\s+AS\s+[\w<>]+\s*$/i, ''));
  }
  // CASE v WHEN 1 THEN 0.125 ... END: a faixa convertida no ponto médio. O que
  // a condição pergunta é se a faixa foi declarada.
  t = t.replace(/CASE\s+(\w+)\s+WHEN[\s\S]*?\bEND\b/g, '$1');

  // grande grupo da ocupação: o primeiro dígito do código
  t = t.replace(/SUBSTR\(LPAD\((\w+),\s*\d+,\s*'0'\),\s*1,\s*1\)\s+IN\s*\(([^)]*)\)/g,
    (_, v, l) => guardar(ctx, `primeiro dígito de ${nomeVar(v, g)} igual a `
      + listar(l.split(',').map((x) => x.trim().replace(/'/g, '')))));

  // Valor de UMA pessoa do domicílio: MAX(IF(parentesco = 1, sexo, NULL)) é o
  // sexo de quem é o responsável. Com o peso no lugar do valor, é só o peso do
  // domicílio, lido na linha do responsável.
  for (const agg of ['MAX', 'MIN', 'ANY_VALUE']) {
    t = trocarChamadas(t, agg, (a) => {
      if (a.length !== 1 || !/^IF\s*\(/i.test(a[0]) || !a[0].endsWith(')')) return null;
      const [c, v, n] = dividir(a[0].slice(a[0].indexOf('(') + 1, -1), ',');
      if (n !== 'NULL') return null;
      if (ehPeso(v, g)) return 'peso';
      // "parentesco = 1" com rótulo vira só o rótulo: "sexo (Chefe da família)"
      const m = c.trim().match(/^(\w+)\s*=\s*(\S+)$/);
      const quem = (m && g[m[1]]?.codigos?.[m[2]]) || `de quem tem ${texto(c, g)}`;
      return `${legivel(v, ctx)} ${guardar(ctx, `(${quem})`)}`;
    });
  }
  t = trocarChamadas(t, 'COUNTIF', (_, d) => guardar(ctx, CONTAGEM + texto(d, g)));
  t = t.replace(/COUNT\(\*\)/g, () => guardar(ctx, 'número de pessoas'));
  t = t.replace(/⟦(\d+)⟧\s*>\s*0\b/g, (m, n) => (ctx.frag[n].startsWith(CONTAGEM)
    ? guardar(ctx, `ao menos uma pessoa com ${ctx.frag[n].slice(1)}`) : m));

  t = trocarChamadas(t, 'IF', (a) => {
    if (a.length !== 3) return null;
    const [c, x, y] = a.map((p) => legivel(p, ctx));
    // IF(v = 99999999, NULL, v): o código de ignorado saiu da conta
    if (x === 'NULL' && new RegExp(`^${y}\\s*=`).test(c)) return y;
    // IF(moradores > 0, renda / moradores, NULL): a guarda contra divisão por zero
    if (y === 'NULL') return x;
    // IF(c, -1, v): -1 marca "não tem", que em alguns censos só existe no
    // cruzamento com outra pergunta. Vira um código a mais da variável, com o
    // rótulo do código original ou, se não houver um, a condição por extenso.
    if (x === '-1' && /^\w+$/.test(y)) {
      const cods = g[y]?.codigos ?? {};
      const m = c.match(new RegExp(`^${y}\\s*=\\s*(\\S+)$`));
      g[y] = { ...(g[y] ?? { desc: y }),
               codigos: { ...cods, '-1': (m && cods[m[1]]) || `Não tem (${texto(c, g)})` } };
      return y;
    }
    return null;
  });

  // 2022, os compostos: média de um grupo dividida pela de outro
  t = t.replace(/\(\[soma de (\w+) quando ([^\]]+)\] \/ \[peso quando ([^\]]+)\]\)/g,
    (m, v, c1, c2) => (c1 === c2
      ? guardar(ctx, `média de ${nomeVar(v, g)} entre quem tem ${texto(c1, g)}`) : m));
  const fif = t.match(/^fifelse\([\s\S]*round\(([\s\S]*),\s*\d+\),\s*NA_real_\)$/);
  if (fif) {
    t = fif[1].replace(/^\((⟦\d+⟧)\)\s*\/\s*\((⟦\d+⟧)\)$|^(⟦\d+⟧)\s*\/\s*(⟦\d+⟧)$/,
      (_, a, b, c, d) => `${a ?? c}, dividida pela ${b ?? d}`);
  }

  // o peso amostral multiplica tudo e não é condição de nada
  t = t.replace(/\b(\w+)\s*\*\s*/g, (m, v) => (ehPeso(v, g) ? '' : m))
       .replace(/\s*[*×]\s*(\w+)\b/g, (m, v) => (ehPeso(v, g) ? '' : m));
  return ehPeso(t.trim(), g) ? '' : t.trim();
}

// Numa lista de condições ligadas por "e", "v em (A)" e "v fora de (B)" são uma
// condição só: v em (A menos B). É assim que o esgoto inadequado vira a lista
// das categorias inadequadas, em vez de "declarado e não adequado".
function juntarListas(filhos) {
  const por = {};
  filhos.forEach((n, i) => {
    const m = n.folha?.match(/^(\w+)\s+(NOT\s+)?IN\s*\(([^)]*)\)$/i);
    if (m) (por[m[1]] ??= []).push({ i, neg: !!m[2], l: m[3].split(',').map((x) => x.trim()) });
  });
  const fora = new Set();
  for (const [v, ls] of Object.entries(por)) {
    const pos = ls.filter((x) => !x.neg), neg = ls.filter((x) => x.neg);
    if (pos.length !== 1 || !neg.length) continue;
    const tirar = new Set(neg.flatMap((x) => x.l));
    filhos[pos[0].i] = { folha: `${v} IN (${pos[0].l.filter((x) => !tirar.has(x)).join(', ')})` };
    neg.forEach((x) => fora.add(x.i));
  }
  return filhos.filter((_, i) => !fora.has(i));
}

// Parênteses que envolvem a expressão inteira só atrapalham a leitura.
function desembrulharParenteses(s) {
  let t = s.trim();
  while (t.startsWith('(') && t.endsWith(')')) {
    let prof = 0, fechaNoFim = false;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === '(') prof++;
      else if (t[i] === ')' && --prof === 0) { fechaNoFim = i === t.length - 1; break; }
    }
    if (!fechaNoFim) break;
    t = t.slice(1, -1).trim();
  }
  return t;
}

// OR antes de AND: em SQL o AND liga mais forte, então o OR é quem parte a
// expressão em blocos maiores.
function arvore(s) {
  const t = desembrulharParenteses(s);
  for (const [sep, lig] of [['OR', ' ou '], ['AND', ' e ']]) {
    const p = dividir(t, sep);
    if (p.length > 1) return { lig, filhos: p.map(arvore) };
  }
  const neg = t.match(/^NOT\s*\(/i);
  if (neg && fechaDe(t, neg[0].length - 1) === t.length - 1) {
    return { nao: arvore(t.slice(neg[0].length, -1)) };
  }
  return { folha: t };
}

// ------------------------------------------------------------ frase da folha
const OPS = [['>=', '≥'], ['<=', '≤'], ['<>', '≠'], ['!=', '≠'],
             ['>', '>'], ['<', '<'], ['=', '=']];

// "Material das paredes do domicílio, categoria" vira "material das paredes do
// domicílio": o sufixo é do dicionário do IBGE, não da frase.
const limpar = (d) => String(d ?? '')
  .replace(/,\s*(categoria|número|numero|código|codigo|valor)\s*$/i, '')
  .replace(/^(.)/, (c) => c.toLowerCase());

const listar = (a) => (a.length < 2 ? a[0] ?? ''
  : `${a.slice(0, -1).join(', ')} ou ${a.at(-1)}`);

function condicao(resto, cods, gloss = {}) {
  const rot = (c) => cods[String(c).trim().replace(/'/g, '')];
  let m;
  if (/^IS\s+NOT\s+NULL$/i.test(resto)) return ' declarado';
  if (/^IS\s+NULL$/i.test(resto)) return ' não declarado';
  if ((m = resto.match(/^(NOT\s+)?IN\s*\(([^)]*)\)$/i))) {
    const itens = m[2].split(',').map((x) => x.trim()).filter(Boolean);
    const rots = itens.map(rot);
    const pre = m[1] ? ': exceto ' : ': ';
    if (rots.every(Boolean)) return pre + listar(rots);
    // alguns com rótulo: o que não tem sai como código, sem inventar nome
    if (rots.some(Boolean)) return pre + listar(rots.map((r, i) => r ?? `código ${itens[i]}`));
    if (m[1]) return ` fora de (${itens.join(', ')})`;
    // Sem rótulo no glossário sobra o código nu. Sai como a fórmula o escreve,
    // e não como prosa: inventar o significado de um código é o único erro
    // que esta nota não pode cometer.
    return itens.length === 1 ? ` = ${itens[0]}` : `: código ${listar(itens)}`;
  }
  if ((m = resto.match(/^BETWEEN\s+(\S+)\s+AND\s+(\S+)$/i))) {
    const [a, b] = [rot(m[1]) ?? m[1], rot(m[2]) ?? m[2]];
    return ` de ${a} a ${b}`;
  }
  for (const [op, simb] of OPS) {
    if (!resto.startsWith(op)) continue;
    const val = resto.slice(op.length).trim();
    const r = rot(val);
    // O rótulo entra onde ele nomeia um valor que ESTÁ no conjunto: na
    // igualdade e nos limites inclusivos. Em > e < ele nomeia justamente o que
    // ficou de fora, e "grau que frequenta > Nenhum" lê ao contrário — ali o
    // número informa mais.
    if (r) {
      if (op === '=') return `: ${r}`;
      if (op === '<>' || op === '!=') return `: diferente de ${r}`;
      if (op === '>=' || op === '<=') return ` ${simb} ${r}`;
    }
    return ` ${simb} ${trocarSobras(val, gloss)}`;
  }
  if (!resto) return '';
  // aritmética colada na variável ("/moradores/sm") não leva espaço: o espaço
  // sugeriria uma nova cláusula. Se a conta termina numa comparação, a
  // comparação é lida como as outras ("declarado", "≥").
  const cauda = resto.match(/^(.*?)\s+(IS\s+NOT\s+NULL|IS\s+NULL|>=|<=|<>|!=|=|<|>)(.*)$/i);
  if (cauda && /^[/*+-]/.test(resto)) {
    return trocarSobras(cauda[1], gloss) + condicao(`${cauda[2]}${cauda[3]}`.trim(), {}, gloss);
  }
  const t = trocarSobras(resto, gloss);
  return /^[/*+-]/.test(resto) ? t : ` ${t}`;
}

// A variável é reconhecida pelo GLOSSÁRIO, e não por um padrão de nome: os
// códigos mudam de formato a cada censo (D0210, P1090, v043, peso_amostral) e
// 1970 chega a escrever a idade como o par "v026 e v027".
function frase(folha, gloss) {
  const chaves = Object.keys(gloss).sort((a, b) => b.length - a.length);
  for (const v of chaves) {
    if (!folha.startsWith(v) || ehLetra(folha[v.length])) continue;
    let resto = folha.slice(v.length);
    // 1970 escreve a idade como o par "v026 e v027". Quem nomeia o par é a
    // ÚLTIMA: v026 é "tipo de idade" e v027 é a idade em si, e chamar a
    // condição de "tipo de idade de 6 a 14" diz a coisa errada.
    let alvo = v;
    const par = resto.match(/^(\s+e\s+[A-Za-z]\w*)+/);
    if (par) {
      const ult = par[0].split(/\s+e\s+/).filter(Boolean).at(-1);
      if (gloss[ult]) alvo = ult;
      resto = resto.slice(par[0].length);
    }
    // "v606 (exceto 999) >= 10": o parêntese diz o que foi descartado da
    // variável, e é parte do nome dela, não da comparação.
    const anota = resto.match(/^\s*(\([^)]*\)|⟦\d+⟧)/);
    if (anota) resto = resto.slice(anota[0].length);
    return limpar(gloss[alvo].desc) + (anota ? ` ${anota[1]}` : '')
           + condicao(resto.trim(), gloss[alvo].codigos ?? {}, gloss);
  }
  return trocarSobras(folha, gloss);
}

function escrever(no, gloss, dentro = false) {
  if (no.folha !== undefined) return frase(no.folha, gloss);
  if (no.nao) return `não (${escrever(no.nao, gloss)})`;
  const t = no.filhos.map((f) => escrever(f, gloss, true)).join(no.lig);
  return dentro && no.lig === ' ou ' ? `(${t})` : t;
}

// Variável que sobrou crua dentro de aritmética ou de uma função de agregação
// ("v0111 + v0112 > 0", "renda/moradores/sm") vira a descrição dela.
//
// Só roda sobre TRECHO DE FÓRMULA, nunca sobre texto já traduzido. Rodando no
// resultado final ela se mordia: o apelido 'grau' vira "grau da última série
// concluída", que contém a palavra 'grau', que virava a descrição de novo --
// "grau da última série concluída da última série concluída".
function trocarSobras(txt, gloss) {
  let t = txt;
  for (const v of Object.keys(gloss).sort((a, b) => b.length - a.length)) {
    t = t.replace(new RegExp(`(^|[^A-Za-z0-9_])${v}(?![A-Za-z0-9_])`, 'g'),
                  (_, antes) => antes + limpar(gloss[v].desc));
  }
  return t;
}

// As cláusulas de primeiro nível, já em português. Separadas porque a BASE se
// escreve por diferença: repetir "idade ≥ 14" no numerador e de novo na base
// gasta meia nota para não dizer nada, e o que interessa na base é justamente
// o que ela tem A MAIS -- em 2022, que o "ignorado" ficou de fora.
const PSEUDO = {
  id_municipio: { desc: 'município onde mora', codigos: {} },
  peso_amostral: { desc: 'peso amostral', codigos: {} },
  D0111: { desc: 'peso amostral', codigos: {} },
  P0111: { desc: 'peso amostral', codigos: {} },
};

function clausulas(f, gloss) {
  const ctx = { gloss: { ...PSEUDO, ...gloss }, frag: [] };
  const s = legivel(desembrulhar(f), ctx);
  if (!s) return [];
  const raiz = arvore(s);
  const filhos = juntarListas(raiz.lig === ' e ' ? raiz.filhos : [raiz]);
  // Cláusula de OR entre outras precisa do parêntese: "idade ≥ 14 e A ou B"
  // lê-se de duas formas, e só uma delas é a fórmula.
  return filhos.map((n) => soltar(escrever(n, ctx.gloss, filhos.length > 1), ctx.frag)
                            .replace(/(\d)\.(\d)/g, '$1,$2'))
               .filter(Boolean);
}

// As fórmulas de 1980 falam em 'part', 'renda_ok', 'a25' — apelidos das views
// do DuckDB que geraram a extração. Sem isto a nota saía com o apelido cru
// dentro do PNG, que não significa nada para quem recebe a figura.
//
// O apelido entra como se fosse uma variável: descrição própria e, quando ele é
// só um outro nome para UMA variável do IBGE, os códigos dela junto — é o que
// faz 'grau = 3' virar "grau da última série concluída: Ginasial médio".
// Apelido montado sobre duas ou mais variáveis não herda código nenhum: ali o
// código não teria a que se referir.
// A mesma variável costuma ter rótulo no glossário de um indicador e não no de
// outro do mesmo censo (o glossário de cada um só traz o que a extração dele
// consultou). O do ano inteiro entra como reserva, só para o que faltar.
const cacheAno = new Map();
function glossDoAno(a) {
  if (!cacheAno.has(a)) {
    const g = {};
    for (const x of dados.anos[String(a)] ?? []) {
      for (const [v, d] of Object.entries(x.glossario ?? {})) {
        const tem = g[v];
        if (!tem || (!Object.keys(tem.codigos ?? {}).length && Object.keys(d.codigos ?? {}).length)) g[v] = d;
      }
    }
    cacheAno.set(a, g);
  }
  return cacheAno.get(a);
}

function comApelidos(e, reserva = {}) {
  const g = { ...(e.glossario ?? {}) };
  for (const [v, d] of Object.entries(reserva)) {
    if (!g[v]) g[v] = d;
    else if (!Object.keys(g[v].codigos ?? {}).length && Object.keys(d.codigos ?? {}).length) {
      g[v] = { ...g[v], codigos: d.codigos };
    }
  }
  for (const [nome, a] of Object.entries(e.apelidos ?? {})) {
    const so = (a.vars ?? []).length === 1 ? e.glossario?.[a.vars[0]] : null;
    g[nome] = { desc: a.desc, codigos: (so?.codigos && Object.keys(so.codigos).length)
                                       ? so.codigos : {} };
  }
  return g;
}

// ------------------------------------------------------------------ médias
// Numa média a condição diz QUEM entra, mas o que se mede é o VALOR que o peso
// multiplica: 'IF(v0402 = 1, p001 * v4752, 0)' é a idade média dos
// responsáveis. Ler só a condição, como nos percentuais, dava "relação com
// responsável: Pessoa responsável" e escondia que a conta é sobre a idade.
function condEValor(f) {
  const s = String(f ?? '').trim();
  let m;
  if (/^IF\(/i.test(s) && s.endsWith(')')) {
    const a = dividir(s.slice(3, -1), ',');
    if (a.length === 3 && a[2] === '0') return { cond: a[0], valor: a[1] };
  }
  if ((m = s.match(/^CASE\s+WHEN\s+(.+?)\s+THEN\s+(.+?)\s+ELSE\s+0\s+END$/is))) {
    return { cond: m[1], valor: m[2] };
  }
  if ((m = s.match(/^soma de\s+(\S+)\s+quando\s+(.+)$/i))) return { cond: m[2], valor: m[1] };
  return { cond: '', valor: s };
}

function valorLegivel(v, gloss) {
  const ctx = { gloss: { ...PSEUDO, ...gloss }, frag: [] };
  let t = desembrulharParenteses(legivel(v, ctx));
  if (!t) return '';
  // o par "v026 e v027" de 1970 é nomeado pela segunda (ver frase())
  t = t.replace(/\b(\w+)\s+e\s+(\w+)\b/g, (m, a, b) => (ctx.gloss[a] && ctx.gloss[b] ? b : m));
  t = trocarSobras(t, ctx.gloss);
  return soltar(t, ctx.frag)
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/(\d)\.(\d)/g, '$1,$2');
}

function textoDaMedia(e, gloss) {
  const pn = condEValor(e.num), pd = condEValor(e.den);
  const valor = valorLegivel(pn.valor, gloss);
  const quem = clausulas(pd.cond || pn.cond, gloss);
  if (!valor) {
    // só peso nos dois lados: é contagem sobre contagem, como pessoas em
    // família por chefe de família
    const a = clausulas(pn.cond, gloss).join(' e ');
    const b = quem.join(' e ');
    return a && b ? `${a}, por ${b}` : (a || b);
  }
  // "renda > 0" e "renda declarada" sobre a própria variável dizem só que
  // zeros ou brancos ficaram de fora; vira um aposto curto
  // A comparação ignora parênteses e espaços: a condição passa por clausulas()
  // e o valor não, e "(a + b) > 0" é a mesma coisa que "a + b > 0".
  let aposto = '';
  const norm = (x) => x.replace(/[()\s]/g, '');
  const resto = quem.filter((c) => {
    if (norm(c) === norm(`${valor} declarado`)) return false;
    if (norm(c) === norm(`${valor} > 0`)) { aposto = ' (só valores acima de zero)'; return false; }
    return true;
  });
  return `média de ${valor}${aposto}` + (resto.length ? `, entre ${resto.join(' e ')}` : '');
}

const REGISTRO = { domicílio: 'por domicílio', pessoa: 'por pessoa',
                   família: 'por família' };

// ----------------------------------------------------------- texto da nota
// Uma linha por censo, com o que o numerador exigiu e, quando difere, a base
// sobre a qual a proporção foi calculada. Mais as notas do próprio indicador
// naquele ano — é onde moram os avisos que mais importam ("o glossário de 1970
// está errado", "o valor foi deflacionado").
export function notaDosCensos(ind, anos) {
  if (!dados || !ind || !anos?.length) return '';

  const linhas = [`O que cada censo considerou — ${ind.label}`];
  for (const a of anos) {
    const e = (dados.anos[String(a)] ?? []).find((x) => x.col === ind.col);
    if (!e) { linhas.push(`${a} · sem fórmula registrada na extração.`); continue; }

    const gloss = comApelidos(e, glossDoAno(a));
    if (e.tipo === 'media') {
      const partes = [String(a), REGISTRO[e.registro] ?? e.registro, textoDaMedia(e, gloss)];
      linhas.push(`${partes.filter(Boolean).join(' · ')}.`);
      if (e.nota) linhas.push(`  ${e.nota}`);
      continue;
    }
    const num = e.tipo === 'razao' && /— calculado em /.test(e.num)
      ? [e.num.replace(/\s*— calculado em [\s\S]*$/, '')]
      : clausulas(e.num, gloss);
    const base = clausulas(e.den, gloss).filter((c) => !num.includes(c));
    const partes = [String(a), REGISTRO[e.registro] ?? e.registro, num.join(' e ')]
      .filter(Boolean);
    if (base.length) partes.push(`base: ${base.join(' e ')}`);
    linhas.push(`${partes.join(' · ')}.`);
    if (e.nota) linhas.push(`  ${e.nota}`);
  }
  return linhas.join('\n');
}
