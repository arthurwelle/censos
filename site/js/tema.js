// Alternancia de tema claro/escuro. O tema fica no dataset do <html>; o CSS le
// via [data-theme].
//
// NAO importa map.js: quem precisa repintar o mapa passa a funcao em
// 'aoTrocar'. Importar map.js aqui obrigava toda pagina que quisesse o botao de
// tema a instanciar um MapLibre inteiro — a pagina de metodologia quebrava com
// 'pmtiles is not defined' antes de renderizar qualquer coisa.

export function initTema(aoTrocar) {
  const btn = document.getElementById('btn-tema');
  const atual = () => document.documentElement.dataset.theme || 'escuro';

  const aplicar = (tema) => {
    document.documentElement.dataset.theme = tema;
    try { localStorage.setItem('tema', tema); } catch { /* modo privado */ }
    if (btn) btn.title = tema === 'escuro' ? 'Mudar para tema claro' : 'Mudar para tema escuro';
    aoTrocar?.(tema);
  };

  aplicar(atual());
  if (btn) {
    btn.addEventListener('click', () => aplicar(atual() === 'escuro' ? 'claro' : 'escuro'));
  }
}
