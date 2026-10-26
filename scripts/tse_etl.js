const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { getDb } = require('../src/db');

// Real Brazilian states, regions, timezones, and representative municipalities
const ESTADOS_BR = [
  { uf: 'SP', regiao: 'Sudeste', fuso: 'UTC-3', baseCand1: 44.8, abstBase: 21.2, peso: 18, cidades: ['SÃO PAULO', 'GUARULHOS', 'CAMPINAS', 'SÃO BERNARDO DO CAMPO', 'RIBEIRÃO PRETO', 'SANTOS', 'SOROCABA', 'SÃO JOSÉ DOS CAMPOS'] },
  { uf: 'MG', regiao: 'Sudeste', fuso: 'UTC-3', baseCand1: 50.2, abstBase: 20.5, peso: 12, cidades: ['BELO HORIZONTE', 'UBERLÂNDIA', 'CONTAGEM', 'JUIZ DE FORA', 'MONTES CLAROS', 'BETIM'] },
  { uf: 'RJ', regiao: 'Sudeste', fuso: 'UTC-3', baseCand1: 43.5, abstBase: 22.8, peso: 10, cidades: ['RIO DE JANEIRO', 'SÃO GONÇALO', 'DUQUE DE CAXIAS', 'NOVA IGUAÇU', 'NITERÓI', 'CAMPOS DOS GOYTACAZES'] },
  { uf: 'BA', regiao: 'Nordeste', fuso: 'UTC-3', baseCand1: 72.1, abstBase: 21.1, peso: 9, cidades: ['SALVADOR', 'FEIRA DE SANTANA', 'VITÓRIA DA CONQUISTA', 'CAMAÇARI', 'ITABUNA', 'JUAZEIRO'] },
  { uf: 'RS', regiao: 'Sul', fuso: 'UTC-3', baseCand1: 43.7, abstBase: 19.4, peso: 7, cidades: ['PORTO ALEGRE', 'CAXIAS DO SUL', 'CANOAS', 'PELOTAS', 'SANTA MARIA'] },
  { uf: 'PR', regiao: 'Sul', fuso: 'UTC-3', baseCand1: 37.6, abstBase: 18.9, peso: 7, cidades: ['CURITIBA', 'LONDRINA', 'MARINGÁ', 'PONTA GROSSA', 'CASCAVEL'] },
  { uf: 'PE', regiao: 'Nordeste', fuso: 'UTC-3', baseCand1: 66.9, abstBase: 19.2, peso: 6, cidades: ['RECIFE', 'JABOATÃO DOS GUARARAPES', 'OLINDA', 'CARUARU', 'PETROLINA'] },
  { uf: 'CE', regiao: 'Nordeste', fuso: 'UTC-3', baseCand1: 69.9, abstBase: 18.5, peso: 6, cidades: ['FORTALEZA', 'CAUCAIA', 'JUAZEIRO DO NORTE', 'MARACANAÚ', 'SOBRAL'] },
  { uf: 'PA', regiao: 'Norte', fuso: 'UTC-3', baseCand1: 54.7, abstBase: 23.4, peso: 5, cidades: ['BELÉM', 'ANANINDEUA', 'SANTARÉM', 'MARABÁ', 'CASTANHAL'] },
  { uf: 'SC', regiao: 'Sul', fuso: 'UTC-3', baseCand1: 30.7, abstBase: 17.8, peso: 5, cidades: ['FLORIANÓPOLIS', 'JOINVILLE', 'BLUMENAU', 'SÃO JOSÉ', 'CHAPECÓ'] },
  { uf: 'GO', regiao: 'Centro-Oeste', fuso: 'UTC-3', baseCand1: 41.3, abstBase: 20.9, peso: 4, cidades: ['GOIÂNIA', 'APARECIDA DE GOIÂNIA', 'ANÁPOLIS', 'RIO VERDE'] },
  { uf: 'MA', regiao: 'Nordeste', fuso: 'UTC-3', baseCand1: 71.1, abstBase: 22.6, peso: 4, cidades: ['SÃO LUÍS', 'IMPERATRIZ', 'SÃO JOSÉ DE RIBAMAR', 'TIMON'] },
  { uf: 'PB', regiao: 'Nordeste', fuso: 'UTC-3', baseCand1: 66.6, abstBase: 17.9, peso: 3, cidades: ['JOÃO PESSOA', 'CAMPINA GRANDE', 'SANTA RITA', 'PATOS'] },
  { uf: 'AM', regiao: 'Norte', fuso: 'UTC-4', baseCand1: 51.1, abstBase: 21.8, peso: 3, cidades: ['MANAUS', 'PARINTINS', 'ITACOATIARA', 'MANACAPURU'] },
  { uf: 'ES', regiao: 'Sudeste', fuso: 'UTC-3', baseCand1: 42.0, abstBase: 20.1, peso: 3, cidades: ['VITÓRIA', 'VILA VELHA', 'SERRA', 'CARIACICA'] },
  { uf: 'RN', regiao: 'Nordeste', fuso: 'UTC-3', baseCand1: 65.1, abstBase: 18.2, peso: 3, cidades: ['NATAL', 'MOSSORÓ', 'PARNAMIRIM', 'SÃO GONÇALO DO AMARANTE'] },
  { uf: 'PI', regiao: 'Nordeste', fuso: 'UTC-3', baseCand1: 76.8, abstBase: 18.1, peso: 3, cidades: ['TERESINA', 'PARNAÍBA', 'PICOS', 'PIRIPIRI'] },
  { uf: 'AL', regiao: 'Nordeste', fuso: 'UTC-3', baseCand1: 58.6, abstBase: 22.3, peso: 2, cidades: ['MACEIÓ', 'ARAPIRACA', 'RIO LARGO'] },
  { uf: 'MT', regiao: 'Centro-Oeste', fuso: 'UTC-4', baseCand1: 34.9, abstBase: 23.1, peso: 2, cidades: ['CUIABÁ', 'VÁRZEA GRANDE', 'RONDONÓPOLIS', 'SINOP'] },
  { uf: 'DF', regiao: 'Centro-Oeste', fuso: 'UTC-3', baseCand1: 41.2, abstBase: 17.5, peso: 3, cidades: ['BRASÍLIA', 'TAGUATINGA', 'CEILÂNDIA', 'PLANO PILOTO'] },
  { uf: 'MS', regiao: 'Centro-Oeste', fuso: 'UTC-4', baseCand1: 40.5, abstBase: 22.0, peso: 2, cidades: ['CAMPO GRANDE', 'DOURADOS', 'TRÊS LAGOAS'] },
  { uf: 'SE', regiao: 'Nordeste', fuso: 'UTC-3', baseCand1: 67.2, abstBase: 19.0, peso: 2, cidades: ['ARACAJU', 'NOSSA SENHORA DO SOCORRO', 'LAGARTO'] },
  { uf: 'RO', regiao: 'Norte', fuso: 'UTC-4', baseCand1: 29.0, abstBase: 24.5, peso: 2, cidades: ['PORTO VELHO', 'JI-PARANÁ', 'ARIQUEMES'] },
  { uf: 'TO', regiao: 'Norte', fuso: 'UTC-3', baseCand1: 51.3, abstBase: 21.0, peso: 2, cidades: ['PALMAS', 'ARAGUAÍNA', 'GURUPI'] },
  { uf: 'AC', regiao: 'Norte', fuso: 'UTC-5', baseCand1: 29.7, abstBase: 24.8, peso: 1, cidades: ['RIO BRANCO', 'CRUZEIRO DO SUL'] },
  { uf: 'AP', regiao: 'Norte', fuso: 'UTC-3', baseCand1: 48.6, abstBase: 21.4, peso: 1, cidades: ['MACAPÁ', 'SANTANA'] },
  { uf: 'RR', regiao: 'Norte', fuso: 'UTC-4', baseCand1: 23.9, abstBase: 19.8, peso: 1, cidades: ['BOA VISTA', 'RORAINÓPOLIS'] }
];

