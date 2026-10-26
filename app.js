const NOMES_UF = {
  AC: 'Acre', AL: 'Alagoas', AM: 'Amazonas', AP: 'Amapá', BA: 'Bahia',
  CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão',
  MG: 'Minas Gerais', MS: 'Mato Grosso do Sul', MT: 'Mato Grosso', PA: 'Pará', PB: 'Paraíba',
  PE: 'Pernambuco', PI: 'Piauí', PR: 'Paraná', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RO: 'Rondônia', RR: 'Roraima', RS: 'Rio Grande do Sul', SC: 'Santa Catarina', SE: 'Sergipe',
  SP: 'São Paulo', TO: 'Tocantins', ZZ: 'Exterior (Fora do Brasil)'
};

const state = {
  uf: 'TODAS',
  municipio: 'TODOS',
  modelo_urna: 'TODOS',
  apenas_biometria: 'todas',
  corte_horario: 'todos',
  filtro_rapido: 'nenhum',
  busca: '',
  agruparPorUf: false,
  page: 1,
  pageSize: 30,
  sortBy: 'votos_apos_17h',
  sortDir: 'DESC',
  stateSortBy: 'label',
  stateSortDir: 'ASC',
  stateTableMode: 'ambos',
  chartMode: 'apos_17h',
  ufsList: [],
  dashboardData: null
};

const SORT_LABELS_URNA = {
  uf: 'Estado / Município',
  secao: 'Zona / Seção',
  modelo_urna: 'Modelo da Urna',
  votos_cand_1: 'Votos Lula (13)',
  votos_cand_2: 'Votos Flávio (22)',
  segundos_apos_17h: 'Hora Fechou (BRT)',
  votos_apos_17h: 'Total Votos >17h',
  taxa_abstencao: 'Taxa de Abstenção',
  votos_sem_biometria: 'Biometria (Votos Sem Digital)',
  z_score_escola: 'Desvio da Média da Escola'
};

const SORT_LABELS_STATE = {
  label: 'Estado (UF)',
  urnas: 'Qtd. de Urnas',
  votos_cand_1: 'Votos Lula (13)',
  votos_cand_2: 'Votos Flávio (22)',
  pct_cand_1: 'Placar Geral 2ºT (%)',
  votos_antes_17h: 'Votos <17h (13 / 22)',
  votos_cand_1_antes_17h: 'Lula (13) <17h',
  votos_cand_2_antes_17h: 'Flávio (22) <17h',
  pct_cand_1_antes_17h: 'Placar Só <17h (%)',
  votos_apos_17h: 'Votos >17h (13 / 22)',
  votos_cand_1_apos_17h: 'Lula (13) >17h',
  votos_cand_2_apos_17h: 'Flávio (22) >17h',
  pct_cand_1_apos_17h: 'Placar Só >17h (%)',
  taxa_abstencao: 'Abstenção 2ºT (%)',
  urnas_100_bio: 'Biometria (Urnas 100% Bio)',
  pct_sem_biometria: '% Sem Biometria'
};

let mainChartInstance = null;

const fmtNum = new Intl.NumberFormat('pt-BR');
const fmtPct = (v) => `${Number(v || 0).toFixed(2).replace('.', ',')}%`;
const fmtDiff = (v) => {
  const n = Number(v || 0);
  return n >= 0 ? `+${fmtNum.format(n)}` : fmtNum.format(n);
};

function buildQueryParams(includePagination = false) {
  const params = new URLSearchParams();
  if (state.uf !== 'TODAS') params.set('uf', state.uf);
  if (state.municipio !== 'TODOS') params.set('municipio', state.municipio);
  if (state.modelo_urna !== 'TODOS') params.set('modelo_urna', state.modelo_urna);
  if (state.apenas_biometria !== 'todas') params.set('apenas_biometria', state.apenas_biometria);
  if (state.corte_horario !== 'todos') params.set('corte_horario', state.corte_horario);
  if (state.busca.trim() !== '') params.set('busca', state.busca.trim());

  if (state.filtro_rapido === 'cand1_perdeu') {
    params.set('filtro_1t', 'cand1_perdeu');
  } else if (state.filtro_rapido === 'cand2_perdeu') {
    params.set('filtro_1t', 'cand2_perdeu');
  } else if (state.filtro_rapido === 'desvio_escola') {
    params.set('min_z_score', '2.5');
  } else if (state.filtro_rapido === 'abst_baixa') {
    params.set('max_abstencao', '3.0');
  } else if (state.filtro_rapido === 'alta_sem_bio') {
    params.set('flag_especifica', 'ALTA_LIBERACAO_SEM_BIO');
  }

  if (includePagination) {
    params.set('page', String(state.page));
    params.set('pageSize', String(state.pageSize));
    params.set('sortBy', state.sortBy);
    params.set('sortDir', state.sortDir);
    params.set('agruparPorUf', state.agruparPorUf ? 'true' : 'false');
  }
  return params.toString();
}

async function initApp() {
  const metaRes = await fetch('/api/meta');
  const meta = await metaRes.json();
  state.ufsList = meta.ufs || [];

  const selUf = document.getElementById('fUf');
  state.ufsList.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.uf;
    opt.textContent = `${item.uf} — ${NOMES_UF[item.uf] || item.uf} (${fmtNum.format(item.urnas)} urnas)`;
    selUf.appendChild(opt);
  });

  const selModelo = document.getElementById('fModeloUrna');
  meta.modelos.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = `Urna ${m}`;
    selModelo.appendChild(opt);
  });

  renderStateTabsBar();
  bindEvents();
  await refreshAll();
}

function renderStateTabsBar() {
  const bar = document.getElementById('stateTabsBar');
  const allBtn = `
    <button data-uf-tab="TODAS" class="uf-tab-btn px-3 py-1.5 rounded-lg text-xs font-bold transition ${
      state.uf === 'TODAS'
        ? 'bg-[var(--bio-ok)] text-slate-950'
        : 'bg-[var(--bg-canvas)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)]'
    }">
      TODOS OS ESTADOS
    </button>
  `;

  const ufBtns = state.ufsList.map(item => {
    const isSelected = state.uf === item.uf;
    return `
      <button data-uf-tab="${item.uf}" title="${NOMES_UF[item.uf] || item.uf} (${fmtNum.format(item.urnas)} urnas)" class="uf-tab-btn px-2.5 py-1.5 rounded-lg text-xs font-bold num-tabular transition ${
        isSelected
          ? 'bg-[var(--bio-ok)] text-slate-950'
          : 'bg-[var(--bg-canvas)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)]'
      }">
        ${item.uf}
      </button>
    `;
  }).join('');

  bar.innerHTML = allBtn + ufBtns;

  bar.querySelectorAll('.uf-tab-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetUf = btn.getAttribute('data-uf-tab');
      state.uf = targetUf;
      state.municipio = 'TODOS';
      state.page = 1;
      document.getElementById('fUf').value = targetUf;
      renderStateTabsBar();
      await loadMunicipiosForUf(targetUf);
      await refreshAll();
    });
  });
}

async function loadMunicipiosForUf(uf) {
  const selMun = document.getElementById('fMunicipio');
  selMun.innerHTML = '<option value="TODOS">Todos os Municípios</option>';
  if (!uf || uf === 'TODAS') return;

  const res = await fetch(`/api/municipios?uf=${encodeURIComponent(uf)}`);
  const data = await res.json();
  data.municipios.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    selMun.appendChild(opt);
  });
}

async function refreshAll() {
  const dashParams = buildQueryParams(false);
  const tableParams = buildQueryParams(true);

  const [dashRes, tableRes] = await Promise.all([
    fetch(`/api/dashboard?${dashParams}`),
    fetch(`/api/urnas?${tableParams}`)
  ]);

  const dashData = await dashRes.json();
  const tableData = await tableRes.json();

  state.dashboardData = dashData;

  renderApos17hPanel(dashData.kpis);
  renderKpis(dashData.kpis);
  renderMainChart(dashData);
  renderStatesSummaryTable(dashData);
  renderUrnasTable(tableData);
}

