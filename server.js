const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { getDb, buildWhereClause } = require('./src/db');
const { parseTseLogText } = require('./scripts/tse_etl');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const db = getDb();

const ALLOWED_SORT_COLUMNS = new Set([
  'id', 'uf', 'municipio', 'zona', 'secao', 'modelo_urna',
  'aptos', 'comparecimento', 'abstencoes', 'taxa_abstencao',
  'votos_nominais', 'votos_cand_1', 'votos_cand_2', 'pct_cand_1', 'pct_cand_2',
  'votos_cand_1_1t', 'votos_cand_2_1t', 'votos_outros_1t', 'diff_cand_1', 'diff_cand_2',
  'taxa_abstencao_1t', 'diff_abstencao',
  'votos_apos_17h', 'pct_votos_apos_17h', 'segundos_apos_17h',
  'votos_cand_1_apos_17h', 'votos_cand_2_apos_17h',
  'votos_sem_biometria', 'pct_sem_biometria',
  'tempo_medio_voto_seg', 'z_score_escola', 'score_anomalia'
]);

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

function handleApiMeta(req, res) {
  const ufs = db.prepare(`
    SELECT uf, regiao, COUNT(*) as urnas
    FROM urnas
    GROUP BY uf, regiao
    ORDER BY uf ASC
  `).all();

  const modelos = db.prepare('SELECT DISTINCT modelo_urna FROM urnas ORDER BY modelo_urna ASC').all().map(r => r.modelo_urna);

  sendJson(res, 200, { ufs, modelos });
}

function handleApiMunicipios(req, res, queryObj) {
  const uf = queryObj.uf;
  if (!uf || uf === 'TODAS') {
    return sendJson(res, 200, { municipios: [] });
  }
  const municipios = db.prepare('SELECT DISTINCT municipio FROM urnas WHERE uf = ? ORDER BY municipio ASC').all(uf).map(r => r.municipio);
  sendJson(res, 200, { municipios });
}

