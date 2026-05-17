
// ═══════════════════════════════════════════════════════════
// RATE TABLES  (anchored May 15 2026 · The Mortgage Reports)
// ═══════════════════════════════════════════════════════════
const FHA_PAR = {
  'under580':null,'580-599':8.250,'600-619':7.750,
  '620-639':6.500,'640-659':6.375,'660-679':6.250,
  '680-699':6.125,'700-719':6.000,'720-739':5.875,
  '740-759':5.750,'760-779':5.625,'780+':5.500
};
const CONV_PAR = {
  '620-639':7.125,'640-659':6.875,'660-679':6.750,
  '680-699':6.625,'700-719':6.500,'720-739':6.375,
  '740-759':6.250,'760-779':6.125,'780+':6.000
};
// Annual PMI rate (%) for conventional, ~95% LTV — MGIC/Radian/Essent market averages
const PMI_RATE = {
  '620-639':1.20,'640-659':0.95,'660-679':0.75,
  '680-699':0.62,'700-719':0.50,'720-739':0.40,
  '740-759':0.30,'760-779':0.23,'780+':0.18
};
const FHA_MIP_ANNUAL = 0.55;   // % of loan, for LTV >90%, 30yr
const FHA_UFMIP      = 1.75;   // % upfront MIP
const TAX_RATE       = 0.0065; // 0.65% annual — AZ effective avg (Maricopa ~0.60%, Pima ~0.72%)
const INS_RATE       = 0.0035; // 0.35% annual home insurance

// VA Loan constants (VA Circular 26-23-30, effective 2024)
const VA_FUNDING_FEE_FIRST = 2.15;  // % of loan, first use, 0% down
const VA_FUNDING_FEE_SUBSEQ = 3.30; // % of loan, subsequent use
// VA rates run ~0.25% below comparable conventional (market average)
const VA_PAR_SPREAD = 0.25; // subtracted from CONV_PAR per tier

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
const S = {
  credit:'', income:0, debts:0, zip:'',
  loanType:'fha',   // 'fha' | 'conventional' | 'va'
  selRate: null,    // currently selected rate (null = par)
  taxMo: 0, insMo: 0, miMo: 0, hoa: 0,
  locked: false,
  editPayment: null,  // null = auto-calc; number = user override
  // Assumption overrides
  isVA:    false,
  isFTHB:  true,
  propUse: 'primary',    // 'primary' | 'second' | 'investment'
  propType:'sfr',        // 'sfr' | 'condo' | 'townhouse' | 'multi'
  dpAvail: null,         // available cash for DP ($), null = not set
  termYears: 30         // loan term in years
};

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
const fmt   = n => '$' + Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtR  = r => r.toFixed(3).replace(/0+$/,'').replace(/\.$/,'') + '%';
const fmtD  = n => '$' + Math.round(n).toLocaleString('en-US');
const clean = s => parseInt((s||'0').replace(/[^0-9]/g,''))||0;

function piPayment(principal, annualRate, n=360) {
  const r = annualRate / 100 / 12;
  return principal * r * Math.pow(1+r,n) / (Math.pow(1+r,n)-1);
}
function loanFromPayment(pmt, annualRate, n=360) {
  const r = annualRate / 100 / 12;
  return pmt * (Math.pow(1+r,n)-1) / (r * Math.pow(1+r,n));
}
// APR: Newton's method — net proceeds = PV(monthly payments)
function calcAPR(noteRate, loanAmt, financeCharges, n=360) {
  const netProc = loanAmt - financeCharges;
  if (netProc <= 0) return noteRate;
  const pmt = piPayment(loanAmt, noteRate, n);
  let r = noteRate / 100 / 12;
  for (let i=0; i<60; i++) {
    const pv = pmt * (1 - Math.pow(1+r,-n)) / r;
    const dpv = pmt * (n * Math.pow(1+r,-(n+1)) / r - (1-Math.pow(1+r,-n)) / (r*r));
    const dr = (pv - netProc) / dpv;
    r -= dr;
    if (Math.abs(dr) < 1e-8) break;
  }
  return r * 12 * 100;
}