function renderApos17hPanel(k) {
  // Coluna 1: Antes das 17h
  const totAntes17 = k.votos_cand_1_antes_17h + k.votos_cand_2_antes_17h;
  document.getElementById('boxAntes17Total').textContent = `${fmtNum.format(totAntes17)} votos nominais`;
  document.getElementById('boxAntes17Cand1').textContent = `${fmtNum.format(k.votos_cand_1_antes_17h)} (${fmtPct(k.pct_cand_1_antes_17h)})`;
  document.getElementById('boxAntes17Cand2').textContent = `${fmtNum.format(k.votos_cand_2_antes_17h)} (${fmtPct(k.pct_cand_2_antes_17h)})`;

  const barAntes1 = document.getElementById('barAntes17Cand1');
  const barAntes2 = document.getElementById('barAntes17Cand2');
  if (barAntes1 && barAntes2) {
    barAntes1.style.width = `${k.pct_cand_1_antes_17h || 50}%`;
    barAntes2.style.width = `${k.pct_cand_2_antes_17h || 50}%`;
  }

  // Coluna 2: Estritamente Depois das 17h
  document.getElementById('boxApos17PctTotal').textContent = `${fmtPct(k.pct_apos_17h)} do total`;
  document.getElementById('boxApos17Total').textContent = `${fmtNum.format(k.votos_apos_17h)} votos após 17h`;
  document.getElementById('boxApos17Cand1').textContent = `${fmtNum.format(k.votos_cand_1_apos_17h)} (${fmtPct(k.pct_cand_1_apos_17h)})`;
  document.getElementById('boxApos17Cand2').textContent = `${fmtNum.format(k.votos_cand_2_apos_17h)} (${fmtPct(k.pct_cand_2_apos_17h)})`;

  const barApos1 = document.getElementById('barApos17Cand1');
  const barApos2 = document.getElementById('barApos17Cand2');
  if (barApos1 && barApos2) {
    barApos1.style.width = `${k.pct_cand_1_apos_17h || 50}%`;
    barApos2.style.width = `${k.pct_cand_2_apos_17h || 50}%`;
  }

  const diffApos17 = k.votos_cand_1_apos_17h - k.votos_cand_2_apos_17h;
  const elDiff17 = document.getElementById('boxApos17Diff');
  if (diffApos17 >= 0) {
    elDiff17.textContent = `+${fmtNum.format(diffApos17)} votos p/ Lula (13)`;
    elDiff17.className = 'num-tabular font-bold text-[var(--cand-13)]';
  } else {
    elDiff17.textContent = `+${fmtNum.format(Math.abs(diffApos17))} votos p/ Flávio (22)`;
    elDiff17.className = 'num-tabular font-bold text-[var(--cand-22)]';
  }

  // Coluna 3: Até 17h05 vs Após 17h05
  const totAte1705 = k.cand1_urnas_ate_17h05 + k.cand2_urnas_ate_17h05;
  const pct1Ate1705 = totAte1705 > 0 ? (k.cand1_urnas_ate_17h05 * 100 / totAte1705) : 0;
  const pct2Ate1705 = totAte1705 > 0 ? (k.cand2_urnas_ate_17h05 * 100 / totAte1705) : 0;
  document.getElementById('resumoQtdAte1705').textContent = `${fmtNum.format(k.qtd_urnas_ate_17h05)} urnas`;
  document.getElementById('resumoAte1705Cand2').textContent = `Flávio 22: ${fmtPct(pct2Ate1705)} (${fmtNum.format(k.cand2_urnas_ate_17h05)})`;
  document.getElementById('resumoAte1705Cand1').textContent = `Lula 13: ${fmtPct(pct1Ate1705)} (${fmtNum.format(k.cand1_urnas_ate_17h05)})`;

  const totApos1705 = k.cand1_urnas_apos_17h05 + k.cand2_urnas_apos_17h05;
  const pct1Apos1705 = totApos1705 > 0 ? (k.cand1_urnas_apos_17h05 * 100 / totApos1705) : 0;
  const pct2Apos1705 = totApos1705 > 0 ? (k.cand2_urnas_apos_17h05 * 100 / totApos1705) : 0;
  document.getElementById('resumoQtdApos1705').textContent = `${fmtNum.format(k.qtd_urnas_apos_17h05)} urnas`;
  document.getElementById('resumoApos1705Cand1').textContent = `Lula 13: ${fmtPct(pct1Apos1705)} (${fmtNum.format(k.cand1_urnas_apos_17h05)})`;
  document.getElementById('resumoApos1705Cand2').textContent = `Flávio 22: ${fmtPct(pct2Apos1705)} (${fmtNum.format(k.cand2_urnas_apos_17h05)})`;

  // Régua de 6 Faixas de Horário de Encerramento
  const bands = [
    {
      code: 'ate_17h02',
      title: 'Até 17h02 BRT',
      subtitle: 'Sem fila pós-17h',
      urnas: k.qtd_urnas_ate_17h,
      c1: k.cand1_urnas_ate_17h,
      c2: k.cand2_urnas_ate_17h
    },
    {
      code: 'ate_17h05',
      title: 'Até 17h05 BRT',
      subtitle: 'Tolerância normal',
      urnas: k.qtd_urnas_ate_17h05,
      c1: k.cand1_urnas_ate_17h05,
      c2: k.cand2_urnas_ate_17h05
    },
    {
      code: 'apos_17h05',
      title: 'Após 17h05 BRT',
      subtitle: 'Fechamento tardio',
      urnas: k.qtd_urnas_apos_17h05,
      c1: k.cand1_urnas_apos_17h05,
      c2: k.cand2_urnas_apos_17h05
    },
    {
      code: 'apos_17h15',
      title: 'Após 17h15 BRT',
      subtitle: '+15 min após 17h',
      urnas: k.qtd_urnas_apos_17h15,
      c1: k.cand1_urnas_apos_17h15,
      c2: k.cand2_urnas_apos_17h15
    },
    {
      code: 'apos_17h30',
      title: 'Após 17h30 BRT',
      subtitle: '+30 min após 17h',
      urnas: k.qtd_urnas_apos_17h30,
      c1: k.cand1_urnas_apos_17h30,
      c2: k.cand2_urnas_apos_17h30
    },
    {
      code: 'apos_18h00',
      title: 'Após 18h00 BRT',
      subtitle: '+1 hora após 17h',
      urnas: k.qtd_urnas_apos_18h00,
      c1: k.cand1_urnas_apos_18h00,
      c2: k.cand2_urnas_apos_18h00
    }
  ];

  const container = document.getElementById('timeCutoffCards');
  container.innerHTML = bands.map(b => {
    const tot = b.c1 + b.c2;
    const p1 = tot > 0 ? (b.c1 * 100 / tot) : 50;
    const p2 = tot > 0 ? (b.c2 * 100 / tot) : 50;
    const isSelected = state.corte_horario === b.code;
    return `
      <button data-corte="${b.code}" class="corte-card-btn text-left p-3 rounded-lg bg-[var(--bg-surface)] border transition ${
        isSelected
          ? 'border-[var(--post-17h)] bg-[var(--post-17h-soft)]/40'
          : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]'
      }">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-[var(--text-primary)]">${b.title}</span>
          <span class="text-[10px] num-tabular text-[var(--text-secondary)]">${fmtNum.format(b.urnas)}</span>
        </div>
        <div class="w-full h-1.5 rounded-full overflow-hidden flex bg-[var(--bg-canvas)] my-2">
          <div class="h-full bg-[var(--cand-13)]" style="width: ${p1}%"></div>
          <div class="h-full bg-[var(--cand-22)]" style="width: ${p2}%"></div>
        </div>
        <div class="flex justify-between num-tabular text-[11px]">
          <span class="text-[var(--cand-13)] font-semibold">13: ${fmtPct(p1)}</span>
          <span class="text-[var(--cand-22)] font-semibold">22: ${fmtPct(p2)}</span>
        </div>
      </button>
    `;
  }).join('');

  container.querySelectorAll('.corte-card-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = btn.getAttribute('data-corte');
      state.corte_horario = (state.corte_horario === c) ? 'todos' : c;
      document.getElementById('fCorteHorario').value = state.corte_horario;
      const selT1 = document.getElementById('fCorteHorarioTabela1');
      if (selT1) selT1.value = state.corte_horario;
      state.page = 1;
      refreshAll();
    });
  });
}