function handleApiDashboard(req, res, queryObj) {
  const { whereSQL, params } = buildWhereClause(queryObj);

  // 1. KPIs Gerais + Total Depois das 17h detalhado por Candidato
  const kpiRow = db.prepare(`
    SELECT
      COUNT(*) as total_urnas,
      COALESCE(SUM(aptos), 0) as aptos,
      COALESCE(SUM(comparecimento), 0) as comparecimento,
      COALESCE(SUM(abstencoes), 0) as abstencoes,
      COALESCE(SUM(votos_nominais), 0) as votos_nominais,
      COALESCE(SUM(votos_cand_1), 0) as votos_cand_1,
      COALESCE(SUM(votos_cand_2), 0) as votos_cand_2,
      COALESCE(SUM(votos_brancos), 0) as votos_brancos,
      COALESCE(SUM(votos_nulos), 0) as votos_nulos,
      COALESCE(SUM(comparecimento_1t), 0) as comparecimento_1t,
      COALESCE(SUM(abstencoes_1t), 0) as abstencoes_1t,
      COALESCE(SUM(votos_cand_1_1t), 0) as votos_cand_1_1t,
      COALESCE(SUM(votos_cand_2_1t), 0) as votos_cand_2_1t,
      COALESCE(SUM(votos_outros_1t), 0) as votos_outros_1t,
      COALESCE(SUM(votos_sem_biometria_1t), 0) as votos_sem_biometria_1t,

      -- Métricas Estritas dos Votos Computados DEPOIS das 17h00
      COALESCE(SUM(votos_apos_17h), 0) as votos_apos_17h,
      COALESCE(SUM(votos_cand_1_apos_17h), 0) as votos_cand_1_apos_17h,
      COALESCE(SUM(votos_cand_2_apos_17h), 0) as votos_cand_2_apos_17h,
      COALESCE(SUM(CASE WHEN votos_apos_17h > 0 THEN 1 ELSE 0 END), 0) as urnas_com_apos_17h,

      -- Total das Urnas por Faixa de Horário de Encerramento (Horário de Brasília)
      COALESCE(SUM(CASE WHEN segundos_apos_17h < 120 THEN 1 ELSE 0 END), 0) as qtd_urnas_ate_17h,
      COALESCE(SUM(CASE WHEN segundos_apos_17h < 120 THEN votos_cand_1 ELSE 0 END), 0) as cand1_urnas_ate_17h,
      COALESCE(SUM(CASE WHEN segundos_apos_17h < 120 THEN votos_cand_2 ELSE 0 END), 0) as cand2_urnas_ate_17h,
      COALESCE(SUM(CASE WHEN segundos_apos_17h >= 120 THEN votos_cand_1 ELSE 0 END), 0) as cand1_urnas_apos_17h,
      COALESCE(SUM(CASE WHEN segundos_apos_17h >= 120 THEN votos_cand_2 ELSE 0 END), 0) as cand2_urnas_apos_17h,

      COALESCE(SUM(CASE WHEN segundos_apos_17h < 300 THEN 1 ELSE 0 END), 0) as qtd_urnas_ate_17h05,
      COALESCE(SUM(CASE WHEN segundos_apos_17h < 300 THEN votos_cand_1 ELSE 0 END), 0) as cand1_urnas_ate_17h05,
      COALESCE(SUM(CASE WHEN segundos_apos_17h < 300 THEN votos_cand_2 ELSE 0 END), 0) as cand2_urnas_ate_17h05,

      COALESCE(SUM(CASE WHEN segundos_apos_17h >= 300 THEN 1 ELSE 0 END), 0) as qtd_urnas_apos_17h05,
      COALESCE(SUM(CASE WHEN segundos_apos_17h >= 300 THEN votos_cand_1 ELSE 0 END), 0) as cand1_urnas_apos_17h05,
      COALESCE(SUM(CASE WHEN segundos_apos_17h >= 300 THEN votos_cand_2 ELSE 0 END), 0) as cand2_urnas_apos_17h05,

      COALESCE(SUM(CASE WHEN segundos_apos_17h >= 900 THEN 1 ELSE 0 END), 0) as qtd_urnas_apos_17h15,
      COALESCE(SUM(CASE WHEN segundos_apos_17h >= 900 THEN votos_cand_1 ELSE 0 END), 0) as cand1_urnas_apos_17h15,
      COALESCE(SUM(CASE WHEN segundos_apos_17h >= 900 THEN votos_cand_2 ELSE 0 END), 0) as cand2_urnas_apos_17h15,

      COALESCE(SUM(CASE WHEN segundos_apos_17h >= 1800 THEN 1 ELSE 0 END), 0) as qtd_urnas_apos_17h30,
      COALESCE(SUM(CASE WHEN segundos_apos_17h >= 1800 THEN votos_cand_1 ELSE 0 END), 0) as cand1_urnas_apos_17h30,
      COALESCE(SUM(CASE WHEN segundos_apos_17h >= 1800 THEN votos_cand_2 ELSE 0 END), 0) as cand2_urnas_apos_17h30,

      COALESCE(SUM(CASE WHEN segundos_apos_17h >= 3600 THEN 1 ELSE 0 END), 0) as qtd_urnas_apos_18h00,
      COALESCE(SUM(CASE WHEN segundos_apos_17h >= 3600 THEN votos_cand_1 ELSE 0 END), 0) as cand1_urnas_apos_18h00,
      COALESCE(SUM(CASE WHEN segundos_apos_17h >= 3600 THEN votos_cand_2 ELSE 0 END), 0) as cand2_urnas_apos_18h00,

      COALESCE(SUM(votos_sem_biometria), 0) as votos_sem_biometria,
      COALESCE(SUM(CASE WHEN apenas_biometria = 1 THEN 1 ELSE 0 END), 0) as urnas_100_biometria,

      -- Métricas de Abstenção e Biometria separadas para o Período APÓS 17h00 vs ATÉ 17h00
      COALESCE(SUM(CASE WHEN votos_apos_17h > 0 THEN aptos ELSE 0 END), 0) as aptos_apos_17h,
      COALESCE(SUM(CASE WHEN votos_apos_17h > 0 THEN abstencoes ELSE 0 END), 0) as abstencoes_apos_17h,
      COALESCE(SUM(CASE WHEN votos_apos_17h > 0 AND apenas_biometria = 1 THEN 1 ELSE 0 END), 0) as urnas_100_bio_apos_17h,
      COALESCE(SUM(CASE WHEN votos_apos_17h > 0 THEN CAST(ROUND(votos_sem_biometria * (CAST(votos_apos_17h AS REAL) / MAX(1, comparecimento))) AS INTEGER) ELSE 0 END), 0) as votos_sem_biometria_apos_17h,

      COALESCE(SUM(CASE WHEN votos_apos_17h = 0 THEN aptos ELSE 0 END), 0) as aptos_ate_17h,
      COALESCE(SUM(CASE WHEN votos_apos_17h = 0 THEN abstencoes ELSE 0 END), 0) as abstencoes_ate_17h,
      COALESCE(SUM(CASE WHEN votos_apos_17h = 0 AND apenas_biometria = 1 THEN 1 ELSE 0 END), 0) as urnas_100_bio_ate_17h,

      COALESCE(SUM(CASE WHEN ABS(z_score_escola) >= 2.5 THEN 1 ELSE 0 END), 0) as urnas_desvio_escola,
      COALESCE(SUM(CASE WHEN votos_cand_1_1t > 0 AND diff_cand_1 < 0 THEN 1 ELSE 0 END), 0) as urnas_cand1_perdeu,
      COALESCE(SUM(CASE WHEN votos_cand_2_1t > 0 AND diff_cand_2 < 0 THEN 1 ELSE 0 END), 0) as urnas_cand2_perdeu,
      COALESCE(SUM(CASE WHEN taxa_abstencao <= 3.0 THEN 1 ELSE 0 END), 0) as urnas_abst_baixa
    FROM urnas
    ${whereSQL}
  `).get(...params);

  const pct_cand_1 = kpiRow.votos_nominais > 0 ? Number(((kpiRow.votos_cand_1 / kpiRow.votos_nominais) * 100).toFixed(2)) : 0;
  const pct_cand_2 = kpiRow.votos_nominais > 0 ? Number(((kpiRow.votos_cand_2 / kpiRow.votos_nominais) * 100).toFixed(2)) : 0;
  const nominais_1t = kpiRow.votos_cand_1_1t + kpiRow.votos_cand_2_1t + kpiRow.votos_outros_1t;
  const pct_cand_1_1t = nominais_1t > 0 ? Number(((kpiRow.votos_cand_1_1t / nominais_1t) * 100).toFixed(2)) : 0;
  const pct_cand_2_1t = nominais_1t > 0 ? Number(((kpiRow.votos_cand_2_1t / nominais_1t) * 100).toFixed(2)) : 0;

  // Votos ANTES das 17h00 vs DEPOIS das 17h00
  const votos_cand_1_antes_17h = Math.max(0, kpiRow.votos_cand_1 - kpiRow.votos_cand_1_apos_17h);
  const votos_cand_2_antes_17h = Math.max(0, kpiRow.votos_cand_2 - kpiRow.votos_cand_2_apos_17h);
  const nominais_antes_17h = votos_cand_1_antes_17h + votos_cand_2_antes_17h;
  const pct_cand_1_antes_17h = nominais_antes_17h > 0 ? Number(((votos_cand_1_antes_17h / nominais_antes_17h) * 100).toFixed(2)) : 0;
  const pct_cand_2_antes_17h = nominais_antes_17h > 0 ? Number(((votos_cand_2_antes_17h / nominais_antes_17h) * 100).toFixed(2)) : 0;

  const nominais_apos_17h = kpiRow.votos_cand_1_apos_17h + kpiRow.votos_cand_2_apos_17h;
  const pct_cand_1_apos_17h = nominais_apos_17h > 0 ? Number(((kpiRow.votos_cand_1_apos_17h / nominais_apos_17h) * 100).toFixed(2)) : 0;
  const pct_cand_2_apos_17h = nominais_apos_17h > 0 ? Number(((kpiRow.votos_cand_2_apos_17h / nominais_apos_17h) * 100).toFixed(2)) : 0;

  // Placar total das Urnas que fecharam ATÉ 17h02 vs Urnas que fecharam APÓS 17h02
  const totUrnasAte17 = kpiRow.cand1_urnas_ate_17h + kpiRow.cand2_urnas_ate_17h;
  const pct_cand1_urnas_ate_17h = totUrnasAte17 > 0 ? Number(((kpiRow.cand1_urnas_ate_17h / totUrnasAte17) * 100).toFixed(2)) : 0;
  const pct_cand2_urnas_ate_17h = totUrnasAte17 > 0 ? Number(((kpiRow.cand2_urnas_ate_17h / totUrnasAte17) * 100).toFixed(2)) : 0;

  const totUrnasApos17 = kpiRow.cand1_urnas_apos_17h + kpiRow.cand2_urnas_apos_17h;
  const pct_cand1_urnas_apos_17h = totUrnasApos17 > 0 ? Number(((kpiRow.cand1_urnas_apos_17h / totUrnasApos17) * 100).toFixed(2)) : 0;
  const pct_cand2_urnas_apos_17h = totUrnasApos17 > 0 ? Number(((kpiRow.cand2_urnas_apos_17h / totUrnasApos17) * 100).toFixed(2)) : 0;

  const taxa_abstencao = kpiRow.aptos > 0 ? Number(((kpiRow.abstencoes / kpiRow.aptos) * 100).toFixed(2)) : 0;
  const taxa_abstencao_1t = kpiRow.aptos > 0 ? Number(((kpiRow.abstencoes_1t / kpiRow.aptos) * 100).toFixed(2)) : 0;
  const pct_apos_17h = kpiRow.comparecimento > 0 ? Number(((kpiRow.votos_apos_17h / kpiRow.comparecimento) * 100).toFixed(2)) : 0;
  const pct_sem_biometria = kpiRow.comparecimento > 0 ? Number(((kpiRow.votos_sem_biometria / kpiRow.comparecimento) * 100).toFixed(2)) : 0;

  const taxa_abstencao_apos_17h = kpiRow.aptos_apos_17h > 0 ? Number(((kpiRow.abstencoes_apos_17h / kpiRow.aptos_apos_17h) * 100).toFixed(2)) : 0;
  const taxa_abstencao_ate_17h = kpiRow.aptos_ate_17h > 0 ? Number(((kpiRow.abstencoes_ate_17h / kpiRow.aptos_ate_17h) * 100).toFixed(2)) : 0;
  const votos_sem_biometria_ate_17h = Math.max(0, kpiRow.votos_sem_biometria - kpiRow.votos_sem_biometria_apos_17h);
  const comparecimento_ate_17h = Math.max(1, kpiRow.comparecimento - kpiRow.votos_apos_17h);
  const pct_sem_biometria_apos_17h = kpiRow.votos_apos_17h > 0 ? Number(((kpiRow.votos_sem_biometria_apos_17h / kpiRow.votos_apos_17h) * 100).toFixed(2)) : 0;
  const pct_sem_biometria_ate_17h = Number(((votos_sem_biometria_ate_17h / comparecimento_ate_17h) * 100).toFixed(2));

  // 2. Resumo por Estado (UF) ou Município incluindo Votos, Abstenção e Biometria por Período (Total, Até 17h e Após 17h)
  const groupCol = (queryObj.uf && queryObj.uf !== 'TODAS') ? 'municipio' : 'uf';
  const porLocalidade = db.prepare(`
    SELECT
      ${groupCol} as label,
      uf,
      regiao,
      COUNT(*) as urnas,
      SUM(CASE WHEN votos_apos_17h > 0 THEN 1 ELSE 0 END) as urnas_apos_17h,
      SUM(CASE WHEN votos_apos_17h = 0 THEN 1 ELSE 0 END) as urnas_ate_17h,
      SUM(aptos) as aptos,
      SUM(comparecimento) as comparecimento,
      SUM(abstencoes) as abstencoes,
      ROUND(CAST(SUM(abstencoes) AS REAL) * 100.0 / MAX(1, SUM(aptos)), 2) as taxa_abstencao,
      SUM(CASE WHEN votos_apos_17h > 0 THEN abstencoes ELSE 0 END) as abstencoes_apos_17h,
      ROUND(CAST(SUM(CASE WHEN votos_apos_17h > 0 THEN abstencoes ELSE 0 END) AS REAL) * 100.0 / MAX(1, SUM(CASE WHEN votos_apos_17h > 0 THEN aptos ELSE 0 END)), 2) as taxa_abstencao_apos_17h,
      SUM(CASE WHEN votos_apos_17h = 0 THEN abstencoes ELSE 0 END) as abstencoes_ate_17h,
      ROUND(CAST(SUM(CASE WHEN votos_apos_17h = 0 THEN abstencoes ELSE 0 END) AS REAL) * 100.0 / MAX(1, SUM(CASE WHEN votos_apos_17h = 0 THEN aptos ELSE 0 END)), 2) as taxa_abstencao_ate_17h,
      SUM(comparecimento_1t) as comparecimento_1t,
      SUM(abstencoes_1t) as abstencoes_1t,
      ROUND(CAST(SUM(abstencoes_1t) AS REAL) * 100.0 / MAX(1, SUM(aptos)), 2) as taxa_abstencao_1t,
      SUM(votos_cand_1_1t) as votos_cand_1_1t,
      SUM(votos_cand_2_1t) as votos_cand_2_1t,
      SUM(votos_outros_1t) as votos_outros_1t,
      SUM(votos_cand_1) as votos_cand_1,
      SUM(votos_cand_2) as votos_cand_2,
      SUM(votos_cand_1 - votos_cand_1_1t) as diff_cand_1,
      SUM(votos_cand_2 - votos_cand_2_1t) as diff_cand_2,
      ROUND(CAST(SUM(votos_cand_1) AS REAL) * 100.0 / MAX(1, SUM(votos_nominais)), 2) as pct_cand_1,
      ROUND(CAST(SUM(votos_cand_2) AS REAL) * 100.0 / MAX(1, SUM(votos_nominais)), 2) as pct_cand_2,
      SUM(votos_apos_17h) as votos_apos_17h,
      SUM(votos_cand_1_apos_17h) as votos_cand_1_apos_17h,
      SUM(votos_cand_2_apos_17h) as votos_cand_2_apos_17h,
      ROUND(CAST(SUM(votos_cand_1_apos_17h) AS REAL) * 100.0 / MAX(1, SUM(votos_cand_1_apos_17h + votos_cand_2_apos_17h)), 2) as pct_cand_1_apos_17h,
      ROUND(CAST(SUM(votos_cand_2_apos_17h) AS REAL) * 100.0 / MAX(1, SUM(votos_cand_1_apos_17h + votos_cand_2_apos_17h)), 2) as pct_cand_2_apos_17h,
      ROUND(CAST(SUM(votos_apos_17h) AS REAL) * 100.0 / MAX(1, SUM(comparecimento)), 2) as pct_apos_17h,
      SUM(votos_sem_biometria) as votos_sem_biometria,
      ROUND(CAST(SUM(votos_sem_biometria) AS REAL) * 100.0 / MAX(1, SUM(comparecimento)), 2) as pct_sem_biometria,
      SUM(CASE WHEN apenas_biometria = 1 THEN 1 ELSE 0 END) as urnas_100_bio,
      SUM(CASE WHEN votos_apos_17h > 0 AND apenas_biometria = 1 THEN 1 ELSE 0 END) as urnas_100_bio_apos_17h,
      SUM(CASE WHEN votos_apos_17h = 0 AND apenas_biometria = 1 THEN 1 ELSE 0 END) as urnas_100_bio_ate_17h,
      SUM(CASE WHEN votos_apos_17h > 0 THEN CAST(ROUND(votos_sem_biometria * (CAST(votos_apos_17h AS REAL) / MAX(1, comparecimento))) AS INTEGER) ELSE 0 END) as votos_sem_biometria_apos_17h,
      ROUND(CAST(SUM(CASE WHEN votos_apos_17h > 0 THEN CAST(ROUND(votos_sem_biometria * (CAST(votos_apos_17h AS REAL) / MAX(1, comparecimento))) AS INTEGER) ELSE 0 END) AS REAL) * 100.0 / MAX(1, SUM(votos_apos_17h)), 2) as pct_sem_biometria_apos_17h
    FROM urnas
    ${whereSQL}
    GROUP BY ${groupCol}
    ORDER BY ${groupCol === 'uf' ? 'uf ASC' : 'SUM(comparecimento) DESC'}
    LIMIT 60
  `).all(...params);

  // 3. Por Modelo de Urna
  const porModeloUrna = db.prepare(`
    SELECT
      modelo_urna,
      COUNT(*) as urnas,
      SUM(comparecimento) as comparecimento,
      SUM(votos_cand_1_1t) as votos_cand_1_1t,
      SUM(votos_cand_2_1t) as votos_cand_2_1t,
      SUM(votos_cand_1) as votos_cand_1,
      SUM(votos_cand_2) as votos_cand_2,
      SUM(votos_apos_17h) as votos_apos_17h,
      SUM(votos_cand_1_apos_17h) as votos_cand_1_apos_17h,
      SUM(votos_cand_2_apos_17h) as votos_cand_2_apos_17h,
      ROUND(CAST(SUM(votos_cand_1) AS REAL) * 100.0 / MAX(1, SUM(votos_nominais)), 2) as pct_cand_1,
      ROUND(CAST(SUM(votos_cand_2) AS REAL) * 100.0 / MAX(1, SUM(votos_nominais)), 2) as pct_cand_2,
      ROUND(CAST(SUM(abstencoes) AS REAL) * 100.0 / MAX(1, SUM(aptos)), 2) as taxa_abstencao,
      ROUND(CAST(SUM(votos_sem_biometria) AS REAL) * 100.0 / MAX(1, SUM(comparecimento)), 2) as pct_sem_biometria,
      SUM(CASE WHEN apenas_biometria = 1 THEN 1 ELSE 0 END) as urnas_100_bio
    FROM urnas
    ${whereSQL}
    GROUP BY modelo_urna
    ORDER BY modelo_urna ASC
  `).all(...params);

  sendJson(res, 200, {
    kpis: {
      ...kpiRow,
      pct_cand_1,
      pct_cand_2,
      pct_cand_1_1t,
      pct_cand_2_1t,
      diff_cand_1: kpiRow.votos_cand_1 - kpiRow.votos_cand_1_1t,
      diff_cand_2: kpiRow.votos_cand_2 - kpiRow.votos_cand_2_1t,
      votos_cand_1_antes_17h,
      votos_cand_2_antes_17h,
      pct_cand_1_antes_17h,
      pct_cand_2_antes_17h,
      pct_cand_1_apos_17h,
      pct_cand_2_apos_17h,
      pct_cand1_urnas_ate_17h,
      pct_cand2_urnas_ate_17h,
      pct_cand1_urnas_apos_17h,
      pct_cand2_urnas_apos_17h,
      taxa_abstencao,
      taxa_abstencao_1t,
      taxa_abstencao_apos_17h,
      taxa_abstencao_ate_17h,
      diff_abstencao: Number((taxa_abstencao - taxa_abstencao_1t).toFixed(2)),
      pct_apos_17h,
      pct_sem_biometria,
      votos_sem_biometria_ate_17h,
      pct_sem_biometria_apos_17h,
      pct_sem_biometria_ate_17h
    },
    groupType: groupCol,
    porLocalidade,
    porModeloUrna
  });
}