// ═══════════════════════════════════════════════════════════
// CALC CORE — returns all display values
// ═══════════════════════════════════════════════════════════
function calcAll() {
  const credit = S.credit;
  const income = S.income;
  const debts  = S.debts;
  const lt     = S.loanType;

  const isFHA = lt === 'fha';
  const isVA  = lt === 'va';
  const isConv = lt === 'conventional';

  // Par rate lookup — VA uses conventional par minus spread
  let parRate;
  if (isFHA)  parRate = FHA_PAR[credit];
  else if (isVA) parRate = CONV_PAR[credit] != null ? Math.round((CONV_PAR[credit] - VA_PAR_SPREAD) * 1000) / 1000 : null;
  else         parRate = CONV_PAR[credit];

  const rate = (S.selRate !== null) ? S.selRate : parRate;
  const termSpread = S.termYears===15?-0.625:S.termYears===20?-0.375:S.termYears===25?-0.125:0;
  const r    = (rate + termSpread) / 100 / 12;
  const n    = (S.termYears || 30) * 12;
  const piFactorPerDollar = r * Math.pow(1+r,n) / (Math.pow(1+r,n)-1);

  // ── Down payment pct by loan type + occupancy + FTHB status ──
  // FHA / VA: primary residence only (enforced by toggle logic)
  // Conventional primary FTHB 620+: 3% (Fannie 97 / HomeReady / HomePossible)
  // Conventional primary non-FTHB:  5%
  // Conventional second home:       10%  (Fannie/Freddie guideline)
  // Conventional investment:        20%  (standard minimum)
  let dpPct;
  if (isVA) {
    dpPct = 0.00;
  } else if (isFHA) {
    dpPct = 0.035;
  } else {
    // Conventional
    if (S.propUse === 'investment') {
      dpPct = 0.20;
    } else if (S.propUse === 'second') {
      dpPct = 0.10;
    } else {
      // Primary — FTHB with 620+ qualifies for 3% (Fannie 97)
      const fthb3pct = S.isFTHB && CONV_PAR[credit] !== undefined;
      dpPct = fthb3pct ? 0.03 : 0.05;
    }
  }
  const ltvPct = 1 - dpPct;

  // Financed upfront fee (FHA UFMIP or VA Funding Fee)
  let upfrontFeePct = 0;
  if (isFHA) upfrontFeePct = FHA_UFMIP;
  if (isVA)  upfrontFeePct = S.isFTHB ? VA_FUNDING_FEE_FIRST : VA_FUNDING_FEE_SUBSEQ;

  // loanFactor: base loan ratio × (1 + upfront fee)
  const loanFactor = ltvPct * (1 + upfrontFeePct / 100);

  // Monthly MI per dollar of homePrice
  const miPerHomePrice = isFHA
    ? (ltvPct * FHA_MIP_ANNUAL / 100 / 12)
    : (!isVA && dpPct < 0.20 ? (PMI_RATE[credit]||0.80) / 100 / 12 * ltvPct : 0);
  // VA has NO monthly MI

  // Max monthly housing budget — DTI cap: Conv/FHA 47% front-end, VA 50% back-end
  const maxBudget = S.editPayment !== null
    ? S.editPayment
    : Math.max(0, (income / 12 * (isVA ? 0.50 : 0.47)) - debts);

  // Algebraic solve for homePrice
  const availForHome = maxBudget - S.hoa;
  const homeCoeff = loanFactor * piFactorPerDollar + miPerHomePrice + TAX_RATE/12 + INS_RATE/12;
  let homePrice = homeCoeff > 0 ? availForHome / homeCoeff : 0;

  // If user specified available down payment cash, cap home price
  // so their DP cash covers the required minimum down
  if (!isVA && S.dpAvail !== null && S.dpAvail > 0) {
    const minDpPct = isFHA ? 0.035 : 0.05;
    const maxHomePriceFromCash = S.dpAvail / minDpPct;
    if (maxHomePriceFromCash < homePrice) homePrice = maxHomePriceFromCash;
  }

        // PMI override: if user's actual down payment >= 20%, eliminate PMI for conventional
        let miPerHPEffective = miPerHomePrice;
        if (!isVA && !isFHA && miPerHomePrice > 0 && S.dpAvail != null && S.dpAvail / homePrice >= 0.20) {
          miPerHPEffective = 0;
          const hcNoPMI = homeCoeff - miPerHomePrice;
          if (hcNoPMI > 0) homePrice = availForHome / hcNoPMI;
        }
  const baseLoan    = homePrice * ltvPct;
  const upfrontAmt  = baseLoan * upfrontFeePct / 100;
  const totalLoan   = baseLoan + upfrontAmt;
  const downAmt     = homePrice * dpPct;

  const piMonthly   = piPayment(totalLoan, rate);
  const miMonthly   = homePrice * miPerHPEffective;
  const taxMonthly  = homePrice * TAX_RATE / 12;
  const insMonthly  = homePrice * INS_RATE / 12;
  const totalMonthly = piMonthly + miMonthly + taxMonthly + insMonthly + S.hoa;

  // Cash to close
  const closingCosts = totalLoan * 0.025;
  const ctc = downAmt + closingCosts;

  return {
    homePrice, baseLoan, totalLoan, downAmt, upfrontAmt, upfrontFeePct,
    dpPct, isFHA, isVA, isConv, rate, parRate,
    piMonthly, miMonthly, taxMonthly, insMonthly,
    totalMonthly, ctc, closingCosts
  };
}