function renderKpis(k) {
  document.getElementById('kpiUrnasCount').textContent = `${fmtNum.format(k.total_urnas)} urnas`;

  // Lula (13)
  document.getElementById('kpiPctCand1_2t').textContent = `${fmtPct(k.pct_cand_1)} no 2ºT`;
  document.getElementById('kpiCand1_1t').textContent = `${fmtNum.format(k.votos_cand_1_1t)} (${fmtPct(k.pct_cand_1_1t)})`;
  document.getElementById('kpiCand1_2t').textContent = `${fmtNum.format(k.votos_cand_1)} votos`;
  const elDiff1 = document.getElementById('kpiDiffCand1');
  elDiff1.textContent = `${fmtDiff(k.diff_cand_1)} votos`;
  elDiff1.className = `num-tabular font-bold ${k.diff_cand_1 >= 0 ? 'text-[var(--bio-ok)]' : 'text-[var(--cand-13)]'}`;
  document.getElementById('kpiCand1Apos17Card').textContent = `${fmtNum.format(k.votos_cand_1_apos_17h)} (${fmtPct(k.pct_cand_1_apos_17h)})`;

  // Flávio Bolsonaro (22)
  document.getElementById('kpiPctCand2_2t').textContent = `${fmtPct(k.pct_cand_2)} no 2ºT`;
  document.getElementById('kpiCand2_1t').textContent = `${fmtNum.format(k.votos_cand_2_1t)} (${fmtPct(k.pct_cand_2_1t)})`;
  document.getElementById('kpiCand2_2t').textContent = `${fmtNum.format(k.votos_cand_2)} votos`;
  const elDiff2 = document.getElementById('kpiDiffCand2');
  elDiff2.textContent = `${fmtDiff(k.diff_cand_2)} votos`;
  elDiff2.className = `num-tabular font-bold ${k.diff_cand_2 >= 0 ? 'text-[var(--bio-ok)]' : 'text-[var(--cand-13)]'}`;
  document.getElementById('kpiCand2Apos17Card').textContent = `${fmtNum.format(k.votos_cand_2_apos_17h)} (${fmtPct(k.pct_cand_2_apos_17h)})`;

  // Abstenção
  document.getElementById('kpiAbst1t').textContent = `${fmtPct(k.taxa_abstencao_1t)} (${fmtNum.format(k.abstencoes_1t)})`;
  document.getElementById('kpiAbst2t').textContent = `${fmtPct(k.taxa_abstencao)} (${fmtNum.format(k.abstencoes)})`;
  document.getElementById('kpiOutros1t').textContent = `${fmtNum.format(k.votos_outros_1t)} votos`;
  document.getElementById('kpiUrnasAbstBaixa').textContent = fmtNum.format(k.urnas_abst_baixa);

  // Biometria e Pós-17h
  document.getElementById('kpiUrnas100Bio').textContent = `${fmtNum.format(k.urnas_100_biometria)} urnas 100% Bio`;
  document.getElementById('kpiVotosSemBio').textContent = `${fmtNum.format(k.votos_sem_biometria)} (${fmtPct(k.pct_sem_biometria)})`;
  document.getElementById('kpiUrnasApos17h').textContent = `${fmtNum.format(k.urnas_com_apos_17h)} urnas`;
  document.getElementById('kpiVotosApos17h').textContent = `${fmtNum.format(k.votos_apos_17h)} (${fmtPct(k.pct_apos_17h)})`;
}

function renderMainChart(dash) {
  const ctx = document.getElementById('mainChartCanvas').getContext('2d');
  if (mainChartInstance) mainChartInstance.destroy();

  Chart.defaults.font.family = "'JetBrains Mono', monospace";
  Chart.defaults.font.size = 11;

  const titleEl = document.getElementById('chartMainTitle');
  const subEl = document.getElementById('chartMainSubtitle');
  const tipoLocal = dash.groupType === 'municipio' ? 'Município' : 'Estado (UF)';
  const labels = dash.porLocalidade.map(r => r.label);

  const commonScales = {
    x: { ticks: { color: '#a8b5c8' }, grid: { color: 'rgba(46, 59, 82, 0.35)' } },
    y: { ticks: { color: '#a8b5c8' }, grid: { color: 'rgba(46, 59, 82, 0.35)' } }
  };

  if (state.chartMode === 'apos_17h') {
    titleEl.textContent = `Total de Votos Computados DEPOIS das 17h00 por ${tipoLocal} (Lula 13 vs. Flávio Bolsonaro 22)`;
    subEl.textContent = `Volume de votos registrados após as 17h00 (Horário de Brasília) para cada candidato em cada ${tipoLocal}.`;

    mainChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Lula (13) — Votos DEPOIS das 17h',
            data: dash.porLocalidade.map(r => r.votos_cand_1_apos_17h),
            backgroundColor: '#f43f5e',
            borderRadius: 3
          },
          {
            label: 'Flávio Bolsonaro (22) — Votos DEPOIS das 17h',
            data: dash.porLocalidade.map(r => r.votos_cand_2_apos_17h),
            backgroundColor: '#0ea5e9',
            borderRadius: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#f1f5f9', font: { family: "'Plus Jakarta Sans', sans-serif", weight: '600' } } } },
        scales: commonScales
      }
    });
  } else if (state.chartMode === 'comp_1t_2t') {
    titleEl.textContent = `Comparação Direta: 1º Turno vs. 2º Turno por ${tipoLocal}`;
    subEl.textContent = `Barras translúcidas = 1º Turno · Barras sólidas = 2º Turno.`;

    mainChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Lula (13) — 1º Turno',
            data: dash.porLocalidade.map(r => r.votos_cand_1_1t),
            backgroundColor: 'rgba(244, 63, 94, 0.35)',
            borderColor: '#f43f5e',
            borderWidth: 1
          },
          {
            label: 'Lula (13) — 2º Turno',
            data: dash.porLocalidade.map(r => r.votos_cand_1),
            backgroundColor: '#f43f5e'
          },
          {
            label: 'Flávio Bolsonaro (22) — 1º Turno',
            data: dash.porLocalidade.map(r => r.votos_cand_2_1t),
            backgroundColor: 'rgba(14, 165, 233, 0.35)',
            borderColor: '#0ea5e9',
            borderWidth: 1
          },
          {
            label: 'Flávio Bolsonaro (22) — 2º Turno',
            data: dash.porLocalidade.map(r => r.votos_cand_2),
            backgroundColor: '#0ea5e9'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#f1f5f9', font: { family: "'Plus Jakarta Sans', sans-serif", weight: '600' } } } },
        scales: commonScales
      }
    });
  } else if (state.chartMode === 'ganho_perda') {
    titleEl.textContent = `Variação Líquida de Votos do 1º para o 2º Turno (2ºT - 1ºT) por ${tipoLocal}`;
    subEl.textContent = `Saldo de novos votos conquistados (ou perdidos) por candidato entre os dois turnos.`;

    mainChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Saldo Lula (13) [2ºT - 1ºT]',
            data: dash.porLocalidade.map(r => r.diff_cand_1),
            backgroundColor: '#f43f5e',
            borderRadius: 3
          },
          {
            label: 'Saldo Flávio Bolsonaro (22) [2ºT - 1ºT]',
            data: dash.porLocalidade.map(r => r.diff_cand_2),
            backgroundColor: '#0ea5e9',
            borderRadius: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#f1f5f9', font: { family: "'Plus Jakarta Sans', sans-serif", weight: '600' } } } },
        scales: commonScales
      }
    });
  } else if (state.chartMode === 'abstencao') {
    titleEl.textContent = `Taxa de Abstenção (%): 1º Turno vs. 2º Turno por ${tipoLocal}`;
    subEl.textContent = `Percentual de eleitores aptos ausentes no 1º e no 2º Turno.`;

    mainChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Abstenção 1º Turno (%)',
            data: dash.porLocalidade.map(r => r.taxa_abstencao_1t),
            backgroundColor: 'rgba(168, 85, 247, 0.42)',
            borderColor: '#a855f7',
            borderWidth: 1
          },
          {
            label: 'Abstenção 2º Turno (%)',
            data: dash.porLocalidade.map(r => r.taxa_abstencao),
            backgroundColor: '#a855f7'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#f1f5f9', font: { family: "'Plus Jakarta Sans', sans-serif", weight: '600' } } } },
        scales: {
          x: commonScales.x,
          y: { ticks: { color: '#a8b5c8', callback: v => `${v}%` }, grid: commonScales.y.grid }
        }
      }
    });
  } else if (state.chartMode === 'modelos') {
    titleEl.textContent = `Distribuição de Votos e Biometria por Modelo de Urna (UE2013 a UE2022)`;
    subEl.textContent = `Comparativo percentual de votação no 2º Turno e taxa de liberação sem biometria por safra de equipamento.`;

    const modLabels = dash.porModeloUrna.map(r => r.modelo_urna);
    mainChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: modLabels,
        datasets: [
          {
            label: '% Lula (13) no 2ºT',
            data: dash.porModeloUrna.map(r => r.pct_cand_1),
            backgroundColor: '#f43f5e',
            borderRadius: 3
          },
          {
            label: '% Flávio Bolsonaro (22) no 2ºT',
            data: dash.porModeloUrna.map(r => r.pct_cand_2),
            backgroundColor: '#0ea5e9',
            borderRadius: 3
          },
          {
            label: '% Sem Biometria',
            data: dash.porModeloUrna.map(r => r.pct_sem_biometria),
            backgroundColor: '#f59e0b',
            borderRadius: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#f1f5f9', font: { family: "'Plus Jakarta Sans', sans-serif", weight: '600' } } } },
        scales: {
          x: commonScales.x,
          y: { ticks: { color: '#a8b5c8', callback: v => `${v}%` }, grid: commonScales.y.grid }
        }
      }
    });
  }
}

