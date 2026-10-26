const { getDb } = require('../src/db');

function parseTimeSec(tStr) {
  if (!tStr) return null;
  const parts = tStr.split(':');
  if (parts.length < 3) return null;
  const hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10);
  const ss = parseInt(parts[2], 10);
  if (isNaN(hh) || isNaN(mm) || isNaN(ss)) return null;
  return { hh, mm, ss, sec: hh * 3600 + mm * 60 + ss };
}

function formatTimeBrt(totalSec) {
  const clamped = Math.max(0, Math.min(86399, totalSec));
  const hh = Math.floor(clamped / 3600);
  const mm = Math.floor((clamped % 3600) / 60);
  const ss = clamped % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function runCalcApos17h() {
  const t0 = Date.now();
  const db = getDb();
  console.log('Calculando votos <17h e >17h (Horário de Brasília) para todas as urnas de 2026...');

  const rows = db.prepare(`
    SELECT id, uf, horario_abertura, horario_encerramento,
           comparecimento, votos_nominais, votos_cand_1, votos_cand_2
    FROM urnas
  `).all();

  const updateStmt = db.prepare(`
    UPDATE urnas
    SET
      segundos_apos_17h = ?,
      horario_encerramento_brt = ?,
      votos_apos_17h = ?,
      pct_votos_apos_17h = ?,
      votos_cand_1_apos_17h = ?,
      votos_cand_2_apos_17h = ?
    WHERE id = ?
  `);

  let urnasApos17 = 0;
  let totalVotosApos17 = 0;
  let totalCand1Apos17 = 0;
  let totalCand2Apos17 = 0;

  db.exec('BEGIN TRANSACTION;');
  try {
    for (const r of rows) {
      const openP = parseTimeSec(r.horario_abertura);
      const closeP = parseTimeSec(r.horario_encerramento);

      let offsetHoursToBrt = 0;
      if (r.uf === 'AC') {
        offsetHoursToBrt = 2;
      } else if (r.uf === 'RO' || r.uf === 'RR' || r.uf === 'MT' || r.uf === 'MS') {
        offsetHoursToBrt = 1;
      } else if (r.uf === 'AM') {
        offsetHoursToBrt = (openP && openP.hh <= 6) ? 2 : 1;
      }

      const openSecBrt = openP ? (openP.sec + offsetHoursToBrt * 3600) : (8 * 3600);
      const closeSecBrt = closeP ? (closeP.sec + offsetHoursToBrt * 3600) : (17 * 3600);
      const horarioBrt = formatTimeBrt(closeSecBrt);
      const sec17hBrt = 17 * 3600; // 61200s
      const segundosApos17h = Math.max(0, closeSecBrt - sec17hBrt);

      let votosApos17 = 0;
      let cand1Apos17 = 0;
      let cand2Apos17 = 0;

      if (segundosApos17h >= 120 && r.comparecimento > 0) {
        const segundosAntes17h = Math.max(3600, sec17hBrt - Math.min(openSecBrt, sec17hBrt - 3600));
        const efetivoSegundosFila = segundosApos17h - 60;

        // Taxa por fila (1 eleitor a cada ~38s), mas limitada à proporção temporal real do dia
        // (ex.: 9h antes das 17h vs horas após as 17h, com peso de fila de 1.35x no pós-17h)
        const estFila = Math.round(efetivoSegundosFila / 38);
        const timeShareMax = (efetivoSegundosFila * 1.35) / (segundosAntes17h + efetivoSegundosFila * 1.35);
        const maxPorTempo = Math.max(1, Math.round(r.comparecimento * timeShareMax));

        votosApos17 = Math.min(estFila, maxPorTempo, Math.max(1, r.comparecimento - 1));

        if (r.votos_nominais > 0) {
          const share1 = r.votos_cand_1 / r.votos_nominais;
          const validRatio = r.votos_nominais / r.comparecimento;
          const nominaisApos17 = Math.min(r.votos_nominais - 1, Math.max(1, Math.round(votosApos17 * validRatio)));
          cand1Apos17 = Math.min(r.votos_cand_1, Math.round(nominaisApos17 * share1));
          cand2Apos17 = Math.min(r.votos_cand_2, Math.max(0, nominaisApos17 - cand1Apos17));
        }

        urnasApos17++;
        totalVotosApos17 += votosApos17;
        totalCand1Apos17 += cand1Apos17;
        totalCand2Apos17 += cand2Apos17;
      }

      const pctApos17 = r.comparecimento > 0
        ? Number(((votosApos17 / r.comparecimento) * 100).toFixed(2))
        : 0;

      updateStmt.run(
        segundosApos17h,
        horarioBrt,
        votosApos17,
        pctApos17,
        cand1Apos17,
        cand2Apos17,
        r.id
      );
    }
    db.exec('COMMIT;');
  } catch (e) {
    db.exec('ROLLBACK;');
    throw e;
  }

  console.log(`Concluído em ${((Date.now() - t0) / 1000).toFixed(1)}s!`);
  console.log({
    urnasApos17,
    totalVotosApos17,
    totalCand1Apos17,
    totalCand2Apos17
  });
}

runCalcApos17h();
