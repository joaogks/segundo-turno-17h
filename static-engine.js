/**
 * Motor Serverless (GitHub Pages) para Auditoria Eleitoral TSE 2026
 * Permite que 100% dos filtros, gráficos, Tabela 1, Tabela 2, Modal de Escola e Exportação CSV
 * funcionem diretamente no GitHub Pages (sem servidor Node.js) usando ./static-data/
 */
(function () {
  const cache = {
    isStaticMode: window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:',
    meta: null,
    municipios: null,
    cube: null,
    globalIndex: null,
    ufData: {}
  };

  function unpackRow(a) {
    return {
      id: a[0], uf: a[1], regiao: a[2], municipio: a[3], zona: a[4], secao: a[5],
      local_votacao: a[6], cod_local: a[7], modelo_urna: a[8],
      aptos: a[9], comparecimento: a[10], abstencoes: a[11], taxa_abstencao: a[12],
      comparecimento_1t: a[13], abstencoes_1t: a[14], taxa_abstencao_1t: a[15], diff_abstencao: a[16],
      votos_nominais: a[17], votos_cand_1: a[18], votos_cand_2: a[19], pct_cand_1: a[20], pct_cand_2: a[21],
      votos_cand_1_1t: a[22], votos_cand_2_1t: a[23], votos_outros_1t: a[24], pct_cand_1_1t: a[25], pct_cand_2_1t: a[26],
      diff_cand_1: a[27], diff_cand_2: a[28], votos_brancos: a[29], votos_nulos: a[30],
      votos_apos_17h: a[31], pct_votos_apos_17h: a[32], horario_encerramento_brt: a[33], segundos_apos_17h: a[34],
      votos_cand_1_apos_17h: a[35], votos_cand_2_apos_17h: a[36],
      votos_sem_biometria: a[37], pct_sem_biometria: a[38], apenas_biometria: a[39],
      media_cand_1_escola: a[40], z_score_escola: a[41], score_anomalia: a[42]
    };
  }

  let dataPrefix = './static-data';

  async function loadJson(relPath) {
    const clean = relPath.replace(/^\.\/static-data/, '');
    let res = await window._nativeFetch(`${dataPrefix}${clean}`);
    if (!res.ok && dataPrefix === './static-data') {
      const altRes = await window._nativeFetch(`./public/static-data${clean}`);
      if (altRes.ok) {
        dataPrefix = './public/static-data';
        return altRes.json();
      }
    }
    if (!res.ok) throw new Error(`Falha ao carregar ${relPath}`);
    return res.json();
  }

  async function ensureMeta() {
    if (!cache.meta) cache.meta = await loadJson('./static-data/meta.json');
    return cache.meta;
  }

  async function ensureMunicipios() {
    if (!cache.municipios) cache.municipios = await loadJson('./static-data/municipios.json');
    return cache.municipios;
  }

  async function ensureCube() {
    if (!cache.cube) cache.cube = await loadJson('./static-data/cube.json');
    return cache.cube;
  }

  async function ensureGlobalIndex() {
    if (!cache.globalIndex) {
      const raw = await loadJson('./static-data/global_index.json');
      cache.globalIndex = raw.map(unpackRow);
    }
    return cache.globalIndex;
  }

  async function ensureUfData(uf) {
    if (!cache.ufData[uf]) {
      const raw = await loadJson(`./static-data/uf/${uf}.json`);
      cache.ufData[uf] = raw.map(unpackRow);
    }
    return cache.ufData[uf];
  }

  function matchCubeRow(r, q) {
    if (q.uf && q.uf !== 'TODAS' && r.uf !== q.uf) return false;
    if (q.modelo_urna && q.modelo_urna !== 'TODOS' && r.modelo_urna !== q.modelo_urna) return false;
    if (q.apenas_biometria === 'true' && r.apenas_biometria !== 1) return false;
    if (q.apenas_biometria === 'sem_bio' && r.apenas_biometria !== 0) return false;

    if (q.corte_horario === 'ate_17h02' && r.band_horario !== 0) return false;
    if (q.corte_horario === 'ate_17h05' && r.band_horario > 1) return false;
    if (q.corte_horario === 'apos_17h02' && r.band_horario < 1) return false;
    if (q.corte_horario === 'apos_17h05' && r.band_horario < 2) return false;
    if (q.corte_horario === 'apos_17h15' && r.band_horario < 3) return false;
    if (q.corte_horario === 'apos_17h30' && r.band_horario < 4) return false;
    if (q.corte_horario === 'apos_18h00' && r.band_horario < 5) return false;

    if (q.filtro_1t === 'cand1_perdeu' && r.f_c1_perdeu !== 1) return false;
    if (q.filtro_1t === 'cand2_perdeu' && r.f_c2_perdeu !== 1) return false;
    if (q.min_z_score && r.f_desvio !== 1) return false;
    if (q.max_abstencao && r.f_abst_baixa !== 1) return false;
    if (q.flag_especifica === 'ALTA_LIBERACAO_SEM_BIO' && r.f_alta_sem_bio !== 1) return false;

    return true;
  }

  function matchSectionRow(r, q) {
    if (q.uf && q.uf !== 'TODAS' && r.uf !== q.uf) return false;
    if (q.municipio && q.municipio !== 'TODOS' && r.municipio !== q.municipio) return false;
    if (q.modelo_urna && q.modelo_urna !== 'TODOS' && r.modelo_urna !== q.modelo_urna) return false;
    if (q.apenas_biometria === 'true' && r.apenas_biometria !== 1) return false;
    if (q.apenas_biometria === 'sem_bio' && r.votos_sem_biometria <= 0) return false;

    if (q.corte_horario === 'ate_17h02' && r.segundos_apos_17h >= 120) return false;
    if (q.corte_horario === 'ate_17h05' && r.segundos_apos_17h >= 300) return false;
    if (q.corte_horario === 'apos_17h02' && r.segundos_apos_17h < 120) return false;
    if (q.corte_horario === 'apos_17h05' && r.segundos_apos_17h < 300) return false;
    if (q.corte_horario === 'apos_17h15' && r.segundos_apos_17h < 900) return false;
    if (q.corte_horario === 'apos_17h30' && r.segundos_apos_17h < 1800) return false;
    if (q.corte_horario === 'apos_18h00' && r.segundos_apos_17h < 3600) return false;

    if (q.filtro_1t === 'cand1_perdeu' && !(r.votos_cand_1_1t > 0 && r.diff_cand_1 < 0)) return false;
    if (q.filtro_1t === 'cand2_perdeu' && !(r.votos_cand_2_1t > 0 && r.diff_cand_2 < 0)) return false;
    if (q.min_z_score && Math.abs(r.z_score_escola) < Number(q.min_z_score)) return false;
    if (q.max_abstencao && r.taxa_abstencao > Number(q.max_abstencao)) return false;
    if (q.flag_especifica === 'ALTA_LIBERACAO_SEM_BIO' && r.pct_sem_biometria < 22) return false;

    if (q.busca && q.busca.trim() !== '') {
      const term = q.busca.trim().toLowerCase();
      const match =
        r.municipio.toLowerCase().includes(term) ||
        r.local_votacao.toLowerCase().includes(term) ||
        String(r.secao).includes(term) ||
        String(r.zona).includes(term);
      if (!match) return false;
    }

    return true;
  }

  function createEmptyAgg(label, uf, regiao) {
    return {
      label, uf, regiao,
      urnas: 0, urnas_apos_17h: 0, urnas_ate_17h: 0,
      aptos: 0, comparecimento: 0, abstencoes: 0,
      aptos_apos_17h: 0, abstencoes_apos_17h: 0,
      aptos_ate_17h: 0, abstencoes_ate_17h: 0,
      comparecimento_1t: 0, abstencoes_1t: 0,
      votos_nominais: 0, votos_cand_1: 0, votos_cand_2: 0,
      votos_brancos: 0, votos_nulos: 0,
      votos_cand_1_1t: 0, votos_cand_2_1t: 0, votos_outros_1t: 0,
      votos_sem_biometria_1t: 0,
      votos_apos_17h: 0, votos_cand_1_apos_17h: 0, votos_cand_2_apos_17h: 0,
      votos_sem_biometria: 0, votos_sem_biometria_apos_17h: 0,
      urnas_100_bio: 0, urnas_100_bio_apos_17h: 0, urnas_100_bio_ate_17h: 0,
      urnas_desvio_escola: 0, urnas_cand1_perdeu: 0, urnas_cand2_perdeu: 0, urnas_abst_baixa: 0,
      qtd_urnas_ate_17h: 0, cand1_urnas_ate_17h: 0, cand2_urnas_ate_17h: 0,
      cand1_urnas_apos_17h: 0, cand2_urnas_apos_17h: 0,
      qtd_urnas_ate_17h05: 0, cand1_urnas_ate_17h05: 0, cand2_urnas_ate_17h05: 0,
      qtd_urnas_apos_17h05: 0, cand1_urnas_apos_17h05: 0, cand2_urnas_apos_17h05: 0,
      qtd_urnas_apos_17h15: 0, cand1_urnas_apos_17h15: 0, cand2_urnas_apos_17h15: 0,
      qtd_urnas_apos_17h30: 0, cand1_urnas_apos_17h30: 0, cand2_urnas_apos_17h30: 0,
      qtd_urnas_apos_18h00: 0, cand1_urnas_apos_18h00: 0, cand2_urnas_apos_18h00: 0
    };
  }

  function accumulateCubeRow(agg, c) {
    const isApos17 = c.band_horario >= 1;
    agg.urnas += c.urnas;
    if (isApos17) {
      agg.urnas_apos_17h += c.urnas;
      agg.aptos_apos_17h += c.aptos;
      agg.abstencoes_apos_17h += c.abstencoes;
      if (c.apenas_biometria === 1) agg.urnas_100_bio_apos_17h += c.urnas;
    } else {
      agg.urnas_ate_17h += c.urnas;
      agg.aptos_ate_17h += c.aptos;
      agg.abstencoes_ate_17h += c.abstencoes;
      if (c.apenas_biometria === 1) agg.urnas_100_bio_ate_17h += c.urnas;
    }

    agg.aptos += c.aptos;
    agg.comparecimento += c.comparecimento;
    agg.abstencoes += c.abstencoes;
    agg.comparecimento_1t += c.comparecimento_1t;
    agg.abstencoes_1t += c.abstencoes_1t;
    agg.votos_nominais += c.votos_nominais;
    agg.votos_cand_1 += c.votos_cand_1;
    agg.votos_cand_2 += c.votos_cand_2;
    agg.votos_brancos += c.votos_brancos;
    agg.votos_nulos += c.votos_nulos;
    agg.votos_cand_1_1t += c.votos_cand_1_1t;
    agg.votos_cand_2_1t += c.votos_cand_2_1t;
    agg.votos_outros_1t += c.votos_outros_1t;
    agg.votos_sem_biometria_1t += c.votos_sem_biometria_1t;
    agg.votos_apos_17h += c.votos_apos_17h;
    agg.votos_cand_1_apos_17h += c.votos_cand_1_apos_17h;
    agg.votos_cand_2_apos_17h += c.votos_cand_2_apos_17h;
    agg.votos_sem_biometria += c.votos_sem_biometria;
    agg.votos_sem_biometria_apos_17h += c.votos_sem_biometria_apos_17h;

    if (c.apenas_biometria === 1) agg.urnas_100_bio += c.urnas;
    if (c.f_desvio === 1) agg.urnas_desvio_escola += c.urnas;
    if (c.f_c1_perdeu === 1) agg.urnas_cand1_perdeu += c.urnas;
    if (c.f_c2_perdeu === 1) agg.urnas_cand2_perdeu += c.urnas;
    if (c.f_abst_baixa === 1) agg.urnas_abst_baixa += c.urnas;

    if (c.band_horario === 0) {
      agg.qtd_urnas_ate_17h += c.urnas;
      agg.cand1_urnas_ate_17h += c.votos_cand_1;
      agg.cand2_urnas_ate_17h += c.votos_cand_2;
    } else {
      agg.cand1_urnas_apos_17h += c.votos_cand_1;
      agg.cand2_urnas_apos_17h += c.votos_cand_2;
    }

    if (c.band_horario <= 1) {
      agg.qtd_urnas_ate_17h05 += c.urnas;
      agg.cand1_urnas_ate_17h05 += c.votos_cand_1;
      agg.cand2_urnas_ate_17h05 += c.votos_cand_2;
    }
    if (c.band_horario >= 2) {
      agg.qtd_urnas_apos_17h05 += c.urnas;
      agg.cand1_urnas_apos_17h05 += c.votos_cand_1;
      agg.cand2_urnas_apos_17h05 += c.votos_cand_2;
    }
    if (c.band_horario >= 3) {
      agg.qtd_urnas_apos_17h15 += c.urnas;
      agg.cand1_urnas_apos_17h15 += c.votos_cand_1;
      agg.cand2_urnas_apos_17h15 += c.votos_cand_2;
    }
    if (c.band_horario >= 4) {
      agg.qtd_urnas_apos_17h30 += c.urnas;
      agg.cand1_urnas_apos_17h30 += c.votos_cand_1;
      agg.cand2_urnas_apos_17h30 += c.votos_cand_2;
    }
    if (c.band_horario >= 5) {
      agg.qtd_urnas_apos_18h00 += c.urnas;
      agg.cand1_urnas_apos_18h00 += c.votos_cand_1;
      agg.cand2_urnas_apos_18h00 += c.votos_cand_2;
    }
  }

  function finalizeAggRow(g) {
    const round2 = (v) => Number(v.toFixed(2));
    return {
      ...g,
      taxa_abstencao: g.aptos > 0 ? round2((g.abstencoes * 100) / g.aptos) : 0,
      taxa_abstencao_apos_17h: g.aptos_apos_17h > 0 ? round2((g.abstencoes_apos_17h * 100) / g.aptos_apos_17h) : 0,
      taxa_abstencao_ate_17h: g.aptos_ate_17h > 0 ? round2((g.abstencoes_ate_17h * 100) / g.aptos_ate_17h) : 0,
      taxa_abstencao_1t: g.aptos > 0 ? round2((g.abstencoes_1t * 100) / g.aptos) : 0,
      diff_cand_1: g.votos_cand_1 - g.votos_cand_1_1t,
      diff_cand_2: g.votos_cand_2 - g.votos_cand_2_1t,
      pct_cand_1: g.votos_nominais > 0 ? round2((g.votos_cand_1 * 100) / g.votos_nominais) : 0,
      pct_cand_2: g.votos_nominais > 0 ? round2((g.votos_cand_2 * 100) / g.votos_nominais) : 0,
      pct_cand_1_apos_17h: (g.votos_cand_1_apos_17h + g.votos_cand_2_apos_17h) > 0
        ? round2((g.votos_cand_1_apos_17h * 100) / (g.votos_cand_1_apos_17h + g.votos_cand_2_apos_17h)) : 0,
      pct_cand_2_apos_17h: (g.votos_cand_1_apos_17h + g.votos_cand_2_apos_17h) > 0
        ? round2((g.votos_cand_2_apos_17h * 100) / (g.votos_cand_1_apos_17h + g.votos_cand_2_apos_17h)) : 0,
      pct_apos_17h: g.comparecimento > 0 ? round2((g.votos_apos_17h * 100) / g.comparecimento) : 0,
      pct_sem_biometria: g.comparecimento > 0 ? round2((g.votos_sem_biometria * 100) / g.comparecimento) : 0,
      pct_sem_biometria_apos_17h: g.votos_apos_17h > 0 ? round2((g.votos_sem_biometria_apos_17h * 100) / g.votos_apos_17h) : 0
    };
  }

  async function computeStaticDashboard(q) {
    const isSpecificUf = q.uf && q.uf !== 'TODAS';
    const hasTextOrMunFilter = isSpecificUf || (q.municipio && q.municipio !== 'TODOS') || (q.busca && q.busca.trim() !== '');

    const totalAgg = createEmptyAgg('BRASIL', 'TODAS', 'TODAS');
    const locMap = new Map();
    const modMap = new Map();

    if (hasTextOrMunFilter && isSpecificUf) {
      const rows = await ensureUfData(q.uf);
      for (const r of rows) {
        if (!matchSectionRow(r, q)) continue;
        const band = r.segundos_apos_17h < 120 ? 0
          : r.segundos_apos_17h < 300 ? 1
          : r.segundos_apos_17h < 900 ? 2
          : r.segundos_apos_17h < 1800 ? 3
          : r.segundos_apos_17h < 3600 ? 4 : 5;
        const pseudoCube = {
          uf: r.uf, regiao: r.regiao, modelo_urna: r.modelo_urna, apenas_biometria: r.apenas_biometria,
          band_horario: band,
          f_c1_perdeu: (r.votos_cand_1_1t > 0 && r.diff_cand_1 < 0) ? 1 : 0,
          f_c2_perdeu: (r.votos_cand_2_1t > 0 && r.diff_cand_2 < 0) ? 1 : 0,
          f_desvio: Math.abs(r.z_score_escola) >= 2.5 ? 1 : 0,
          f_abst_baixa: r.taxa_abstencao <= 3.0 ? 1 : 0,
          f_alta_sem_bio: r.pct_sem_biometria >= 22 ? 1 : 0,
          urnas: 1, aptos: r.aptos, comparecimento: r.comparecimento, abstencoes: r.abstencoes,
          votos_nominais: r.votos_nominais, votos_cand_1: r.votos_cand_1, votos_cand_2: r.votos_cand_2,
          votos_brancos: r.votos_brancos, votos_nulos: r.votos_nulos,
          comparecimento_1t: r.comparecimento_1t, abstencoes_1t: r.abstencoes_1t,
          votos_cand_1_1t: r.votos_cand_1_1t, votos_cand_2_1t: r.votos_cand_2_1t, votos_outros_1t: r.votos_outros_1t,
          votos_sem_biometria_1t: 0,
          votos_apos_17h: r.votos_apos_17h, votos_cand_1_apos_17h: r.votos_cand_1_apos_17h, votos_cand_2_apos_17h: r.votos_cand_2_apos_17h,
          votos_sem_biometria: r.votos_sem_biometria,
          votos_sem_biometria_apos_17h: r.votos_apos_17h > 0 ? Math.round(r.votos_sem_biometria * (r.votos_apos_17h / Math.max(1, r.comparecimento))) : 0
        };
        accumulateCubeRow(totalAgg, pseudoCube);

        if (!locMap.has(r.municipio)) locMap.set(r.municipio, createEmptyAgg(r.municipio, r.uf, r.regiao));
        accumulateCubeRow(locMap.get(r.municipio), pseudoCube);

        if (!modMap.has(r.modelo_urna)) modMap.set(r.modelo_urna, createEmptyAgg(r.modelo_urna, r.uf, r.regiao));
        accumulateCubeRow(modMap.get(r.modelo_urna), pseudoCube);
      }
    } else {
      const cube = await ensureCube();
      for (const c of cube) {
        if (!matchCubeRow(c, q)) continue;
        accumulateCubeRow(totalAgg, c);

        if (!locMap.has(c.uf)) locMap.set(c.uf, createEmptyAgg(c.uf, c.uf, c.regiao));
        accumulateCubeRow(locMap.get(c.uf), c);

        if (!modMap.has(c.modelo_urna)) modMap.set(c.modelo_urna, createEmptyAgg(c.modelo_urna, c.uf, c.regiao));
        accumulateCubeRow(modMap.get(c.modelo_urna), c);
      }
    }

    const k = finalizeAggRow(totalAgg);
    const nominais_1t = k.votos_cand_1_1t + k.votos_cand_2_1t + k.votos_outros_1t;
    const votos_cand_1_antes_17h = Math.max(0, k.votos_cand_1 - k.votos_cand_1_apos_17h);
    const votos_cand_2_antes_17h = Math.max(0, k.votos_cand_2 - k.votos_cand_2_apos_17h);
    const nominais_antes_17h = votos_cand_1_antes_17h + votos_cand_2_antes_17h;
    const votos_sem_biometria_ate_17h = Math.max(0, k.votos_sem_biometria - k.votos_sem_biometria_apos_17h);
    const comp_ate_17h = Math.max(1, k.comparecimento - k.votos_apos_17h);

    const kpis = {
      ...k,
      total_urnas: k.urnas,
      urnas_com_apos_17h: k.urnas_apos_17h,
      urnas_100_biometria: k.urnas_100_bio,
      pct_cand_1_1t: nominais_1t > 0 ? Number(((k.votos_cand_1_1t * 100) / nominais_1t).toFixed(2)) : 0,
      pct_cand_2_1t: nominais_1t > 0 ? Number(((k.votos_cand_2_1t * 100) / nominais_1t).toFixed(2)) : 0,
      votos_cand_1_antes_17h,
      votos_cand_2_antes_17h,
      pct_cand_1_antes_17h: nominais_antes_17h > 0 ? Number(((votos_cand_1_antes_17h * 100) / nominais_antes_17h).toFixed(2)) : 0,
      pct_cand_2_antes_17h: nominais_antes_17h > 0 ? Number(((votos_cand_2_antes_17h * 100) / nominais_antes_17h).toFixed(2)) : 0,
      votos_sem_biometria_ate_17h,
      pct_sem_biometria_ate_17h: Number(((votos_sem_biometria_ate_17h * 100) / comp_ate_17h).toFixed(2))
    };

    const groupType = isSpecificUf ? 'municipio' : 'uf';
    const porLocalidade = Array.from(locMap.values())
      .map(finalizeAggRow)
      .sort((a, b) => groupType === 'uf' ? a.label.localeCompare(b.label) : b.comparecimento - a.comparecimento)
      .slice(0, 60);

    const porModeloUrna = Array.from(modMap.values())
      .map(g => ({ ...finalizeAggRow(g), modelo_urna: g.label }))
      .sort((a, b) => a.modelo_urna.localeCompare(b.modelo_urna));

    return { kpis, groupType, porLocalidade, porModeloUrna };
  }

  async function computeStaticUrnas(q) {
    const page = Math.max(1, parseInt(q.page || '1', 10));
    const pageSize = Math.min(200, Math.max(10, parseInt(q.pageSize || '30', 10)));
    const sortBy = q.sortBy || 'votos_apos_17h';
    const sortDir = (q.sortDir && q.sortDir.toUpperCase() === 'ASC') ? 1 : -1;
    const agruparPorUf = q.agruparPorUf === 'true';

    let sourceRows = [];
    let exactTotal = 0;

    if (q.uf && q.uf !== 'TODAS') {
      const ufRows = await ensureUfData(q.uf);
      sourceRows = ufRows.filter(r => matchSectionRow(r, q));
      exactTotal = sourceRows.length;
    } else {
      const globalRows = await ensureGlobalIndex();
      sourceRows = globalRows.filter(r => matchSectionRow(r, q));
      // Calcula o total exato via cubo se não houver busca textual
      if (!q.busca || q.busca.trim() === '') {
        const cube = await ensureCube();
        exactTotal = cube.filter(c => matchCubeRow(c, q)).reduce((acc, c) => acc + c.urnas, 0);
      } else {
        exactTotal = sourceRows.length;
      }
    }

    sourceRows.sort((a, b) => {
      if (agruparPorUf && a.uf !== b.uf) {
        return a.uf.localeCompare(b.uf);
      }
      const va = a[sortBy];
      const vb = b[sortBy];
      if (typeof va === 'string' || typeof vb === 'string') {
        const cmp = String(va || '').localeCompare(String(vb || ''), 'pt-BR');
        if (cmp !== 0) return cmp * sortDir;
      } else {
        const diff = (Number(va || 0) - Number(vb || 0)) * sortDir;
        if (diff !== 0) return diff;
      }
      return a.id - b.id;
    });

    const offset = (page - 1) * pageSize;
    const rows = sourceRows.slice(offset, offset + pageSize);

    return {
      total: exactTotal,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(exactTotal / pageSize)),
      rows
    };
  }

  async function computeStaticUrnaDetail(id) {
    const numId = Number(id);
    // Procura primeiro nos UFs já carregados ou no globalIndex
    let target = null;
    for (const uf of Object.keys(cache.ufData)) {
      target = cache.ufData[uf].find(r => r.id === numId);
      if (target) break;
    }
    if (!target) {
      const g = await ensureGlobalIndex();
      target = g.find(r => r.id === numId);
    }
    if (!target) throw new Error('Urna não encontrada');

    const ufRows = await ensureUfData(target.uf);
    const vizinhasEscola = ufRows
      .filter(r => r.cod_local === target.cod_local && r.municipio === target.municipio)
      .sort((a, b) => a.secao - b.secao);

    return { urna: target, vizinhasEscola };
  }

  function mockJsonResponse(data) {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  window._nativeFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const urlStr = typeof input === 'string' ? input : input.url;

    if (!cache.isStaticMode && urlStr.startsWith('/api/')) {
      try {
        const res = await window._nativeFetch(input, init);
        if (res.ok) return res;
        cache.isStaticMode = true;
      } catch (_) {
        cache.isStaticMode = true;
      }
    }

    if (cache.isStaticMode && (urlStr.startsWith('/api/') || urlStr.includes('/api/'))) {
      const parsed = new URL(urlStr, window.location.origin);
      const pathname = parsed.pathname;
      const q = Object.fromEntries(parsed.searchParams.entries());

      if (pathname.endsWith('/api/meta')) {
        return mockJsonResponse(await ensureMeta());
      }
      if (pathname.endsWith('/api/municipios')) {
        const mMap = await ensureMunicipios();
        return mockJsonResponse({ municipios: mMap[q.uf] || [] });
      }
      if (pathname.endsWith('/api/dashboard')) {
        return mockJsonResponse(await computeStaticDashboard(q));
      }
      if (pathname.endsWith('/api/urnas')) {
        return mockJsonResponse(await computeStaticUrnas(q));
      }
      if (pathname.includes('/api/urna/')) {
        const id = pathname.split('/').pop();
        return mockJsonResponse(await computeStaticUrnaDetail(id));
      }
    }

    return window._nativeFetch(input, init);
  };
})();