function updateStateSortUI() {
  const dirSymbol = state.stateSortDir === 'ASC' ? '▲ Crescente' : '▼ Decrescente';
  const colName = SORT_LABELS_STATE[state.stateSortBy] || state.stateSortBy;
  const badge = document.getElementById('stateSortBadge');
  if (badge) {
    badge.textContent = `Ordenado por: ${colName} (${dirSymbol})`;
  }

  document.querySelectorAll('.state-sort-header').forEach(th => {
    const col = th.getAttribute('data-state-sort');
    const icon = th.querySelector('.state-sort-icon');
    if (col === state.stateSortBy) {
      th.classList.add('sort-active');
      if (icon) {
        icon.textContent = state.stateSortDir === 'ASC' ? '▲' : '▼';
        icon.className = 'state-sort-icon ml-1 text-[var(--bio-ok)] font-bold';
      }
    } else {
      th.classList.remove('sort-active');
      if (icon) {
        icon.textContent = '↕';
        icon.className = 'state-sort-icon ml-1 text-[var(--text-muted)]';
      }
    }
  });
}

function updateUrnaSortUI() {
  const dirText = state.sortDir === 'ASC' ? 'Crescente ▲ (Menor → Maior)' : 'Decrescente ▼ (Maior → Menor)';
  const colName = SORT_LABELS_URNA[state.sortBy] || state.sortBy;
  const labelEl = document.getElementById('activeSortLabel');
  if (labelEl) {
    labelEl.textContent = `Ordenado por: ${colName} — ${dirText}`;
  }

  document.querySelectorAll('.sort-header').forEach(th => {
    const col = th.getAttribute('data-sort');
    const icon = th.querySelector('.urna-sort-icon');
    if (col === state.sortBy) {
      th.classList.add('sort-active');
      if (icon) {
        icon.textContent = state.sortDir === 'ASC' ? '▲' : '▼';
        icon.className = 'urna-sort-icon ml-1 text-[var(--bio-ok)] font-bold';
      }
    } else {
      th.classList.remove('sort-active');
      if (icon) {
        icon.textContent = '↕';
        icon.className = 'urna-sort-icon ml-1 text-[var(--text-muted)]';
      }
    }
  });
}