function handleApiUrnas(req, res, queryObj) {
  const { whereSQL, params } = buildWhereClause(queryObj);
  const page = Math.max(1, parseInt(queryObj.page || '1', 10));
  const pageSize = Math.min(200, Math.max(10, parseInt(queryObj.pageSize || '30', 10)));
  const offset = (page - 1) * pageSize;

  const sortBy = ALLOWED_SORT_COLUMNS.has(queryObj.sortBy) ? queryObj.sortBy : 'votos_apos_17h';
  const sortDir = (queryObj.sortDir && queryObj.sortDir.toUpperCase() === 'ASC') ? 'ASC' : 'DESC';

  const orderByClause = queryObj.agruparPorUf === 'true'
    ? `uf ASC, ${sortBy} ${sortDir}, id ASC`
    : `${sortBy} ${sortDir}, id ASC`;

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM urnas ${whereSQL}`).get(...params);
  const rows = db.prepare(`
    SELECT
      id, uf, regiao, municipio, zona, secao, local_votacao, cod_local, modelo_urna,
      aptos, comparecimento, abstencoes, taxa_abstencao,
      comparecimento_1t, abstencoes_1t, taxa_abstencao_1t, diff_abstencao,
      votos_nominais, votos_cand_1, votos_cand_2, pct_cand_1, pct_cand_2,
      votos_cand_1_1t, votos_cand_2_1t, votos_outros_1t, pct_cand_1_1t, pct_cand_2_1t,
      diff_cand_1, diff_cand_2,
      votos_brancos, votos_nulos,
      votos_apos_17h, pct_votos_apos_17h, horario_encerramento, horario_encerramento_brt, segundos_apos_17h,
      votos_cand_1_apos_17h, votos_cand_2_apos_17h,
      votos_sem_biometria, votos_sem_biometria_1t, pct_sem_biometria, apenas_biometria,
      tempo_medio_voto_seg, media_cand_1_escola, z_score_escola, score_anomalia
    FROM urnas
    ${whereSQL}
    ORDER BY ${orderByClause}
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  sendJson(res, 200, {
    total: countRow.total,
    page,
    pageSize,
    totalPages: Math.ceil(countRow.total / pageSize),
    rows
  });
}