// ═══════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════
function render() {
  if (!S.credit || !S.income) return;
  const v = calcAll();

  // Metric cards
  document.getElementById('mc-purchase').textContent     = fmtD(v.homePrice);
  document.getElementById('mc-purchase-max').textContent = fmtD(v.homePrice);

  if (S.editPayment === null) {
    numFmt('monthly-input', v.totalMonthly.toFixed(2));
  }

  document.getElementById('mc-ctc').textContent  = fmtD(v.ctc);
  document.getElementById('mc-ctc-sub').textContent = `${fmtD(v.downAmt)} down + ${fmtD(v.closingCosts)} closing`;

  // Down payment bar
  document.getElementById('dp-label').textContent = fmtD(v.downAmt);
  document.getElementById('dp-pct-label').textContent = (v.dpPct*100).toFixed(1) + '%';
  document.getElementById('loan-badge').textContent = v.isFHA ? 'FHA Loan' : v.isVA ? 'VA Loan 🎖️' : 'Conventional Loan';

  // Assumptions sidebar
  document.getElementById('dp-val').textContent  = v.isVA ? '0% (VA)' : (v.dpPct*100).toFixed(1) + '%';
  document.getElementById('lt-val').textContent  = v.isFHA ? 'FHA' : v.isVA ? 'VA' : 'Conventional';
  document.getElementById('rate-val').textContent = fmtR(v.rate);
  document.getElementById('term-val').textContent = (S.termYears||30) + ' Years Fixed';

  // Mortgage breakdown
  document.getElementById('bd-total').textContent = fmtD(v.totalMonthly);
  document.getElementById('bd-pi').textContent    = fmt(v.piMonthly);
  numFmt('bd-mi',  v.miMonthly.toFixed(2));
  numFmt('bd-tax', v.taxMonthly.toFixed(2));
  numFmt('bd-ins', v.insMonthly.toFixed(2));
  document.getElementById('mi-label').textContent = v.isFHA ? 'Mortgage Insurance (MIP)' : v.isVA ? 'Mortgage Insurance (None — VA)' : 'Private Mortgage Insurance (PMI)';

  // Stack bar
  const t = v.totalMonthly || 1;
  document.getElementById('stack-bar').innerHTML = `
    <div class="stack-seg" style="width:${v.piMonthly/t*100}%;background:#1e6fd9"></div>
    <div class="stack-seg" style="width:${v.miMonthly/t*100}%;background:#86efac"></div>
    <div class="stack-seg" style="width:${v.taxMonthly/t*100}%;background:#c4b5fd"></div>
    <div class="stack-seg" style="width:${v.insMonthly/t*100}%;background:#e2e8f0"></div>
    <div class="stack-seg" style="width:${S.hoa/t*100}%;background:#93c5fd"></div>`;

  // CTC breakdown
  document.getElementById('ctc-total-disp').textContent = fmtD(v.ctc);
  const upfrontLabel = v.isFHA
    ? `Upfront MIP (1.75%, financed)`
    : v.isVA ? `VA Funding Fee (${v.upfrontFeePct.toFixed(2)}%, financed)` : '';
  document.getElementById('ctc-rows').innerHTML = `
    <div class="ctc-row"><span class="ctc-key">Down Payment (${(v.dpPct*100).toFixed(1)}%)</span><span class="ctc-val">${fmtD(v.downAmt)}</span></div>
    ${(v.isFHA || v.isVA) ? `<div class="ctc-row"><span class="ctc-key">${upfrontLabel}</span><span class="ctc-val" style="color:#718096">~${fmtD(v.upfrontAmt)}</span></div>` : ''}
    <div class="ctc-row"><span class="ctc-key">Est. Closing Costs (~2.5%)</span><span class="ctc-val">${fmtD(v.closingCosts)}</span></div>
    <div class="ctc-row total"><span class="ctc-key">Total Cash to Close</span><span class="ctc-val">${fmtD(v.ctc)}</span></div>`;

  // Rate cur display
  document.getElementById('rate-cur-disp').textContent = fmtR(v.rate);

  // Rate options
  renderRateOptions(v);
}

function numFmt(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  const active = document.activeElement === el;
  if (!active) {
    const n = parseFloat(val);
    el.value = isNaN(n) ? '0.00' : n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  }
}

function renderRateOptions(v) {
  const par = v.parRate;
  const loan = v.totalLoan;
  // Steps: par-1.0% to par+0.5% in 0.125% increments
  const steps = [-8,-7,-6,-5,-4,-3,-2,-1,0,2,4]; // ×0.125%
  const list = document.getElementById('rate-options-list');
  list.innerHTML = '';

  steps.forEach(step => {
    const rateVal = Math.round((par + step * 0.125) * 1000) / 1000;
    if (rateVal <= 0) return;
    const diff = par - rateVal; // positive = below par (buyer pays), negative = above par (lender credit)
    // Cost/credit in dollars: 0.4 pts per 0.125% for buydowns, 0.25 pts per 0.125% for buyups
    const pts = diff > 0 ? diff / 0.125 * 0.4 : diff / 0.125 * 0.25;
    const dollarAmt = Math.abs(pts) * loan / 100;

    // APR calculation
    const finCharges = pts > 0 ? dollarAmt : 0; // only count costs for APR
    const apr = calcAPR(rateVal, loan, finCharges);

    const isSelected = Math.abs(rateVal - v.rate) < 0.001;
    const isCost = pts > 0.005;
    const isCredit = pts < -0.005;

    const pillClass = isCost ? 'cost' : isCredit ? 'credit' : 'par';
    const pillText = isCost ? `${fmt(dollarAmt)} Cost`
                  : isCredit ? `${fmt(dollarAmt)} Credit`
                  : 'Par Rate';

    const div = document.createElement('div');
    div.className = 'rate-option' + (isSelected ? ' selected' : '');
    div.innerHTML = `
      <div class="rate-option-left">
        <div class="rate-pct">${fmtR(rateVal)} Interest Rate</div>
        <div class="rate-apr">${fmtR(apr)} APR <span class="apr-q" data-t="APR includes discount points amortized over 30 years">?</span></div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span class="rate-cost-pill ${pillClass}">${pillText}</span>
        <div class="rate-radio"></div>
      </div>`;
    div.addEventListener('click', () => {
      S.selRate = rateVal;
      render();
    });
    list.appendChild(div);
  });
}

