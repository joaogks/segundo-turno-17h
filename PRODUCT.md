# PRODUCT.md — Auditoria Eleitoral TSE 2026 (1º vs 2º Turno, Pós-17h00 & Biometria)

## Purpose & Audience
A high-precision electoral forensics and statistical audit workbench for the **2026 Brazilian Presidential Election** (`499.206` electoral sections across all 28 UFs, comparing 1st Round `04/10/2026` vs. 2nd Round `25/10/2026`: **Lula 13** vs. **Flávio Bolsonaro 22**).

## Surface Mode
**Operate** — Built for rapid analytical verification, cross-filtering, and column-level sorting across 499,206 polling stations. Scanability, tabular numeral alignment, zero visual clutter, and immediate state feedback outrank decorative chrome.

## Core User Tasks
1. **Inspect the Post-17h00 BRT Breakdown:** Compare votes cast up to 17h00 BRT (`50,63% vs 49,37%`) against votes cast strictly after 17h00 BRT (`7.589.049 [62,46%]` vs `4.561.977 [37,54%]`), and filter by the 6 closing-time cutoff bands (`Até 17h02`, `Até 17h05`, `Após 17h05`, `Após 17h15`, `Após 17h30`, `Após 18h00`).
2. **Isolate 100% Biometric Urnas:** Toggle in one click to inspect only sections with zero non-biometric releases (`votos_sem_biometria = 0`).
3. **Compare 1st Round vs. 2nd Round by State (UF) and Section:** Audit vote deltas (`2ºT - 1ºT`), abstention shifts, and intra-school Z-score deviations (`σ`).
4. **Sort Any Metric Ascending (`▲`) or Descending (`▼`):** Click any column header in the State Summary Table or the 499,206-Section Audit Table (e.g., *Biometria*, *Total >17h*, *Hora Fechou*, *Abstenção*) to sort immediately.