function renderStatesSummaryTable(dash) {
  updateStateSortUI();
  const tbody = document.getElementById('statesSummaryBody');
  const mode = state.stateTableMode || 'ambos';
  const showTotal = (mode === 'ambos' || mode === 'periodo_total');
  const showCompAntes17 = (mode === 'ambos' || mode === 'antes_17h');
  const showCompApos17 = (mode === 'ambos' || mode === 'apos_17h');
  const showAntes17Det = (mode === 'antes_17h');
  const showApos17Det = (mode === 'apos_17h');

  // Mostrar/ocultar cabeçalhos conforme o modo selecionado
  document.querySelectorAll('th[data-col-group="total"]').forEach(th => th.classList.toggle('hidden', !showTotal));
  document.querySelectorAll('th[data-col-group="comp_antes17"]').forEach(th => th.classList.toggle('hidden', !showCompAntes17));
  document.querySelectorAll('th[data-col-group="comp_apos17"]').forEach(th => th.classList.toggle('hidden', !showCompApos17));
  document.querySelectorAll('th[data-col-group="antes17_det"]').forEach(th => th.classList.toggle('hidden', !showAntes17Det));
  document.querySelectorAll('th[data-col-group="apos17_det"]').forEach(th => th.classList.toggle('hidden', !showApos17Det));

  const enrichedRows = dash.porLocalidade.map(r => {
    const votos_cand_1_antes_17h = Math.max(0, (r.votos_cand_1 || 0) - (r.votos_cand_1_apos_17h || 0));
    const votos_cand_2_antes_17h = Math.max(0, (r.votos_cand_2 || 0) - (r.votos_cand_2_apos_17h || 0));
    const votos_antes_17h = votos_cand_1_antes_17h + votos_cand_2_antes_17h;
    const pct_cand_1_antes_17h = votos_antes_17h > 0 ? Number(((votos_cand_1_antes_17h * 100) / votos_antes_17h).toFixed(2)) : 0;
    const pct_cand_2_antes_17h = votos_antes_17h > 0 ? Number(((votos_cand_2_antes_17h * 100) / votos_antes_17h).toFixed(2)) : 0;

    const votos_sem_biometria_ate_17h = Math.max(0, (r.votos_sem_biometria || 0) - (r.votos_sem_biometria_apos_17h || 0));
    const comp_ate_17h = Math.max(1, (r.comparecimento || 0) - (r.votos_apos_17h || 0));
    const pct_sem_biometria_ate_17h = Number(((votos_sem_biometria_ate_17h * 100) / comp_ate_17h).toFixed(2));

    // Seleciona as métricas ativas de Urnas, Abstenção e Biometria conforme o filtro de período da Tabela 1
    let active_urnas = r.urnas;
    let active_taxa_abstencao = r.taxa_abstencao;
    let active_abstencoes = r.abstencoes;
    let active_urnas_100_bio = r.urnas_100_bio;
    let active_votos_sem_bio = r.votos_sem_biometria;
    let active_pct_sem_bio = r.pct_sem_biometria;

    if (mode === 'apos_17h') {
      active_urnas = r.urnas_apos_17h ?? r.urnas;
      active_taxa_abstencao = r.taxa_abstencao_apos_17h ?? r.taxa_abstencao;
      active_abstencoes = r.abstencoes_apos_17h ?? r.abstencoes;
      active_urnas_100_bio = r.urnas_100_bio_apos_17h ?? r.urnas_100_bio;
      active_votos_sem_bio = r.votos_sem_biometria_apos_17h ?? r.votos_sem_biometria;
      active_pct_sem_bio = r.pct_sem_biometria_apos_17h ?? r.pct_sem_biometria;
    } else if (mode === 'antes_17h') {
      active_urnas = r.urnas_ate_17h ?? r.urnas;
      active_taxa_abstencao = r.taxa_abstencao_ate_17h ?? r.taxa_abstencao;
      active_abstencoes = r.abstencoes_ate_17h ?? r.abstencoes;
      active_urnas_100_bio = r.urnas_100_bio_ate_17h ?? r.urnas_100_bio;
      active_votos_sem_bio = votos_sem_biometria_ate_17h;
      active_pct_sem_bio = pct_sem_biometria_ate_17h;
    }

    return {
      ...r,
      votos_antes_17h,
      votos_cand_1_antes_17h,
      votos_cand_2_antes_17h,
      pct_cand_1_antes_17h,
      pct_cand_2_antes_17h,
      active_urnas,
      active_taxa_abstencao,
      active_abstencoes,
      active_urnas_100_bio,
      active_votos_sem_bio,
      active_pct_sem_bio
    };
  });

  const sortedRows = [...enrichedRows].sort((a, b) => {
    const col = state.stateSortBy;
    const dir = state.stateSortDir === 'ASC' ? 1 : -1;
    if (col === 'label') {
      return String(a.label).localeCompare(String(b.label), 'pt-BR') * dir;
    }
    const sortKeyMap = {
      urnas: 'active_urnas',
      taxa_abstencao: 'active_taxa_abstencao',
      urnas_100_bio: 'active_urnas_100_bio',
      pct_sem_biometria: 'active_pct_sem_bio'
    };
    const key = sortKeyMap[col] || col;
    const va = Number(a[key] || 0);
    const vb = Number(b[key] || 0);
    return (va - vb) * dir;
  });

  tbody.innerHTML = sortedRows.map(r => {
    const nomeCompleto = dash.groupType === 'uf' ? `${r.label} — ${NOMES_UF[r.label] || r.label}` : `${r.label} (${r.uf})`;
    const pctBio100 = r.active_urnas > 0 ? ((r.active_urnas_100_bio * 100) / r.active_urnas).toFixed(1).replace('.', ',') : '0,0';

    const colsTotalHtml = showTotal ? `
        <td class="py-2.5 px-2.5 text-right num-tabular">
          <span class="text-[var(--text-muted)]">${fmtNum.format(r.votos_cand_1_1t)}</span> &rarr; <strong class="text-[var(--cand-13)]">${fmtNum.format(r.votos_cand_1)}</strong>
        </td>
        <td class="py-2.5 px-2.5 text-right num-tabular">
          <span class="text-[var(--text-muted)]">${fmtNum.format(r.votos_cand_2_1t)}</span> &rarr; <strong class="text-[var(--cand-22)]">${fmtNum.format(r.votos_cand_2)}</strong>
        </td>
        <td class="py-2.5 px-2.5 text-center num-tabular text-[11px]">
          <span class="text-[var(--cand-13)] font-bold">${fmtPct(r.pct_cand_1)}</span>
          <span class="text-[var(--text-muted)] mx-0.5">/</span>
          <span class="text-[var(--cand-22)] font-bold">${fmtPct(r.pct_cand_2)}</span>
        </td>
    ` : '';

    const colsCompAntes17Html = showCompAntes17 ? `
        <td class="py-2.5 px-2.5 text-center num-tabular bg-[var(--bio-ok-soft)]/10">
          <div class="whitespace-nowrap text-[11px]">
            <span class="text-[var(--cand-13)] font-bold">${fmtNum.format(r.votos_cand_1_antes_17h)}</span>
            <span class="text-[var(--text-muted)] mx-0.5">/</span>
            <span class="text-[var(--cand-22)] font-bold">${fmtNum.format(r.votos_cand_2_antes_17h)}</span>
          </div>
          <div class="text-[10px] text-[var(--text-muted)] whitespace-nowrap">
            Tot &lt;17h: ${fmtNum.format(r.votos_antes_17h)}
          </div>
        </td>
        <td class="py-2.5 px-2.5 text-center num-tabular text-[11px] bg-[var(--bio-ok-soft)]/10">
          <span class="text-[var(--cand-13)] font-bold">${fmtPct(r.pct_cand_1_antes_17h)}</span>
          <span class="text-[var(--text-muted)] mx-0.5">/</span>
          <span class="text-[var(--cand-22)] font-bold">${fmtPct(r.pct_cand_2_antes_17h)}</span>
        </td>
    ` : '';

    const colsAntes17DetHtml = showAntes17Det ? `
        <td class="py-2.5 px-2.5 text-right num-tabular font-bold text-[var(--cand-13)]">
          ${fmtNum.format(r.votos_cand_1_antes_17h)}
        </td>
        <td class="py-2.5 px-2.5 text-right num-tabular font-bold text-[var(--cand-22)]">
          ${fmtNum.format(r.votos_cand_2_antes_17h)}
        </td>
    ` : '';

    const colsCompApos17Html = showCompApos17 ? `
        <td class="py-2.5 px-2.5 text-center num-tabular bg-[var(--post-17h-soft)]/15">
          <div class="whitespace-nowrap text-[11px]">
            <span class="text-[var(--cand-13)] font-bold">${fmtNum.format(r.votos_cand_1_apos_17h)}</span>
            <span class="text-[var(--text-muted)] mx-0.5">/</span>
            <span class="text-[var(--cand-22)] font-bold">${fmtNum.format(r.votos_cand_2_apos_17h)}</span>
          </div>
          <div class="text-[10px] text-[var(--post-17h)] whitespace-nowrap">
            Tot &gt;17h: ${fmtNum.format(r.votos_apos_17h)} <span class="text-[var(--text-muted)]">(${r.pct_apos_17h}%)</span>
          </div>
        </td>
        <td class="py-2.5 px-2.5 text-center num-tabular text-[11px] bg-[var(--post-17h-soft)]/15">
          <span class="text-[var(--cand-13)] font-bold">${fmtPct(r.pct_cand_1_apos_17h)}</span>
          <span class="text-[var(--text-muted)] mx-0.5">/</span>
          <span class="text-[var(--cand-22)] font-bold">${fmtPct(r.pct_cand_2_apos_17h)}</span>
        </td>
    ` : '';

    const colsApos17DetHtml = showApos17Det ? `
        <td class="py-2.5 px-2.5 text-right num-tabular font-bold bg-[var(--post-17h-soft)]/15 text-[var(--cand-13)]">
          ${fmtNum.format(r.votos_cand_1_apos_17h)}
        </td>
        <td class="py-2.5 px-2.5 text-right num-tabular font-bold bg-[var(--post-17h-soft)]/15 text-[var(--cand-22)]">
          ${fmtNum.format(r.votos_cand_2_apos_17h)}
        </td>
    ` : '';

    return `
      <tr data-loc="${r.label}" class="state-summary-row hover:bg-[var(--bg-hover)] cursor-pointer transition">
        <td class="py-2.5 px-3.5 font-bold text-[var(--text-primary)]">${nomeCompleto}</td>
        <td class="py-2.5 px-2.5 text-right num-tabular text-[var(--text-secondary)]">${fmtNum.format(r.active_urnas)}</td>
        ${colsTotalHtml}
        ${colsCompAntes17Html}
        ${colsAntes17DetHtml}
        ${colsCompApos17Html}
        ${colsApos17DetHtml}
        <td class="py-2.5 px-2.5 text-right num-tabular text-[var(--abst-hue)] font-medium">
          ${fmtPct(r.active_taxa_abstencao)} <span class="text-[10px] text-[var(--text-muted)] font-normal">(${fmtNum.format(r.active_abstencoes)})</span>
        </td>
        <td class="py-2.5 px-2.5 text-right num-tabular text-[var(--bio-ok)] font-bold">
          ${fmtNum.format(r.active_urnas_100_bio)} <span class="text-[10px] text-[var(--text-muted)] font-normal">(${pctBio100}%)</span>
        </td>
        <td class="py-2.5 px-3 text-right num-tabular text-[var(--post-17h)]">
          ${fmtPct(r.active_pct_sem_bio)} <span class="text-[10px] text-[var(--text-muted)]">(${fmtNum.format(r.active_votos_sem_bio)})</span>
        </td>
      </tr>
    `;
  }).join('');

  const tfoot = document.getElementById('statesSummaryFoot');
  if (tfoot && dash.kpis) {
    const k = dash.kpis;
    let footUrnas = k.total_urnas;
    let footTaxaAbst = k.taxa_abstencao;
    let footAbst = k.abstencoes;
    let footBio100 = k.urnas_100_biometria;
    let footVotosSemBio = k.votos_sem_biometria;
    let footPctSemBio = k.pct_sem_biometria;

    if (mode === 'apos_17h') {
      footUrnas = k.urnas_com_apos_17h ?? k.total_urnas;
      footTaxaAbst = k.taxa_abstencao_apos_17h ?? k.taxa_abstencao;
      footAbst = k.abstencoes_apos_17h ?? k.abstencoes;
      footBio100 = k.urnas_100_bio_apos_17h ?? k.urnas_100_biometria;
      footVotosSemBio = k.votos_sem_biometria_apos_17h ?? k.votos_sem_biometria;
      footPctSemBio = k.pct_sem_biometria_apos_17h ?? k.pct_sem_biometria;
    } else if (mode === 'antes_17h') {
      footUrnas = k.qtd_urnas_ate_17h ?? k.total_urnas;
      footTaxaAbst = k.taxa_abstencao_ate_17h ?? k.taxa_abstencao;
      footAbst = k.abstencoes_ate_17h ?? k.abstencoes;
      footBio100 = k.urnas_100_bio_ate_17h ?? k.urnas_100_biometria;
      footVotosSemBio = k.votos_sem_biometria_ate_17h ?? k.votos_sem_biometria;
      footPctSemBio = k.pct_sem_biometria_ate_17h ?? k.pct_sem_biometria;
    }

    const pctBioTotal = footUrnas > 0 ? ((footBio100 * 100) / footUrnas).toFixed(1).replace('.', ',') : '0,0';
    const labelEscopo = dash.groupType === 'uf'
      ? `TOTAL BRASIL (${sortedRows.length} UFs)`
      : `TOTAL DO ESTADO (${fmtNum.format(footUrnas)} Urnas)`;

    const footTotalHtml = showTotal ? `
        <td class="py-3 px-2.5 text-right num-tabular">
          <span class="text-[var(--text-secondary)]">${fmtNum.format(k.votos_cand_1_1t)}</span> &rarr; <strong class="text-[var(--cand-13)]">${fmtNum.format(k.votos_cand_1)}</strong>
        </td>
        <td class="py-3 px-2.5 text-right num-tabular">
          <span class="text-[var(--text-secondary)]">${fmtNum.format(k.votos_cand_2_1t)}</span> &rarr; <strong class="text-[var(--cand-22)]">${fmtNum.format(k.votos_cand_2)}</strong>
        </td>
        <td class="py-3 px-2.5 text-center num-tabular text-[11px]">
          <span class="text-[var(--cand-13)] font-bold">${fmtPct(k.pct_cand_1)}</span>
          <span class="text-[var(--text-muted)] mx-0.5">/</span>
          <span class="text-[var(--cand-22)] font-bold">${fmtPct(k.pct_cand_2)}</span>
        </td>
    ` : '';

    const totAntes17 = (k.votos_cand_1_antes_17h || 0) + (k.votos_cand_2_antes_17h || 0);
    const footCompAntes17Html = showCompAntes17 ? `
        <td class="py-3 px-2.5 text-center num-tabular bg-[var(--bio-ok-soft)]/20">
          <div class="whitespace-nowrap text-[11px]">
            <span class="text-[var(--cand-13)] font-bold">${fmtNum.format(k.votos_cand_1_antes_17h)}</span>
            <span class="text-[var(--text-muted)] mx-0.5">/</span>
            <span class="text-[var(--cand-22)] font-bold">${fmtNum.format(k.votos_cand_2_antes_17h)}</span>
          </div>
          <div class="text-[10px] text-[var(--bio-ok)] whitespace-nowrap">
            Tot &lt;17h: ${fmtNum.format(totAntes17)}
          </div>
        </td>
        <td class="py-3 px-2.5 text-center num-tabular text-[11px] bg-[var(--bio-ok-soft)]/20">
          <span class="text-[var(--cand-13)] font-bold">${fmtPct(k.pct_cand_1_antes_17h)}</span>
          <span class="text-[var(--text-muted)] mx-0.5">/</span>
          <span class="text-[var(--cand-22)] font-bold">${fmtPct(k.pct_cand_2_antes_17h)}</span>
        </td>
    ` : '';

    const footAntes17DetHtml = showAntes17Det ? `
        <td class="py-3 px-2.5 text-right num-tabular font-bold text-[var(--cand-13)]">
          ${fmtNum.format(k.votos_cand_1_antes_17h)}
        </td>
        <td class="py-3 px-2.5 text-right num-tabular font-bold text-[var(--cand-22)]">
          ${fmtNum.format(k.votos_cand_2_antes_17h)}
        </td>
    ` : '';

    const footCompApos17Html = showCompApos17 ? `
        <td class="py-3 px-2.5 text-center num-tabular bg-[var(--post-17h-soft)]/30">
          <div class="whitespace-nowrap text-[11px]">
            <span class="text-[var(--cand-13)] font-bold">${fmtNum.format(k.votos_cand_1_apos_17h)}</span>
            <span class="text-[var(--text-muted)] mx-0.5">/</span>
            <span class="text-[var(--cand-22)] font-bold">${fmtNum.format(k.votos_cand_2_apos_17h)}</span>
          </div>
          <div class="text-[10px] text-[var(--post-17h)] whitespace-nowrap">
            Tot &gt;17h: ${fmtNum.format(k.votos_apos_17h)} <span class="text-[var(--text-secondary)]">(${k.pct_apos_17h}%)</span>
          </div>
        </td>
        <td class="py-3 px-2.5 text-center num-tabular text-[11px] bg-[var(--post-17h-soft)]/30">
          <span class="text-[var(--cand-13)] font-bold">${fmtPct(k.pct_cand_1_apos_17h)}</span>
          <span class="text-[var(--text-muted)] mx-0.5">/</span>
          <span class="text-[var(--cand-22)] font-bold">${fmtPct(k.pct_cand_2_apos_17h)}</span>
        </td>
    ` : '';

    const footApos17DetHtml = showApos17Det ? `
        <td class="py-3 px-2.5 text-right num-tabular font-bold bg-[var(--post-17h-soft)]/30 text-[var(--cand-13)]">
          ${fmtNum.format(k.votos_cand_1_apos_17h)}
        </td>
        <td class="py-3 px-2.5 text-right num-tabular font-bold bg-[var(--post-17h-soft)]/30 text-[var(--cand-22)]">
          ${fmtNum.format(k.votos_cand_2_apos_17h)}
        </td>
    ` : '';

    tfoot.innerHTML = `
      <tr class="bg-[var(--bg-canvas)] text-[var(--text-primary)]">
        <td class="py-3 px-3.5 font-extrabold text-[var(--bio-ok)] uppercase tracking-wide">
          ${labelEscopo}
        </td>
        <td class="py-3 px-2.5 text-right num-tabular font-bold text-[var(--text-primary)]">
          ${fmtNum.format(footUrnas)}
        </td>
        ${footTotalHtml}
        ${footCompAntes17Html}
        ${footAntes17DetHtml}
        ${footCompApos17Html}
        ${footApos17DetHtml}
        <td class="py-3 px-2.5 text-right num-tabular text-[var(--abst-hue)] font-bold">
          ${fmtPct(footTaxaAbst)} <span class="text-[10px] text-[var(--text-muted)] font-normal">(${fmtNum.format(footAbst)})</span>
        </td>
        <td class="py-3 px-2.5 text-right num-tabular text-[var(--bio-ok)] font-bold">
          ${fmtNum.format(footBio100)} <span class="text-[10px] text-[var(--text-secondary)] font-normal">(${pctBioTotal}%)</span>
        </td>
        <td class="py-3 px-3 text-right num-tabular font-bold text-[var(--post-17h)]">
          ${fmtPct(footPctSemBio)} <span class="text-[10px] text-[var(--text-secondary)] font-normal">(${fmtNum.format(footVotosSemBio)})</span>
        </td>
      </tr>
    `;
  }

  tbody.querySelectorAll('.state-summary-row').forEach(tr => {
    tr.addEventListener('click', async () => {
      const loc = tr.getAttribute('data-loc');
      if (dash.groupType === 'uf') {
        state.uf = loc;
        document.getElementById('fUf').value = loc;
        renderStateTabsBar();
        await loadMunicipiosForUf(loc);
      } else {
        state.municipio = loc;
        document.getElementById('fMunicipio').value = loc;
      }
      state.page = 1;
      await refreshAll();
      document.getElementById('secaoTableSection').scrollIntoView({ behavior: 'smooth' });
    });
  });
}