// ═══════════════════════════════════════════════════════════
// LOAN TYPE TOGGLE
// ═══════════════════════════════════════════════════════════
function setLoanType(type) {
  S.loanType = type;
  S.selRate = null;
  document.getElementById('btn-conv').classList.toggle('active', type === 'conventional');
  document.getElementById('btn-fha').classList.toggle('active', type === 'fha');
  document.getElementById('btn-va').classList.toggle('active', type === 'va');
  render();
}

function updateLoanToggle(credit) {
  const convBtn = document.getElementById('btn-conv');
  const fhaBtn  = document.getElementById('btn-fha');
  const vaBtn   = document.getElementById('btn-va');

  const isPrimary = S.propUse === 'primary';
  const convOK = CONV_PAR[credit] !== undefined;
  // FHA & VA: primary residence only (per HUD and VA guidelines)
  const fhaOK  = isPrimary && FHA_PAR[credit] !== null && FHA_PAR[credit] !== undefined;
  const vaOK   = isPrimary && S.isVA && convOK;

  // Show/hide buttons
  convBtn.disabled = !convOK;
  fhaBtn.disabled  = !fhaOK;
  fhaBtn.style.display = fhaOK ? '' : 'none'; // hide entirely for investment/second
  vaBtn.style.display  = vaOK  ? '' : 'none';

  // Force-switch away from unavailable types
  if (S.loanType === 'fha' && !fhaOK) S.loanType = convOK ? 'conventional' : null;
  if (S.loanType === 'va'  && !vaOK)  S.loanType = fhaOK  ? 'fha' : 'conventional';
  if (S.loanType === 'conventional' && !convOK) S.loanType = fhaOK ? 'fha' : null;

  // For investment/second home with no FHA — always conventional
  if (!isPrimary && S.loanType !== 'conventional') S.loanType = 'conventional';

  // Sync active buttons
  convBtn.classList.toggle('active', S.loanType === 'conventional');
  fhaBtn.classList.toggle('active',  S.loanType === 'fha');
  vaBtn.classList.toggle('active',   S.loanType === 'va');
}

// ═══════════════════════════════════════════════════════════
// BREAKDOWN EDITABLE INPUTS
// ═══════════════════════════════════════════════════════════
function onBdInput(field, val) {
  const n = parseFloat(val.replace(/[^0-9.]/g,''))||0;
  if (field==='mi')  { S.miOverride = n; }
  if (field==='tax') { S.taxOverride = n; }
  if (field==='ins') { S.insOverride = n; }
  if (field==='hoa') { S.hoa = n; }
  // Note: we don't re-render to avoid cursor jump — just update totals
  updateTotalDisplay();
}
function updateTotalDisplay() {
  const pi  = parseFloat((document.getElementById('bd-pi').textContent||'0').replace(/[$,]/g,''))||0;
  const mi  = parseFloat((document.getElementById('bd-mi').value||'0').replace(/,/g,''))||0;
  const tax = parseFloat((document.getElementById('bd-tax').value||'0').replace(/,/g,''))||0;
  const ins = parseFloat((document.getElementById('bd-ins').value||'0').replace(/,/g,''))||0;
  const hoa = parseFloat((document.getElementById('bd-hoa').value||'0').replace(/,/g,''))||0;
  const tot = pi + mi + tax + ins + hoa;
  document.getElementById('bd-total').textContent = fmtD(tot);
  document.getElementById('monthly-input').value = tot.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
}

// Monthly payment edit mode
document.getElementById('monthly-input').addEventListener('input', function() {
  const n = parseFloat(this.value.replace(/[^0-9.]/g,''));
  S.editPayment = isNaN(n) ? null : n;
  S.selRate = null;
  render();
});
document.getElementById('monthly-input').addEventListener('blur', function() {
  if (S.editPayment === null) render();
});

// ═══════════════════════════════════════════════════════════
// PROFILE INPUTS (right side)
// ═══════════════════════════════════════════════════════════
function onProfileChange() {
  const credit = document.getElementById('r-credit').value;
  const income = clean(document.getElementById('r-income').value);
  const debts  = clean(document.getElementById('r-debts').value);
  if (credit) S.credit = credit;
  S.income = income;
  S.debts  = debts;
  S.selRate = null;
  if (credit) updateLoanToggle(credit);
  render();
}
['r-income','r-debts'].forEach(id => {
  document.getElementById(id).addEventListener('input', function() {
    const raw = this.value.replace(/[^0-9]/g,'');
    this.value = raw ? Number(raw).toLocaleString('en-US') : '';
  });
});

