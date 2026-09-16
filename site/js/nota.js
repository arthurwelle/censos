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

function condicao(resto, cods) {
  const rot = (c) => cods[String(c).trim().replace(/'/g, '')];
  let m;
  if (/^IS\s+NOT\s+NULL$/i.test(resto)) return ' declarado';
  if (/^IS\s+NULL$/i.test(resto)) return ' não declarado';
  if ((m = resto.match(/^IN\s*\(([^)]*)\)$/i))) {
    const itens = m[1].split(',').map((x) => x.trim()).filter(Boolean);
    const rots = itens.map(rot);
    if (rots.every(Boolean)) return `: ${listar(rots)}`;
    // Sem rótulo no glossário sobra o código nu. Sai como a fórmula o escreve,
    // e não como prosa: inventar o significado de um código é o único erro
    // que esta nota não pode cometer.
    return itens.length === 1 ? ` = ${itens[0]}` : ` em (${itens.join(', ')})`;
  }
  if ((m = resto.match(/^BETWEEN\s+(\S+)\s+AND\s+(\S+)$/i))) {
    const [a, b] = [rot(m[1]) ?? m[1], rot(m[2]) ?? m[2]];
    return ` de ${a} a ${b}`;
  }
  for (const [op, simb] of OPS) {
    if (!resto.startsWith(op)) continue;
    const val = resto.slice(op.length).trim();
    const r = rot(val);
    if (r) return op === '=' ? `: ${r}` : ` ${simb} ${r}`;
    return ` ${simb} ${val}`;
  }
  return resto ? ` ${resto}` : '';
}

// A variável é reconhecida pelo GLOSSÁRIO, e não por um padrão de nome: os
// códigos mudam de formato a cada censo (D0210, P1090, v043, peso_amostral) e
// 1970 chega a escrever a idade como o par "v026 e v027".
function frase(folha, gloss) {
  const chaves = Object.keys(gloss).sort((a, b) => b.length - a.length);
  for (const v of chaves) {
    if (!folha.startsWith(v) || ehLetra(folha[v.length])) continue;
    let resto = folha.slice(v.length);
    const par = resto.match(/^(\s+e\s+[A-Za-z]\w*)+/);   // "v026 e v027"
    if (par) resto = resto.slice(par[0].length);
    // "v606 (exceto 999) >= 10": o parêntese diz o que foi descartado da
    // variável, e é parte do nome dela, não da comparação.
    const anota = resto.match(/^\s*(\([^)]*\))/);
    if (anota) resto = resto.slice(anota[0].length);
    return limpar(gloss[v].desc) + (anota ? ` ${anota[1]}` : '')
           + condicao(resto.trim(), gloss[v].codigos ?? {});
  }
  return folha;
}

function escrever(no, gloss, dentro = false) {
  if (no.folha !== undefined) return frase(no.folha, gloss);
  const t = no.filhos.map((f) => escrever(f, gloss, true)).join(no.lig);
  return dentro && no.lig === ' ou ' ? `(${t})` : t;
}

// Última passada: variável que sobrou crua dentro de aritmética ou de uma
// função de agregação ("v0111 + v0112 > 0", "COUNTIF(v3072 < 15)") vira a
// descrição dela. Não desfaz o que já foi escrito -- nenhuma descrição contém
// um código de variável.
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
function clausulas(f, gloss) {
  const raiz = arvore(desembrulhar(f));
  const filhos = raiz.lig === ' e ' ? raiz.filhos : [raiz];
  // Cláusula de OR entre outras precisa do parêntese: "idade ≥ 14 e A ou B"
  // lê-se de duas formas, e só uma delas é a fórmula.
  return filhos.map((n) => trocarSobras(escrever(n, gloss, filhos.length > 1), gloss))
               .filter(Boolean);
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

    const gloss = e.glossario ?? {};
    const num = clausulas(e.num, gloss);
    const base = clausulas(e.den, gloss).filter((c) => !num.includes(c));
    const partes = [String(a), REGISTRO[e.registro] ?? e.registro, num.join(' e ')]
      .filter(Boolean);
    if (base.length) partes.push(`base: ${base.join(' e ')}`);
    linhas.push(`${partes.join(' · ')}.`);
    if (e.nota) linhas.push(`  ${e.nota}`);
  }
  return linhas.join('\n');
}