const MODELOS_URNA = ['UE2009', 'UE2010', 'UE2011', 'UE2013', 'UE2015', 'UE2020', 'UE2022'];
const PREFIXOS_ESCOLA = [
  'E.E. PROF. ANTÔNIO CARLOS',
  'COLÉGIO ESTADUAL TIRADENTES',
  'E.M. PRESIDENTE VARGAS',
  'CENTRO EDUCACIONAL DOM PEDRO II',
  'CIEP TANCREDO NEVES',
  'INSTITUTO FEDERAL CAMPUS CENTRAL',
  'E.E. MARECHAL RONDON',
  'COLÉGIO MUNICIPAL CASTRO ALVES',
  'UNIDADE ESCOLAR RUI BARBOSA',
  'GINÁSIO POLIESPORTIVO SANTOS DUMONT'
];

// Deterministic PRNG for reproducible realistic data
let seedVal = 20221030;
function rand() {
  seedVal = (seedVal * 1664525 + 1013904223) % 4294967296;
  return seedVal / 4294967296;
}

function randNormal(mean = 0, std = 1) {
  const u1 = Math.max(1e-7, rand());
  const u2 = rand();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * std + mean;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Calculates composite anomaly score and flags for a section
 */
function evaluateAnomalies(row) {
  const flags = [];
  let score = 0;

  // 1. Votos após 17h elevados
  if (row.pct_votos_apos_17h >= 12 || row.votos_apos_17h >= 40) {
    flags.push('VOTOS_APOS_17H_CRITICO');
    score += 34;
  } else if (row.pct_votos_apos_17h >= 5 || row.votos_apos_17h >= 15) {
    flags.push('VOTOS_APOS_17H_ALERTA');
    score += 16;
  }

  // 2. Desvio estatístico em relação às outras urnas da MESMA escola (Z-Score)
  const absZ = Math.abs(row.z_score_escola);
  if (absZ >= 3.0) {
    flags.push('DESVIO_ESCOLA_3SIGMA');
    score += 36;
  } else if (absZ >= 2.2) {
    flags.push('DESVIO_ESCOLA_2SIGMA');
    score += 18;
  }

  // 3. Abstenção extremamente baixa (< 2.5%) combinada com votação muito concentrada
  if (row.taxa_abstencao <= 2.5 && (row.pct_cand_1 >= 90 || row.pct_cand_2 >= 90)) {
    flags.push('ABSTENCAO_ZERO_UNANIME');
    score += 38;
  } else if (row.taxa_abstencao <= 3.5) {
    flags.push('ABSTENCAO_ATIPICA_BAIXA');
    score += 15;
  } else if (row.taxa_abstencao >= 45.0) {
    flags.push('ABSTENCAO_ATIPICA_ALTA');
    score += 14;
  }

  // 4. Alta liberação de votos sem biometria pelo mesário
  if (row.pct_sem_biometria >= 22.0) {
    flags.push('ALTA_LIBERACAO_SEM_BIO');
    score += 24;
  } else if (row.pct_sem_biometria >= 12.0) {
    flags.push('MODERADA_LIBERACAO_SEM_BIO');
    score += 10;
  }

  // 5. Velocidade de votação humanamente rápida demais (< 18s de média ou muitos votos < 15s)
  if (row.tempo_medio_voto_seg <= 18.5 || row.votos_rapidos_15s >= 35) {
    flags.push('VELOCIDADE_VOTO_ATIPICA');
    score += 28;
  }

  // 6. Reinicializações ou contingência na urna + votos tardios
  if (row.reinicializacoes_urna >= 2) {
    flags.push('MULTIPLAS_REINICIALIZACOES');
    score += 15;
  }

  return {
    score_anomalia: Number(clamp(score, 0, 100).toFixed(1)),
    flags_anomalia: JSON.stringify(flags)
  };
}

/**
 * Generates realistic dataset with 4,800+ urnas across all 27 UFs and schools
 */
function seedDatabase() {
  const db = getDb();
  console.log('Iniciando geração da base analítica do 2º Turno TSE...');

  db.exec('DELETE FROM urnas;');

  const rawRows = [];
  let codMunicipioCounter = 1000;
  let codLocalCounter = 50000;

  for (const est of ESTADOS_BR) {
    const numEscolasEstado = est.peso * 9; // ~1100 escolas total, ~4800 urnas
    for (let e = 0; e < numEscolasEstado; e++) {
      const cidade = est.cidades[e % est.cidades.length];
      const codMunicipio = codMunicipioCounter + (e % est.cidades.length);
      const zona = ((e * 7) % 95) + 1;
      const codLocal = ++codLocalCounter;
      const nomeEscola = `${PREFIXOS_ESCOLA[e % PREFIXOS_ESCOLA.length]} - UNID. ${ (e % 12) + 1 }`;

      // Base profile for this specific school building (neighborhood effect)
      const escolaCand1Base = clamp(est.baseCand1 + randNormal(0, 8.5), 12, 88);
      const escolaAbstBase = clamp(est.abstBase + randNormal(0, 4.2), 6, 38);
      const numSecoesNaEscola = 3 + Math.floor(rand() * 4); // 3 to 6 sections per school

      const secoesEscola = [];

      for (let s = 0; s < numSecoesNaEscola; s++) {
        const secao = (zona * 10) + s + 1 + (e * 6);
        const modeloIdx = Math.floor(Math.pow(rand(), 0.75) * MODELOS_URNA.length);
        const modelo_urna = MODELOS_URNA[clamp(modeloIdx, 0, MODELOS_URNA.length - 1)];

        const aptos = Math.round(clamp(randNormal(345, 55), 150, 480));

        // Decide if this specific section has an injected statistical anomaly (~7.5% of urnas)
        const anomalyRoll = rand();
        let tipoAnomaliaInjetada = 'NORMAL';
        if (anomalyRoll < 0.016) tipoAnomaliaInjetada = 'SURTO_APOS_17H';
        else if (anomalyRoll < 0.032) tipoAnomaliaInjetada = 'DESVIO_ESCOLA_EXTREMO';
        else if (anomalyRoll < 0.046) tipoAnomaliaInjetada = 'ABSTENCAO_ZERO_UNANIME';
        else if (anomalyRoll < 0.062) tipoAnomaliaInjetada = 'ALTA_SEM_BIOMETRIA_E_RAPIDA';
        else if (anomalyRoll < 0.075) tipoAnomaliaInjetada = 'CONTINGENCIA_ATRASO';

        // Abstention calculation
        let taxaAbst = clamp(escolaAbstBase + randNormal(0, 2.3), 4.0, 44.0);
        if (tipoAnomaliaInjetada === 'ABSTENCAO_ZERO_UNANIME') {
          taxaAbst = Number((rand() * 1.8).toFixed(2)); // 0% to 1.8% abstention!
        }

        const abstencoes = Math.round((aptos * taxaAbst) / 100);
        const comparecimento = aptos - abstencoes;
        const taxa_abstencao = Number(((abstencoes / aptos) * 100).toFixed(2));

        // Blank & Null votes (~3.5% to 5.5%)
        const pctBrancosNulos = clamp(randNormal(4.2, 1.4), 0.5, 11.0);
        const totalBN = tipoAnomaliaInjetada === 'ABSTENCAO_ZERO_UNANIME'
          ? Math.floor(rand() * 2)
          : Math.round((comparecimento * pctBrancosNulos) / 100);
        const votos_brancos = Math.floor(totalBN * 0.42);
        const votos_nulos = totalBN - votos_brancos;
        const votos_nominais = Math.max(1, comparecimento - totalBN);

        // Candidate split
        let pct1 = clamp(escolaCand1Base + randNormal(0, 2.6), 4.0, 96.0);
        if (tipoAnomaliaInjetada === 'DESVIO_ESCOLA_EXTREMO') {
          // Flip or surge 30-42 percentage points away from its own school building!
          pct1 = escolaCand1Base > 50
            ? clamp(escolaCand1Base - (30 + rand() * 14), 3, 97)
            : clamp(escolaCand1Base + (30 + rand() * 14), 3, 97);
        } else if (tipoAnomaliaInjetada === 'ABSTENCAO_ZERO_UNANIME') {
          pct1 = rand() > 0.35 ? 96.5 + rand() * 3.3 : 1.0 + rand() * 2.5;
        } else if (tipoAnomaliaInjetada === 'SURTO_APOS_17H') {
          pct1 = clamp(escolaCand1Base + (rand() > 0.5 ? 18 : -18), 5, 95);
        }

        const votos_cand_1 = Math.round((votos_nominais * pct1) / 100);
        const votos_cand_2 = votos_nominais - votos_cand_1;
        const pct_cand_1 = Number(((votos_cand_1 / votos_nominais) * 100).toFixed(2));
        const pct_cand_2 = Number(((votos_cand_2 / votos_nominais) * 100).toFixed(2));

        // Biometrics calculation:
        // Make ~38% of urnas have 100% biometric reading (0 votes without biometrics) so the user's filter has a rich dataset
        let votos_sem_biometria = 0;
        const bioRoll = rand();
        if (tipoAnomaliaInjetada === 'ALTA_SEM_BIOMETRIA_E_RAPIDA') {
          votos_sem_biometria = Math.round(comparecimento * (0.25 + rand() * 0.30)); // 25% to 55% without biometrics!
        } else if (bioRoll < 0.38) {
          votos_sem_biometria = 0; // 100% Biometria!
        } else {
          // Older urna models have slightly more biometric retries/manual releases
          const bioFailFactor = (modelo_urna === 'UE2009' || modelo_urna === 'UE2010') ? 0.048 : 0.022;
          votos_sem_biometria = Math.max(1, Math.round(comparecimento * clamp(randNormal(bioFailFactor, 0.018), 0.003, 0.14)));
        }

        const pct_sem_biometria = Number(((votos_sem_biometria / Math.max(1, comparecimento)) * 100).toFixed(2));
        const apenas_biometria = votos_sem_biometria === 0 ? 1 : 0;

        // Post-17h votes & hourly timeline (08h to 19h)
        let votos_apos_17h = 0;
        let horario_encerramento = `17:0${Math.floor(rand() * 5)}:${String(Math.floor(rand() * 59)).padStart(2, '0')}`;

        if (tipoAnomaliaInjetada === 'SURTO_APOS_17H') {
          votos_apos_17h = Math.round(comparecimento * (0.16 + rand() * 0.18)); // 16% to 34% of all votes cast after 17h!
          const minEnc = 10 + Math.floor(rand() * 48);
          horario_encerramento = `18:${String(minEnc).padStart(2, '0')}:${String(Math.floor(rand() * 59)).padStart(2, '0')}`;
        } else if (tipoAnomaliaInjetada === 'CONTINGENCIA_ATRASO') {
          votos_apos_17h = Math.round(comparecimento * (0.09 + rand() * 0.08));
          horario_encerramento = `17:${String(35 + Math.floor(rand() * 24)).padStart(2, '0')}:12`;
        } else if (rand() < 0.19) {
          // Normal small queue at 17h (1 to 14 voters with senha)
          votos_apos_17h = Math.min(comparecimento, 1 + Math.floor(rand() * 13));
          horario_encerramento = `17:${String(4 + Math.floor(votos_apos_17h * 1.1)).padStart(2, '0')}:28`;
        }

        const pct_votos_apos_17h = Number(((votos_apos_17h / Math.max(1, comparecimento)) * 100).toFixed(2));

        // Build hourly vote curve (08h-16h + 17h + 18h+)
        const votosAntes17h = comparecimento - votos_apos_17h;
        const pesosHoras = [0.09, 0.12, 0.14, 0.13, 0.09, 0.10, 0.11, 0.12, 0.10]; // 08h..16h
        const curvaHoraria = {};
        let somaHoras = 0;
        const horasLabels = ['08h', '09h', '10h', '11h', '12h', '13h', '14h', '15h', '16h'];
        horasLabels.forEach((h, idx) => {
          if (idx === horasLabels.length - 1) {
            curvaHoraria[h] = Math.max(0, votosAntes17h - somaHoras);
          } else {
            const v = Math.round(votosAntes17h * clamp(pesosHoras[idx] + randNormal(0, 0.015), 0.04, 0.20));
            curvaHoraria[h] = v;
            somaHoras += v;
          }
        });
        if (votos_apos_17h > 0) {
          const v17 = tipoAnomaliaInjetada === 'SURTO_APOS_17H' ? Math.round(votos_apos_17h * 0.62) : votos_apos_17h;
          const v18 = votos_apos_17h - v17;
          curvaHoraria['17h'] = v17;
          curvaHoraria['18h+'] = v18;
        } else {
          curvaHoraria['17h'] = 0;
          curvaHoraria['18h+'] = 0;
        }

        // Speed per voter & reboots
        let tempo_medio_voto_seg = Number(clamp(randNormal(39.5, 6.2), 23.0, 68.0).toFixed(1));
        let votos_rapidos_15s = Math.floor(rand() * 6);
        let reinicializacoes_urna = rand() < 0.03 ? 1 : 0;

        if (tipoAnomaliaInjetada === 'ALTA_SEM_BIOMETRIA_E_RAPIDA' || tipoAnomaliaInjetada === 'ABSTENCAO_ZERO_UNANIME') {
          tempo_medio_voto_seg = Number((12.4 + rand() * 5.2).toFixed(1));
          votos_rapidos_15s = Math.round(comparecimento * (0.35 + rand() * 0.25));
        }
        if (tipoAnomaliaInjetada === 'CONTINGENCIA_ATRASO') {
          reinicializacoes_urna = 2 + Math.floor(rand() * 2);
        }

        secoesEscola.push({
          uf: est.uf,
          regiao: est.regiao,
          fuso_horario: est.fuso,
          municipio: cidade,
          cod_municipio: codMunicipio,
          zona,
          secao,
          local_votacao: nomeEscola,
          cod_local: codLocal,
          modelo_urna,
          aptos,
          comparecimento,
          abstencoes,
          taxa_abstencao,
          votos_nominais,
          votos_cand_1,
          votos_cand_2,
          pct_cand_1,
          pct_cand_2,
          votos_brancos,
          votos_nulos,
          votos_apos_17h,
          pct_votos_apos_17h,
          horario_abertura: '08:00:00',
          horario_encerramento,
          votos_sem_biometria,
          pct_sem_biometria,
          apenas_biometria,
          tempo_medio_voto_seg,
          votos_rapidos_15s,
          reinicializacoes_urna,
          curva_horaria_json: JSON.stringify(curvaHoraria)
        });
      }

      // Compute school building mean and Z-Score for each section in this school
      const mediaEscola = secoesEscola.reduce((acc, r) => acc + r.pct_cand_1, 0) / secoesEscola.length;
      const variance = secoesEscola.reduce((acc, r) => acc + Math.pow(r.pct_cand_1 - mediaEscola, 2), 0) / secoesEscola.length;
      // Floor stdDev at 2.8% so normal natural variation of 1-2% doesn't trigger false 3-sigma
      const stdEscola = Math.max(2.8, Math.sqrt(variance));

      for (const sec of secoesEscola) {
        sec.media_cand_1_escola = Number(mediaEscola.toFixed(2));
        sec.z_score_escola = Number(((sec.pct_cand_1 - mediaEscola) / stdEscola).toFixed(2));
        const anom = evaluateAnomalies(sec);
        sec.score_anomalia = anom.score_anomalia;
        sec.flags_anomalia = anom.flags_anomalia;
        rawRows.push(sec);
      }
    }
    codMunicipioCounter += 100;
  }

  // Batch insert inside a transaction
  const insertStmt = db.prepare(`
    INSERT INTO urnas (
      uf, regiao, municipio, cod_municipio, zona, secao, local_votacao, cod_local,
      modelo_urna, fuso_horario, aptos, comparecimento, abstencoes, taxa_abstencao,
      votos_nominais, votos_cand_1, votos_cand_2, pct_cand_1, pct_cand_2,
      votos_brancos, votos_nulos, votos_apos_17h, pct_votos_apos_17h,
      horario_abertura, horario_encerramento, votos_sem_biometria, pct_sem_biometria,
      apenas_biometria, tempo_medio_voto_seg, votos_rapidos_15s, reinicializacoes_urna,
      media_cand_1_escola, z_score_escola, score_anomalia, flags_anomalia, curva_horaria_json
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `);

  db.exec('BEGIN TRANSACTION;');
  try {
    for (const r of rawRows) {
      insertStmt.run(
        r.uf, r.regiao, r.municipio, r.cod_municipio, r.zona, r.secao, r.local_votacao, r.cod_local,
        r.modelo_urna, r.fuso_horario, r.aptos, r.comparecimento, r.abstencoes, r.taxa_abstencao,
        r.votos_nominais, r.votos_cand_1, r.votos_cand_2, r.pct_cand_1, r.pct_cand_2,
        r.votos_brancos, r.votos_nulos, r.votos_apos_17h, r.pct_votos_apos_17h,
        r.horario_abertura, r.horario_encerramento, r.votos_sem_biometria, r.pct_sem_biometria,
        r.apenas_biometria, r.tempo_medio_voto_seg, r.votos_rapidos_15s, r.reinicializacoes_urna,
        r.media_cand_1_escola, r.z_score_escola, r.score_anomalia, r.flags_anomalia, r.curva_horaria_json
      );
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  console.log(`Sucesso! ${rawRows.length} urnas/seções eleitorais geradas e indexadas no SQLite.`);
  return rawRows.length;
}

/**
 * Parser para Log Bruto da Urna do TSE (arquivos logd.dat extraídos do .logjez)
 * Extrai: votos após 17h, habilitações sem biometria, velocidade média entre votos e reinicializações
 */
function parseTseLogText(logContent) {
  const lines = logContent.split(/\r?\n/);
  let votosApos17h = 0;
  let votosSemBiometria = 0;
  let totalVotosComputados = 0;
  let reinicializacoes = 0;
  let habilitacaoTimestamp = null;
  let somaTemposSeg = 0;
  let qtdTempos = 0;
  let votosRapidos15s = 0;
  let horarioEncerramento = '17:00:00';
  let eleitorAtualSemBio = false;

  const curvaHoraria = {
    '08h': 0, '09h': 0, '10h': 0, '11h': 0, '12h': 0,
    '13h': 0, '14h': 0, '15h': 0, '16h': 0, '17h': 0, '18h+': 0
  };

  for (const line of lines) {
    // Formato padrão Log TSE: DD/MM/AAAA HH:MM:SS\tINFO\t...
    const matchTime = line.match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!matchTime) continue;

    const hh = parseInt(matchTime[2], 10);
    const mm = parseInt(matchTime[3], 10);
    const ss = parseInt(matchTime[4], 10);
    const totalSecOfDay = hh * 3600 + mm * 60 + ss;

    if (line.includes('Aguardando digitação do título') || line.includes('Eleitor foi habilitado')) {
      habilitacaoTimestamp = totalSecOfDay;
      eleitorAtualSemBio = false;
    }

    if (
      line.includes('Solicitação de dado pessoal do eleitor para habilitação manual') ||
      line.includes('Habilitação do eleitor sem biometria') ||
      line.includes('Não foi possível reconhecer a digital')
    ) {
      eleitorAtualSemBio = true;
    }

    if (line.includes('O voto do eleitor foi computado')) {
      totalVotosComputados++;
      if (eleitorAtualSemBio) {
        votosSemBiometria++;
        eleitorAtualSemBio = false;
      }

      if (hh >= 17 && (hh > 17 || mm > 0 || ss > 0)) {
        votosApos17h++;
      }

      const keyHora = hh < 8 ? '08h' : hh <= 16 ? `${String(hh).padStart(2, '0')}h` : hh === 17 ? '17h' : '18h+';
      curvaHoraria[keyHora] = (curvaHoraria[keyHora] || 0) + 1;

      if (habilitacaoTimestamp !== null && totalSecOfDay >= habilitacaoTimestamp) {
        const delta = totalSecOfDay - habilitacaoTimestamp;
        if (delta > 0 && delta < 600) {
          somaTemposSeg += delta;
          qtdTempos++;
          if (delta <= 15) votosRapidos15s++;
        }
      }
      habilitacaoTimestamp = null;
    }

    if (line.includes('Encerrando a votação') || line.includes('Votação encerrada')) {
      horarioEncerramento = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    }

    if (line.includes('Iniciando a aplicação') && hh >= 8 && hh < 17) {
      reinicializacoes++;
    }
  }

  return {
    totalVotosComputados,
    votos_apos_17h: votosApos17h,
    votos_sem_biometria: votosSemBiometria,
    apenas_biometria: votosSemBiometria === 0 ? 1 : 0,
    tempo_medio_voto_seg: qtdTempos > 0 ? Number((somaTemposSeg / qtdTempos).toFixed(1)) : 38.0,
    votos_rapidos_15s: votosRapidos15s,
    reinicializacoes_urna: reinicializacoes,
    horario_encerramento: horarioEncerramento,
    curva_horaria_json: JSON.stringify(curvaHoraria)
  };
}

/**
 * Importador de arquivo CSV oficial de Boletim de Urna do TSE (bweb_2t_<UF>_*.csv)
 */
async function importTseCsv(csvFilePath) {
  if (!fs.existsSync(csvFilePath)) {
    throw new Error(`Arquivo CSV não encontrado: ${csvFilePath}`);
  }

  console.log(`Lendo arquivo CSV oficial do TSE: ${csvFilePath} ...`);
  const fileStream = fs.createReadStream(csvFilePath, { encoding: 'latin1' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let headers = null;
  const secoesMap = new Map();

  for await (const line of rl) {
    if (!line.trim()) continue;
    const cols = line.split(';').map(c => c.replace(/^"|"$/g, '').trim());

    if (!headers) {
      headers = cols;
      continue;
    }

    const rowObj = {};
    for (let i = 0; i < headers.length; i++) {
      rowObj[headers[i]] = cols[i];
    }

    // Filtra apenas cargo Presidente (CD_CARGO_PERGUNTA == 1) se presente
    if (rowObj.CD_CARGO_PERGUNTA && rowObj.CD_CARGO_PERGUNTA !== '1') continue;

    const uf = rowObj.SG_UF || 'BR';
    const codMun = parseInt(rowObj.CD_MUNICIPIO || '0', 10);
    const zona = parseInt(rowObj.NR_ZONA || '0', 10);
    const secao = parseInt(rowObj.NR_SECAO || '0', 10);
    const key = `${uf}_${codMun}_${zona}_${secao}`;

    if (!secoesMap.has(key)) {
      const aptos = parseInt(rowObj.QT_APTOS || '0', 10);
      const comparecimento = parseInt(rowObj.QT_COMPARECIMENTO || '0', 10);
      const abstencoes = parseInt(rowObj.QT_ABSTENCOES || '0', 10);
      secoesMap.set(key, {
        uf,
        regiao: 'Importado TSE',
        municipio: rowObj.NM_MUNICIPIO || 'MUNICÍPIO',
        cod_municipio: codMun,
        zona,
        secao,
        local_votacao: rowObj.NM_LOCAL_VOTACAO || `LOCAL ${rowObj.NR_LOCAL_VOTACAO || '0'}`,
        cod_local: parseInt(rowObj.NR_LOCAL_VOTACAO || '0', 10),
        modelo_urna: rowObj.DS_MODELO_URNA || 'UE2020',
        aptos,
        comparecimento,
        abstencoes,
        taxa_abstencao: aptos > 0 ? Number(((abstencoes / aptos) * 100).toFixed(2)) : 0,
        votos_cand_1: 0,
        votos_cand_2: 0,
        votos_brancos: 0,
        votos_nulos: 0
      });
    }

    const item = secoesMap.get(key);
    const nrVotavel = rowObj.NR_VOTAVEL;
    const qtVotos = parseInt(rowObj.QT_VOTOS || '0', 10);

    if (nrVotavel === '95') item.votos_brancos += qtVotos;
    else if (nrVotavel === '96') item.votos_nulos += qtVotos;
    else if (nrVotavel === '13') item.votos_cand_1 += qtVotos;
    else if (nrVotavel === '22') item.votos_cand_2 += qtVotos;
  }

  console.log(`Processadas ${secoesMap.size} seções eleitorais do CSV.`);
  return secoesMap.size;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--seed') || args.length === 0) {
    seedDatabase();
  } else if (args.includes('--import-csv') && args[1]) {
    importTseCsv(args[1]).catch(console.error);
  }
}

module.exports = {
  seedDatabase,
  parseTseLogText,
  importTseCsv
};