// ═══════════════════════════════════════════════════════════
// ASSUMPTION CHANGE HANDLER
// ═══════════════════════════════════════════════════════════
function onAssumptionChange() {
  const vaEl   = document.getElementById('a-va');
  const fthbEl = document.getElementById('a-fthb');
  const useEl  = document.getElementById('a-use');
  const ptEl   = document.getElementById('a-proptype');
  const dpEl   = document.getElementById('a-dp');

  S.isVA    = vaEl   && vaEl.value   === 'yes';
  S.isFTHB  = fthbEl && fthbEl.value === 'yes';
  S.propUse = useEl  ? useEl.value   : 'primary';
  S.propType= ptEl   ? ptEl.value    : 'sfr';

  // Parse available down payment
  const rawDP = dpEl ? dpEl.value.replace(/[^0-9]/g,'') : '';
  S.dpAvail = rawDP ? parseInt(rawDP) : null;

  const termEl = document.getElementById('a-term');
  S.termYears = termEl ? parseInt(termEl.value) : 30;
  // Format DP input
  if (dpEl && rawDP) dpEl.value = Number(rawDP).toLocaleString('en-US');

  // Show occupancy note for non-primary
  const invNote = document.getElementById('invest-note');
  if (invNote) {
    if (S.propUse === 'investment') {
      invNote.style.display = 'block';
      invNote.innerHTML = '🏢 <strong>Investment Property:</strong> FHA &amp; VA not available. Conventional only with <strong>20% minimum down</strong>. Rates are typically 0.5–0.75% above primary residence rates.';
    } else if (S.propUse === 'second') {
      invNote.style.display = 'block';
      invNote.innerHTML = '🏖️ <strong>Second Home:</strong> FHA &amp; VA not available. Conventional only with <strong>10% minimum down</strong>. Must be 50+ miles from primary residence per Fannie/Freddie guidelines.';
    } else {
      invNote.style.display = 'none';
    }
  }

  // VA eligible toggle: switch to VA if eligible + primary + conv-eligible credit
  if (S.isVA && S.propUse === 'primary' && S.credit && CONV_PAR[S.credit] !== undefined) {
    if (S.loanType === 'fha') S.loanType = 'va'; // VA is better — auto-select
  }
  if (!S.isVA && S.loanType === 'va') {
    S.loanType = 'fha';
  }
  // Non-primary: force conventional
  if (S.propUse !== 'primary' && (S.loanType === 'fha' || S.loanType === 'va')) {
    S.loanType = 'conventional';
  }

  S.selRate = null;
  if (S.credit) updateLoanToggle(S.credit);

  render();

  // Update down-payment availability note
  if (S.dpAvail !== null && S.income > 0) {
    const v = calcAll();
    const minRequired = Math.round(v.homePrice * (S.isVA ? 0 : v.isFHA ? 0.035 : 0.05));
    const noteEl = document.getElementById('dp-avail-note');
    if (noteEl) {
      if (S.isVA) {
        noteEl.className = 'dp-avail-note ok';
        noteEl.textContent = '✅ VA loan requires $0 down — your cash covers closing costs and reserves.';
        noteEl.style.display = 'block';
      } else if (S.dpAvail >= minRequired) {
        noteEl.className = 'dp-avail-note ok';
        noteEl.textContent = `✅ Your $${S.dpAvail.toLocaleString()} covers the ${(v.dpPct*100).toFixed(1)}% minimum down ($${minRequired.toLocaleString()}) on this home.`;
        noteEl.style.display = 'block';
      } else {
        noteEl.className = 'dp-avail-note short';
        noteEl.textContent = `⚠️ Need $${minRequired.toLocaleString()} minimum down. Your $${S.dpAvail.toLocaleString()} is $${(minRequired-S.dpAvail).toLocaleString()} short — home price adjusted.`;
        noteEl.style.display = 'block';
      }
    }
  } else {
    const noteEl = document.getElementById('dp-avail-note');
    if (noteEl) noteEl.style.display = 'none';
  }
}

// ═══════════════════════════════════════════════════════════
// TAB SWITCH
// ═══════════════════════════════════════════════════════════
function switchTab(tab) {
  document.getElementById('tab-monthly').classList.toggle('active', tab==='monthly');
  document.getElementById('tab-ctc').classList.toggle('active', tab==='ctc');
  document.getElementById('tab-monthly-content').style.display = tab==='monthly' ? '' : 'none';
  document.getElementById('tab-ctc-content').style.display     = tab==='ctc'     ? '' : 'none';
}

// ═══════════════════════════════════════════════════════════
// FORM INPUT FORMATTING
// ═══════════════════════════════════════════════════════════
['income','debts'].forEach(id => {
  document.getElementById(id).addEventListener('input', function() {
    const raw = this.value.replace(/[^0-9]/g,'');
    this.value = raw ? Number(raw).toLocaleString('en-US') : '';
  });
});
document.getElementById('zip').addEventListener('input', e => {
  e.target.value = e.target.value.replace(/[^0-9]/g,'');
});

// ═══════════════════════════════════════════════════════════
// FORM SUBMIT
// ═══════════════════════════════════════════════════════════
let pendingData = null;