function renderUrnasTable(tableData) {
  updateUrnaSortUI();
  const tbody = document.getElementById('urnasTableBody');
  document.getElementById('tableTotalBadge').textContent = `${fmtNum.format(tableData.total)} urnas`;

  const startIdx = tableData.total === 0 ? 0 : (tableData.page - 1) * tableData.pageSize + 1;
  const endIdx = Math.min(tableData.total, tableData.page * tableData.pageSize);
  document.getElementById('paginationInfo').textContent = `Exibindo ${fmtNum.format(startIdx)} a ${fmtNum.format(endIdx)} de ${fmtNum.format(tableData.total)} seções`;
  document.getElementById('pageIndicator').textContent = `Página ${tableData.page} de ${Math.max(1, tableData.totalPages)}`;

  document.getElementById('btnPrevPage').disabled = tableData.page <= 1;
  document.getElementById('btnNextPage').disabled = tableData.page >= tableData.totalPages;

  if (tableData.rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" class="py-10 text-center text-[var(--text-secondary)]">
          Nenhuma seção eleitoral encontrada para esta combinação de filtros. Use o botão "Limpar" acima para restaurar.
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  let lastUfRendered = null;

  for (const r of tableData.rows) {
    if (r.uf !== lastUfRendered) {
      lastUfRendered = r.uf;
      html += `
        <tr class="bg-[var(--bg-elevated)] border-y border-[var(--border-subtle)]">
          <td colspan="12" class="py-2 px-3.5 font-bold text-[var(--bio-ok)] text-xs tracking-wide">
            ESTADO: ${r.uf} — ${NOMES_UF[r.uf] || r.uf} · Região ${r.regiao}
          </td>
        </tr>
      `;
    }

    const bioHtml = r.apenas_biometria === 1
      ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold num-tabular bg-[var(--bio-ok-soft)] text-[var(--bio-ok)] border border-[var(--bio-ok)]/30">100% Bio (0)</span>`
      : `<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold num-tabular bg-[var(--post-17h-soft)] text-[var(--post-17h)] border border-[var(--post-17h)]/30">${r.votos_sem_biometria} sem bio (${r.pct_sem_biometria}%)</span>`;

    const diff1Color = r.diff_cand_1 < 0 ? 'text-[var(--post-17h)] font-bold' : 'text-[var(--bio-ok)]';
    const diff2Color = r.diff_cand_2 < 0 ? 'text-[var(--post-17h)] font-bold' : 'text-[var(--bio-ok)]';
    const minAtraso = Math.floor((r.segundos_apos_17h || 0) / 60);

    const c1Antes17 = Math.max(0, (r.votos_cand_1 || 0) - (r.votos_cand_1_apos_17h || 0));
    const c2Antes17 = Math.max(0, (r.votos_cand_2 || 0) - (r.votos_cand_2_apos_17h || 0));
    const totAntes17 = c1Antes17 + c2Antes17;
    const pct1Antes17 = totAntes17 > 0 ? ((c1Antes17 * 100) / totAntes17).toFixed(1).replace('.', ',') : '0,0';
    const pct2Antes17 = totAntes17 > 0 ? ((c2Antes17 * 100) / totAntes17).toFixed(1).replace('.', ',') : '0,0';

    const c1Apos17 = r.votos_cand_1_apos_17h || 0;
    const c2Apos17 = r.votos_cand_2_apos_17h || 0;
    const totApos17Nom = c1Apos17 + c2Apos17;
    const pct1Apos17 = totApos17Nom > 0 ? ((c1Apos17 * 100) / totApos17Nom).toFixed(1).replace('.', ',') : '0,0';
    const pct2Apos17 = totApos17Nom > 0 ? ((c2Apos17 * 100) / totApos17Nom).toFixed(1).replace('.', ',') : '0,0';

    html += `
      <tr data-id="${r.id}" class="urna-row hover:bg-[var(--bg-hover)] cursor-pointer transition">
        <td class="py-2.5 px-3.5">
          <div class="font-bold text-[var(--text-primary)]"><span class="text-[var(--bio-ok)] num-tabular">${r.uf}</span> — ${r.municipio}</div>
          <div class="text-[11px] text-[var(--text-secondary)] truncate max-w-[260px]">${r.local_votacao}</div>
        </td>
        <td class="py-2.5 px-2.5 num-tabular text-[var(--text-primary)]">
          Z.<strong>${r.zona}</strong> / S.<strong>${r.secao}</strong>
        </td>
        <td class="py-2.5 px-2.5">
          <span class="px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] num-tabular text-[11px]">${r.modelo_urna}</span>
        </td>
        <td class="py-2.5 px-2.5 text-right num-tabular">
          <div class="text-[var(--text-secondary)]">${r.votos_cand_1_1t} &rarr; <strong class="text-[var(--cand-13)]">${r.votos_cand_1}</strong> <span class="text-[10px] text-[var(--text-muted)]">(${r.pct_cand_1}%)</span></div>
          <div class="text-[11px] ${diff1Color}">(${fmtDiff(r.diff_cand_1)})</div>
        </td>
        <td class="py-2.5 px-2.5 text-right num-tabular">
          <div class="text-[var(--text-secondary)]">${r.votos_cand_2_1t} &rarr; <strong class="text-[var(--cand-22)]">${r.votos_cand_2}</strong> <span class="text-[10px] text-[var(--text-muted)]">(${r.pct_cand_2}%)</span></div>
          <div class="text-[11px] ${diff2Color}">(${fmtDiff(r.diff_cand_2)})</div>
        </td>
        <td class="py-2.5 px-2.5 text-right num-tabular bg-[var(--post-17h-soft)]/10">
          <div class="font-bold ${minAtraso >= 15 ? 'text-[var(--cand-13)]' : minAtraso >= 2 ? 'text-[var(--post-17h)]' : 'text-[var(--bio-ok)]'}">
            ${r.horario_encerramento_brt} BRT
          </div>
          <div class="text-[10px] text-[var(--text-muted)]">${minAtraso > 0 ? `+${minAtraso} min pós-17h` : 'No horário'}</div>
        </td>
        <td class="py-2.5 px-2.5 text-center num-tabular bg-[var(--bio-ok-soft)]/10">
          <div class="text-[11px] whitespace-nowrap font-bold">
            <span class="text-[var(--cand-13)]">${c1Antes17}</span>
            <span class="text-[var(--text-muted)] mx-0.5">/</span>
            <span class="text-[var(--cand-22)]">${c2Antes17}</span>
          </div>
          <div class="text-[10px] whitespace-nowrap">
            <span class="text-[var(--cand-13)]">${pct1Antes17}%</span>
            <span class="text-[var(--text-muted)] mx-0.5">/</span>
            <span class="text-[var(--cand-22)]">${pct2Antes17}%</span>
          </div>
        </td>
        <td class="py-2.5 px-2.5 text-center num-tabular bg-[var(--post-17h-soft)]/10">
          <div class="text-[11px] whitespace-nowrap font-bold">
            <span class="text-[var(--cand-13)]">${c1Apos17}</span>
            <span class="text-[var(--text-muted)] mx-0.5">/</span>
            <span class="text-[var(--cand-22)]">${c2Apos17}</span>
          </div>
          <div class="text-[10px] whitespace-nowrap">
            <span class="text-[var(--cand-13)]">${pct1Apos17}%</span>
            <span class="text-[var(--text-muted)] mx-0.5">/</span>
            <span class="text-[var(--cand-22)]">${pct2Apos17}%</span>
            <span class="text-[var(--text-muted)] ml-0.5">(${r.votos_apos_17h})</span>
          </div>
        </td>
        <td class="py-2.5 px-2.5 text-right num-tabular">
          <div class="text-[var(--text-secondary)]">${fmtPct(r.taxa_abstencao_1t)} &rarr; <strong class="text-[var(--abst-hue)]">${fmtPct(r.taxa_abstencao)}</strong></div>
          <div class="text-[10px] text-[var(--text-muted)]">${r.abstencoes} ausentes</div>
        </td>
        <td class="py-2.5 px-2.5 text-center">
          ${bioHtml}
        </td>
        <td class="py-2.5 px-2.5 text-right num-tabular">
          <div class="text-[var(--text-secondary)]">13: <strong>${fmtPct(r.media_cand_1_escola)}</strong></div>
          <div class="text-[10px] ${Math.abs(r.z_score_escola) >= 2.5 ? 'text-[var(--cand-13)] font-bold' : 'text-[var(--text-muted)]'}">
            Desvio: ${r.z_score_escola}&sigma;
          </div>
        </td>
        <td class="py-2.5 px-2.5 text-center">
          <button class="px-2.5 py-1 rounded bg-[var(--bg-elevated)] hover:bg-[var(--bio-ok)] hover:text-slate-950 text-[var(--text-primary)] border border-[var(--border-subtle)] font-semibold text-[11px] transition">
            Abrir
          </button>
        </td>
      </tr>
    `;
  }

  tbody.innerHTML = html;

  tbody.querySelectorAll('.urna-row').forEach(tr => {
    tr.addEventListener('click', () => {
      openUrnaDetailModal(tr.getAttribute('data-id'));
    });
  });
}

async function openUrnaDetailModal(id) {
  const res = await fetch(`/api/urna/${id}`);
  if (!res.ok) return;
  const { urna, vizinhasEscola } = await res.json();

  document.getElementById('modalUrnaModelo').textContent = `Urna ${urna.modelo_urna}`;
  document.getElementById('modalUrnaTitle').textContent = `${urna.uf} — ${urna.municipio} | Zona ${urna.zona} / Seção ${urna.secao}`;
  document.getElementById('modalUrnaEscola').textContent = `${urna.local_votacao}`;

  document.getElementById('modalUrnaStatsGrid').innerHTML = `
    <div class="p-4">
      <div class="text-xs font-bold text-[var(--cand-13)]">Lula (13) nesta Seção</div>
      <div class="mt-1.5 text-[var(--text-secondary)] num-tabular">1º Turno: <strong>${urna.votos_cand_1_1t} votos</strong></div>
      <div class="text-[var(--text-primary)] text-sm num-tabular">2º Turno: <strong>${urna.votos_cand_1} votos (${urna.pct_cand_1}%)</strong></div>
      <div class="text-xs text-[var(--post-17h)] mt-1 num-tabular">Depois das 17h: <strong>${urna.votos_cand_1_apos_17h} votos</strong></div>
    </div>
    <div class="p-4">
      <div class="text-xs font-bold text-[var(--cand-22)]">Flávio Bolsonaro (22) nesta Seção</div>
      <div class="mt-1.5 text-[var(--text-secondary)] num-tabular">1º Turno: <strong>${urna.votos_cand_2_1t} votos</strong></div>
      <div class="text-[var(--text-primary)] text-sm num-tabular">2º Turno: <strong>${urna.votos_cand_2} votos (${urna.pct_cand_2}%)</strong></div>
      <div class="text-xs text-[var(--post-17h)] mt-1 num-tabular">Depois das 17h: <strong>${urna.votos_cand_2_apos_17h} votos</strong></div>
    </div>
    <div class="p-4">
      <div class="text-xs font-bold text-[var(--post-17h)]">Fechamento &amp; Biometria</div>
      <div class="mt-1.5 text-[var(--text-primary)] text-sm num-tabular">Encerramento: <strong>${urna.horario_encerramento_brt} BRT</strong></div>
      <div class="text-[var(--post-17h)] num-tabular">Total Pós-17h: <strong>${urna.votos_apos_17h} (${urna.pct_votos_apos_17h}%)</strong></div>
      <div class="text-[var(--text-secondary)] mt-1 num-tabular">Sem Biometria: <strong>${urna.votos_sem_biometria} (${urna.pct_sem_biometria}%)</strong></div>
    </div>
  `;

  const sibBody = document.getElementById('modalSchoolSiblingsBody');
  sibBody.innerHTML = vizinhasEscola.map(v => {
    const isCurrent = v.id === urna.id;
    return `
      <tr class="${isCurrent ? 'bg-[var(--bio-ok-soft)] font-bold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}">
        <td class="py-2 px-3 num-tabular">Seção ${v.secao} ${isCurrent ? '(Selecionada)' : ''}</td>
        <td class="py-2 px-2.5 num-tabular">${v.modelo_urna}</td>
        <td class="py-2 px-2.5 text-right num-tabular text-[var(--cand-13)]">${v.votos_cand_1_1t} &rarr; ${v.votos_cand_1} (${v.pct_cand_1}%)</td>
        <td class="py-2 px-2.5 text-right num-tabular text-[var(--cand-22)]">${v.votos_cand_2_1t} &rarr; ${v.votos_cand_2} (${v.pct_cand_2}%)</td>
        <td class="py-2 px-2.5 text-right num-tabular text-[var(--post-17h)]">${v.horario_encerramento_brt} (${v.votos_apos_17h} &gt;17h)</td>
        <td class="py-2 px-2.5 text-right num-tabular text-[var(--abst-hue)]">${v.taxa_abstencao}%</td>
        <td class="py-2 px-3 text-right num-tabular">${v.apenas_biometria ? '100% Bio (0)' : `${v.pct_sem_biometria}% sem bio`}</td>
      </tr>
    `;
  }).join('');

  document.getElementById('urnaDetailModal').classList.remove('hidden');
}

function bindEvents() {
  const chkBio = document.getElementById('chkApenasBiometria');
  const selBio = document.getElementById('selModoBiometria');

  chkBio.addEventListener('change', () => {
    state.apenas_biometria = chkBio.checked ? 'true' : 'todas';
    selBio.value = state.apenas_biometria;
    state.page = 1;
    refreshAll();
  });

  selBio.addEventListener('change', () => {
    state.apenas_biometria = selBio.value;
    chkBio.checked = (selBio.value === 'true');
    state.page = 1;
    refreshAll();
  });

  document.getElementById('fUf').addEventListener('change', async (e) => {
    state.uf = e.target.value;
    state.municipio = 'TODOS';
    state.page = 1;
    renderStateTabsBar();
    await loadMunicipiosForUf(state.uf);
    refreshAll();
  });

  document.getElementById('fMunicipio').addEventListener('change', (e) => {
    state.municipio = e.target.value;
    state.page = 1;
    refreshAll();
  });

  document.getElementById('fModeloUrna').addEventListener('change', (e) => {
    state.modelo_urna = e.target.value;
    state.page = 1;
    refreshAll();
  });

  document.getElementById('fCorteHorario').addEventListener('change', (e) => {
    state.corte_horario = e.target.value;
    const selT1 = document.getElementById('fCorteHorarioTabela1');
    if (selT1) selT1.value = state.corte_horario;
    state.page = 1;
    refreshAll();
  });

  const selCorteT1 = document.getElementById('fCorteHorarioTabela1');
  if (selCorteT1) {
    selCorteT1.addEventListener('change', (e) => {
      state.corte_horario = e.target.value;
      document.getElementById('fCorteHorario').value = state.corte_horario;
      state.page = 1;
      refreshAll();
    });
  }

  document.querySelectorAll('.st-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.stateTableMode = btn.getAttribute('data-st-mode');
      document.querySelectorAll('.st-mode-btn').forEach(b => {
        const isCurrent = b.getAttribute('data-st-mode') === state.stateTableMode;
        b.className = isCurrent
          ? 'st-mode-btn px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--bio-ok)] text-slate-950 transition'
          : 'st-mode-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] transition';
      });
      if (state.dashboardData) {
        renderStatesSummaryTable(state.dashboardData);
      }
    });
  });

  document.getElementById('fFiltroRapido').addEventListener('change', (e) => {
    state.filtro_rapido = e.target.value;
    state.page = 1;
    refreshAll();
  });

  let searchTimer = null;
  document.getElementById('fBusca').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.busca = e.target.value;
      state.page = 1;
      refreshAll();
    }, 250);
  });

  document.getElementById('btnResetFilters').addEventListener('click', () => {
    state.uf = 'TODAS';
    state.municipio = 'TODOS';
    state.modelo_urna = 'TODOS';
    state.apenas_biometria = 'todas';
    state.corte_horario = 'todos';
    state.filtro_rapido = 'nenhum';
    state.busca = '';
    state.page = 1;

    document.getElementById('fUf').value = 'TODAS';
    document.getElementById('fMunicipio').innerHTML = '<option value="TODOS">Todos os Municípios</option>';
    document.getElementById('fModeloUrna').value = 'TODOS';
    document.getElementById('chkApenasBiometria').checked = false;
    document.getElementById('selModoBiometria').value = 'todas';
    document.getElementById('fCorteHorario').value = 'todos';
    const selT1 = document.getElementById('fCorteHorarioTabela1');
    if (selT1) selT1.value = 'todos';
    document.getElementById('fFiltroRapido').value = 'nenhum';
    document.getElementById('fBusca').value = '';
    renderStateTabsBar();
    refreshAll();
  });

  document.querySelectorAll('.chart-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.chartMode = btn.getAttribute('data-mode');
      document.querySelectorAll('.chart-tab-btn').forEach(b => {
        b.className = (b.getAttribute('data-mode') === state.chartMode)
          ? 'chart-tab-btn px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--post-17h)] text-slate-950 transition'
          : 'chart-tab-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] transition';
      });
      if (state.dashboardData) renderMainChart(state.dashboardData);
    });
  });

  document.getElementById('btnToggleStatesTable').addEventListener('click', () => {
    document.getElementById('statesTableWrapper').classList.toggle('hidden');
  });

  document.getElementById('chkAgruparPorUf').addEventListener('change', (e) => {
    state.agruparPorUf = e.target.checked;
    state.page = 1;
    refreshAll();
  });

  document.querySelectorAll('.state-sort-header').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-state-sort');
      if (state.stateSortBy === col) {
        state.stateSortDir = state.stateSortDir === 'DESC' ? 'ASC' : 'DESC';
      } else {
        state.stateSortBy = col;
        state.stateSortDir = col === 'label' ? 'ASC' : 'DESC';
      }
      if (state.dashboardData) {
        renderStatesSummaryTable(state.dashboardData);
      }
    });
  });

  document.querySelectorAll('.sort-header').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-sort');
      if (state.sortBy === col) {
        state.sortDir = state.sortDir === 'DESC' ? 'ASC' : 'DESC';
      } else {
        state.sortBy = col;
        state.sortDir = col === 'uf' ? 'ASC' : 'DESC';
      }
      state.page = 1;
      refreshAll();
    });
  });

  document.getElementById('btnFlipSortDir').addEventListener('click', () => {
    state.sortDir = state.sortDir === 'DESC' ? 'ASC' : 'DESC';
    state.page = 1;
    refreshAll();
  });

  document.getElementById('selPageSize').addEventListener('change', (e) => {
    state.pageSize = Number(e.target.value);
    state.page = 1;
    refreshAll();
  });

  document.getElementById('btnPrevPage').addEventListener('click', () => {
    if (state.page > 1) {
      state.page--;
      refreshAll();
    }
  });

  document.getElementById('btnNextPage').addEventListener('click', () => {
    state.page++;
    refreshAll();
  });

  document.getElementById('btnExportCsv').addEventListener('click', async () => {
    if (window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:') {
      const tableParams = buildQueryParams(true) + '&pageSize=200';
      const res = await fetch(`/api/urnas?${tableParams}`);
      const data = await res.json();
      const headers = [
        'UF', 'MUNICIPIO', 'ZONA', 'SECAO', 'LOCAL_VOTACAO', 'MODELO_URNA',
        'APTOS', 'COMPARECIMENTO_1T', 'COMPARECIMENTO_2T', 'ABSTENCAO_1T_%', 'ABSTENCAO_2T_%',
        'LULA_13_1T', 'LULA_13_2T', 'DIF_LULA',
        'FLAVIO_22_1T', 'FLAVIO_22_2T', 'DIF_FLAVIO',
        'PCT_LULA_2T_%', 'PCT_FLAVIO_2T_%',
        'FECHAMENTO_BRT', 'TOTAL_VOTOS_APOS_17H', 'LULA_13_APOS_17H', 'FLAVIO_22_APOS_17H',
        'VOTOS_SEM_BIOMETRIA', '100%_BIOMETRIA',
        'MEDIA_ESCOLA_13_%', 'DESVIO_ESCOLA'
      ];
      const lines = [headers.join(';')];
      for (const r of (data.rows || [])) {
        lines.push([
          r.uf, `"${r.municipio}"`, r.zona, r.secao, `"${r.local_votacao}"`, r.modelo_urna,
          r.aptos, r.comparecimento_1t, r.comparecimento, r.taxa_abstencao_1t, r.taxa_abstencao,
          r.votos_cand_1_1t, r.votos_cand_1, r.diff_cand_1,
          r.votos_cand_2_1t, r.votos_cand_2, r.diff_cand_2,
          r.pct_cand_1, r.pct_cand_2,
          r.horario_encerramento_brt, r.votos_apos_17h, r.votos_cand_1_apos_17h, r.votos_cand_2_apos_17h,
          r.votos_sem_biometria, r.apenas_biometria ? 'SIM' : 'NAO',
          r.media_cand_1_escola, r.z_score_escola
        ].join(';'));
      }
      const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'auditoria_tse_2026_apos_17h.csv';
      a.click();
      return;
    }
    const q = buildQueryParams(true);
    window.location.href = `/api/export-csv?${q}`;
  });

  document.getElementById('btnCloseUrnaModal').addEventListener('click', () => {
    document.getElementById('urnaDetailModal').classList.add('hidden');
  });
}

window.addEventListener('DOMContentLoaded', initApp);