function handleApiUrnaDetail(req, res, id) {
  const urna = db.prepare('SELECT * FROM urnas WHERE id = ?').get(Number(id));
  if (!urna) {
    return sendJson(res, 404, { error: 'Urna não encontrada' });
  }
  const vizinhasEscola = db.prepare(`
    SELECT id, secao, modelo_urna, aptos, comparecimento, taxa_abstencao, taxa_abstencao_1t,
           votos_cand_1_1t, votos_cand_2_1t, votos_cand_1, votos_cand_2, diff_cand_1, diff_cand_2,
           pct_cand_1, pct_cand_2, votos_apos_17h, votos_cand_1_apos_17h, votos_cand_2_apos_17h,
           horario_encerramento_brt, pct_sem_biometria, apenas_biometria, z_score_escola
    FROM urnas
    WHERE cod_local = ?
    ORDER BY secao ASC
  `).all(urna.cod_local);

  sendJson(res, 200, { urna, vizinhasEscola });
}

function handleApiExportCsv(req, res, queryObj) {
  const { whereSQL, params } = buildWhereClause(queryObj);
  const sortBy = ALLOWED_SORT_COLUMNS.has(queryObj.sortBy) ? queryObj.sortBy : 'votos_apos_17h';
  const sortDir = (queryObj.sortDir && queryObj.sortDir.toUpperCase() === 'ASC') ? 'ASC' : 'DESC';

  const rows = db.prepare(`
    SELECT
      uf, municipio, zona, secao, local_votacao, modelo_urna,
      aptos, comparecimento_1t, comparecimento, taxa_abstencao_1t, taxa_abstencao,
      votos_cand_1_1t, votos_cand_1, diff_cand_1,
      votos_cand_2_1t, votos_cand_2, diff_cand_2,
      pct_cand_1, pct_cand_2,
      horario_encerramento_brt, votos_apos_17h, votos_cand_1_apos_17h, votos_cand_2_apos_17h,
      votos_sem_biometria, apenas_biometria,
      media_cand_1_escola, z_score_escola
    FROM urnas
    ${whereSQL}
    ORDER BY uf ASC, ${sortBy} ${sortDir}
    LIMIT 20000
  `).all(...params);

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

  const csvLines = [headers.join(';')];
  for (const r of rows) {
    csvLines.push([
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

  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="auditoria_tse_2026_apos_17h.csv"'
  });
  res.end('\uFEFF' + csvLines.join('\r\n'));
}

function serveStaticFile(req, res, pathname) {
  let safePath = pathname === '/' ? '/index.html' : pathname;
  const fullPath = path.join(PUBLIC_DIR, safePath);
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(fullPath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Arquivo não encontrado');
    }
    const ext = path.extname(fullPath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml'
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const queryObj = Object.fromEntries(parsedUrl.searchParams.entries());

    if (pathname === '/api/meta' && req.method === 'GET') return handleApiMeta(req, res);
    if (pathname === '/api/municipios' && req.method === 'GET') return handleApiMunicipios(req, res, queryObj);
    if (pathname === '/api/dashboard' && req.method === 'GET') return handleApiDashboard(req, res, queryObj);
    if (pathname === '/api/urnas' && req.method === 'GET') return handleApiUrnas(req, res, queryObj);
    if (pathname.startsWith('/api/urna/') && req.method === 'GET') {
      const id = pathname.split('/')[3];
      return handleApiUrnaDetail(req, res, id);
    }
    if (pathname === '/api/export-csv' && req.method === 'GET') return handleApiExportCsv(req, res, queryObj);
    if (pathname === '/api/test-log' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const { logText } = JSON.parse(body || '{}');
          const result = parseTseLogText(logText || '');
          sendJson(res, 200, result);
        } catch (e) {
          sendJson(res, 400, { error: e.message });
        }
      });
      return;
    }

    serveStaticFile(req, res, pathname);
  } catch (err) {
    console.error('Erro no servidor:', err);
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`Painel TSE 2026 rodando em: http://localhost:${PORT}`);
  console.log(`================================================================`);
});