document.getElementById('calc-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const zip    = document.getElementById('zip').value.trim();
  const credit = document.getElementById('credit').value;
  const income = clean(document.getElementById('income').value);
  const debts  = clean(document.getElementById('debts').value);

  if (!zip || zip.length < 5)  { alert('Please enter a valid 5-digit ZIP code.'); return; }
  if (!credit)                  { alert('Please select your credit score range.'); return; }
  if (income <= 0)              { alert('Please enter your annual income.'); return; }

  if (credit === 'under580') {
    document.getElementById('form-section').style.display = 'none';
    document.getElementById('credit-help-section').style.display = 'flex';
    return;
  }

  launchResults({ zip, credit, income, debts }, '');
});

function closeModal() {
  document.getElementById('email-overlay').classList.remove('show');
  document.getElementById('email-error').style.display = 'none';
  document.getElementById('email-input').value = '';
}

function submitEmail() {
  const email = document.getElementById('email-input').value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    document.getElementById('email-error').style.display = 'block';
    return;
  }
  closeModal();
  launchResults(pendingData, email);
}

document.getElementById('email-input').addEventListener('keydown', e => {
  if (e.key==='Enter') submitEmail();
});

// ═══════════════════════════════════════════════════════════
// LAUNCH RESULTS
// ═══════════════════════════════════════════════════════════
function launchResults(data, email) {
  const { zip, credit, income, debts } = data;

  // Set state
  S.credit = credit;
  S.income = income;
  S.debts  = debts;
  S.zip    = zip;
  S.selRate = null;
  S.editPayment = null;
  S.hoa = 0;
  S.isVA    = false;
  S.isFTHB  = true;
  S.propUse = 'primary';
  S.propType= 'sfr';
  S.dpAvail = null;
  // Reset assumption UI
  if (document.getElementById('a-fthb'))    document.getElementById('a-fthb').value = 'yes';
  if (document.getElementById('a-va'))      document.getElementById('a-va').value = 'no';
  if (document.getElementById('a-use'))     document.getElementById('a-use').value = 'primary';
  if (document.getElementById('a-proptype')) document.getElementById('a-proptype').value = 'sfr';
  if (document.getElementById('a-dp'))      document.getElementById('a-dp').value = '';
  document.getElementById('dp-avail-note').style.display = 'none';
  document.getElementById('invest-note').style.display = 'none';

  // Populate right panel inputs
  document.getElementById('r-zip').value = zip;
  document.getElementById('r-credit').value = credit;
  document.getElementById('r-income').value = income.toLocaleString('en-US');
  document.getElementById('r-debts').value  = debts.toLocaleString('en-US');

  // Determine default loan type
  const convOK = CONV_PAR[credit] !== undefined;
  const fhaOK  = FHA_PAR[credit] !== null && FHA_PAR[credit] !== undefined;
  S.loanType = fhaOK ? 'fha' : 'conventional';
  document.getElementById('btn-conv').classList.toggle('active', S.loanType==='conventional');
  document.getElementById('btn-fha').classList.toggle('active', S.loanType==='fha');
  updateLoanToggle(credit);

  // Sub text
  const creditLabel = {'580-599':'580–599','600-619':'600–619','620-639':'620–639','640-659':'640–659','660-679':'660–679','680-699':'680–699','700-719':'700–719','720-739':'720–739','740-759':'740–759','760-779':'760–779','780+':'780+'}[credit]||credit;
  document.getElementById('res-sub').textContent = `ZIP: ${zip} · Credit: ${creditLabel} · Income: ${fmtD(income)}/yr`;

  // Show results
  document.getElementById('form-section').style.display = 'none';
  document.getElementById('credit-help-section').style.display = 'none';
  document.getElementById('results-section').style.display = 'block';

  // Swap hero banner to results CTA
  document.getElementById('hero-banner').innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" style="vertical-align:middle;margin-right:6px"><path stroke="#ffffff" fill="none" d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.01 1.18 2 2 0 012 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14z"/></svg>Have questions about your results? <span>Call or text Luis Lopez · <strong>(520) 971-0603</strong> · No obligation</span>';

  render();
  if(!sessionStorage.getItem('tourDone_v2'))setTimeout(_startTour,900);
  window.scrollTo({top:0, behavior:'smooth'});
}

// ═══════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════
function resetForm() {
  S.editPayment = null;
  document.getElementById('form-section').style.display = 'flex';
  document.getElementById('credit-help-section').style.display = 'none';
  document.getElementById('results-section').style.display = 'none';
  // Restore original banner
  document.getElementById('hero-banner').innerHTML =
    '🛡️ Just 4 questions to unlock your Buying Power <span>No credit check · No sales calls · 100% Free</span>';
  window.scrollTo({top:0, behavior:'smooth'});
}

function openExpertModal() {
  // Copy photo src from header circle into modal
  const headerPhoto = document.getElementById('agent-headshot');
  if (headerPhoto) document.getElementById('expertModalPhoto').src = headerPhoto.src;
  // Pre-fill buying power if results are visible
  const bpEl = document.querySelector('.home-price-val, .result-home-price, [data-hp]');
  if (bpEl) window._calcBP = bpEl.textContent.trim();
  document.getElementById('expertModal').style.display = 'flex';
  document.getElementById('expertFormWrap').style.display = 'block';
  document.getElementById('expertSuccess').style.display = 'none';
  document.getElementById('expertSubmitBtn').disabled = false;
  document.getElementById('expertSubmitBtn').textContent = 'Get a Call Back →';
}

// ═══════════════════════════════════════════════════════════
// LIVE RATE FETCH  (Homebuyer.com / Optimal Blue · daily)
// Maps our best-tier (780+) conventional rate to the live
// Optimal Blue benchmark and shifts all tiers proportionally.
// Falls back silently to hardcoded tables if API is unavailable.
// ═══════════════════════════════════════════════════════════
const CONV_ANCHOR = 6.000; // hardcoded CONV_PAR['780+'] baseline

async function fetchLiveRates() {
  try {
    const res = await fetch('https://api.homebuyer.com/rates?state=AZ&fico=1&ltv=2', {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Prefer Optimal Blue rate; fall back to generic 30yr rate
    const liveRate = parseFloat(data.optimal_blue_rate || data.rate_30yr);
    if (!liveRate || isNaN(liveRate) || liveRate < 2 || liveRate > 15) throw new Error('Rate out of range');

    // Shift = difference between live market and our baseline anchor
    const shift = parseFloat((liveRate - CONV_ANCHOR).toFixed(3));

    // Apply shift to all conventional tiers
    Object.keys(CONV_PAR).forEach(k => {
      CONV_PAR[k] = Math.round((CONV_PAR[k] + shift) * 1000) / 1000;
    });
    // Apply same market shift to FHA tiers (they move with conventional)
    Object.keys(FHA_PAR).forEach(k => {
      if (FHA_PAR[k] !== null) FHA_PAR[k] = Math.round((FHA_PAR[k] + shift) * 1000) / 1000;
    });

    // Format display date
    let dateStr = 'Today';
    if (data.last_updated) {
      const d = new Date(data.last_updated);
      if (!isNaN(d)) dateStr = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    } else {
      dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }

    // Update rate notice on form page
    const notice = document.querySelector('.rate-notice span');
    if (notice) notice.innerHTML = `Rates updated <strong>${dateStr}</strong> — 30-yr conventional avg: <strong>${liveRate.toFixed(3)}%</strong> · Source: Optimal Blue`;

    // Update rate source line in rate selection panel
    const rateSrc = document.querySelector('.rate-source');
    if (rateSrc) rateSrc.textContent = `Live rates · ${dateStr}`;

    console.log(`[RateSync] Shift: ${shift >= 0 ? '+' : ''}${shift}% · As of: ${dateStr}`);
  } catch (err) {
    console.log('[RateSync] Using hardcoded fallback rates.', err.message);
    // No UI change — hardcoded tables remain in place
  }
}

// Kick off live rate fetch immediately
fetchLiveRates();



async function submitExpertForm() {
  var name  = document.getElementById('expertName').value.trim();
  var phone = document.getElementById('expertPhone').value.trim();
  var email = document.getElementById('expertEmail').value.trim();
  var lang  = document.getElementById('expertLang').value;
  if (!name || !phone || !email) { alert('Please fill in all required fields.'); return; }
  var btn = document.getElementById('expertSubmitBtn');
  btn.disabled = true; btn.textContent = 'Sending…';
  var fd = new FormData();
  fd.append('name', name);
  fd.append('phone', phone);
  fd.append('email', email);
  fd.append('language', lang);
  if (window._calcBP) fd.append('buyingPower', window._calcBP);
  fd.append('source', 'Calculator — Talk to an Expert');
  try {
    await fetch('https://hook.us2.make.com/yva8wlu9q65s6l8fj0dq2gd4rwqrpoce', { method:'POST', body: fd });
    document.getElementById('expertFormWrap').style.display = 'none';
    document.getElementById('expertSuccess').style.display  = 'block';
  } catch(e) {
    btn.disabled = false; btn.textContent = 'Get a Call Back →';
    alert('Something went wrong. Please try calling (520) 971-0603 directly.');
  }
}



function toggleScenario(){
  var b=document.getElementById('sc-body'),c=document.getElementById('sc-chevron');
  var open=b.style.display==='none';
  b.style.display=open?'block':'none';
  c.textContent=open?'▲':'▼';
}
function runScenario(){
  var price=parseFloat((document.getElementById('sc-price').value||'').replace(/[^0-9.]/g,''))||0;
  var dp=parseFloat((document.getElementById('sc-dp').value||'').replace(/[^0-9.]/g,''))||0;
  var res=document.getElementById('sc-result');
  if(!price||price<50000){res.style.display='none';return;}
  var rEl=document.getElementById('rate-val');
  var baseRate=parseFloat((rEl?rEl.textContent:'0').replace('%',''));
  if(!baseRate){res.style.display='none';return;}
  var loan=Math.max(price-dp,0),dpPct=price>0?dp/price:0;
  var ty=S.termYears||30;
  var ts=ty===15?-0.625:ty===20?-0.375:ty===25?-0.125:0;
  var r=(baseRate+ts)/100/12,n=ty*12;
  var pi=r>0?loan*(r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1)):loan/n;
  var pmi=(!S.isVA&&dpPct<0.20)?loan*0.008/12:0;
  var need=pmi>0?Math.round(0.20*price-dp):0;
  var extra=pmi>0
    ?'<span style="color:#c0392b">· $'+Math.round(pmi)+'/mo PMI (need $'+need.toLocaleString()+' more down to avoid)</span>'
    :'<span style="color:#27ae60">✓ No PMI at this down payment</span>';
  res.style.display='block';
  res.innerHTML='<div style="font-size:18px;font-weight:700;color:#1a1a2e;margin-bottom:6px">P&amp;I: $'+Math.round(pi).toLocaleString()+'/mo</div>'+extra;
}
function _startTour(){
  if(sessionStorage.getItem('tourDone_v2'))return;
  var steps=[
    {id:'tour-mortgage-hdr',label:'Your Mortgage Summary',tip:'This section shows your estimated Purchase Power (the max home price you may qualify for), Monthly Payment, and Cash to Close. The loan type badge shows which program — FHA, Conventional, or VA — best fits your profile.'},
    {id:'tour-profile',label:'Financial Profile',tip:'This is your control panel. Update your income, monthly debts, credit score, ZIP code, VA eligibility, first-time buyer status, and property type here. Every change instantly recalculates your estimate.'},
    {id:'tour-breakdown',label:'Mortgage Breakdown',tip:'See exactly where your monthly payment goes: Principal & Interest, Mortgage Insurance if applicable, Property Taxes, and Homeowners Insurance. Switch to the Cash to Close tab for a full breakdown of upfront closing costs.'},
    {id:'tour-rate',label:'Rate Selection',tip:'These are real-time estimated rates for your scenario. Select any rate to instantly see how your monthly payment shifts. Better credit profiles typically qualify for lower rates.'},
    {id:'tour-disclaimer',label:'Educational Estimate Only',tip:'This is a planning tool — not a rate lock, quote, or lending commitment. Actual rates and payments depend on a full application, credit review, property appraisal, and lender approval.'},
    {id:'tour-expert',label:'Talk to Luis',tip:'Ready for a real quote or have questions? Click here to send your results directly to Luis Lopez, a licensed mortgage professional. No obligation — just honest guidance.'}
  ];
  var i=0;
  function cleanup(){
    var o=document.getElementById('_tb');
    if(o){if(o._t){o._t.style.outline='';o._t.style.outlineOffset='';o._t.style.boxShadow='';}o.remove();}
  }
  function skip(){cleanup();sessionStorage.setItem('tourDone_v2','1');}
  function next(){
    cleanup();
    if(i>=steps.length){sessionStorage.setItem('tourDone_v2','1');return;}
    var tgt=document.getElementById(steps[i].id);
    if(!tgt){i++;next();return;}
    tgt.scrollIntoView({behavior:'smooth',block:'nearest'});
    var rect=tgt.getBoundingClientRect();
    tgt.style.outline='3px solid #e74c3c';
    tgt.style.outlineOffset='5px';
    tgt.style.boxShadow='0 0 0 8px rgba(231,76,60,0.12)';
    var b=document.createElement('div');
    b.id='_tb';b._t=tgt;
    var spaceBelow=window.innerHeight-rect.bottom;
    var top=spaceBelow>200?rect.bottom+14:Math.max(8,rect.top-210);
    var left=Math.max(8,Math.min(rect.left+rect.width/2-145,window.innerWidth-300));
    b.style.cssText='position:fixed;z-index:10000;top:'+top+'px;left:'+left+'px;width:288px;background:#fff;border:2px solid #e74c3c;border-radius:12px;padding:14px 14px 12px;box-shadow:0 8px 32px rgba(231,76,60,.22);font-family:inherit;';
    b.innerHTML='<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px"><span style="font-size:13px;font-weight:700;color:#e74c3c;letter-spacing:.2px">'+steps[i].label+'</span><button id="_tb-x" style="background:none;border:none;color:#bbb;font-size:16px;cursor:pointer;padding:0;line-height:1">&#x2715;</button></div><p style="font-size:12px;line-height:1.6;color:#444;margin:0 0 12px">'+steps[i].tip+'</p><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:11px;color:#ccc">'+(i+1)+' of '+steps.length+'</span><div style="display:flex;gap:8px"><button id="_tb-skip" style="background:none;border:1px solid #eee;color:#aaa;font-size:11px;padding:4px 10px;border-radius:6px;cursor:pointer">Skip Tour</button><button id="_tb-next" style="background:#e74c3c;border:none;color:#fff;font-size:12px;font-weight:600;padding:5px 14px;border-radius:6px;cursor:pointer">'+(i<steps.length-1?'Next →':'Done ✓')+'</button></div></div>';
    document.body.appendChild(b);
    document.getElementById('_tb-x').onclick=skip;
    document.getElementById('_tb-skip').onclick=skip;
    document.getElementById('_tb-next').onclick=function(){i++;next();};
  }
  next();
}
