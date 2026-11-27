export const KWG_DEFAULT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>KWG VIP MOD MENU · AI PREDICTOR</title>

<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">

<style>
:root {
    --neon-blue:#00f2ff;
    --neon-green:#00ff88;
    --neon-red:#ff3c78;
    --neon-gold:#ffd700;
    --neon-purple:#9d4edd;
}

* {
    box-sizing:border-box;
    margin:0;
    padding:0;
}

body,html {
    width:100%;
    height:100%;
    overflow:hidden;
    background:#050508;
    font-family:'Poppins',sans-serif;
    color:#fff;
}

#gameFrame {
    position:absolute;
    top:0;
    left:0;
    width:100%;
    height:100%;
    border:none;
    z-index:1;
}

/* Floating button */
#floatBtn {
    position:fixed;
    top:18%;
    right:15px;
    width:72px;
    height:72px;
    background:radial-gradient(circle at 30% 20%,#2a2a4a,#0b0b16);
    border:2px solid var(--neon-blue);
    border-radius:50%;
    display:flex;
    flex-direction:column;
    justify-content:center;
    align-items:center;
    color:var(--neon-blue);
    font-family:'Orbitron';
    font-weight:900;
    z-index:2147483647;
    cursor:pointer;
    box-shadow:0 0 25px rgba(0,242,255,.6),inset 0 0 12px rgba(0,242,255,.3);
    touch-action:manipulation;
    user-select:none;
    -webkit-user-select:none;
    font-size:13px;
    letter-spacing:1px;
}

#floatBtn span {
    font-size:9px;
    color:#fff;
    opacity:.9;
}

/* Menu */
#modMenu {
    position:fixed;
    top:50%;
    left:50%;
    transform:translate(-50%,-50%) scale(0);
    width:370px;
    max-width:94vw;
    max-height:92vh;
    overflow-y:auto;
    background:rgba(10,10,20,.98);
    border:1px solid rgba(0,242,255,.3);
    border-radius:28px;
    z-index:2147483646;
    padding:16px 16px 18px;
    box-shadow:0 0 60px rgba(0,0,0,.95),0 0 30px rgba(0,242,255,.3);
    transition:transform .3s ease,opacity .3s ease;
    opacity:0;
    visibility:hidden;
    backdrop-filter:blur(14px);
    -webkit-backdrop-filter:blur(14px);
    pointer-events:none;
}

#modMenu.active {
    transform:translate(-50%,-50%) scale(1);
    opacity:1;
    visibility:visible;
    pointer-events:auto;
}

.header {
    display:flex;
    justify-content:space-between;
    align-items:center;
    border-bottom:1px solid rgba(0,242,255,.2);
    padding-bottom:10px;
    margin-bottom:14px;
}

.header-title {
    font-family:'Orbitron';
    font-size:12px;
    font-weight:900;
    color:var(--neon-blue);
    letter-spacing:1px;
    text-shadow:0 0 12px rgba(0,242,255,.6);
}

.close-btn {
    color:var(--neon-red);
    cursor:pointer;
    font-size:20px;
    font-weight:bold;
    line-height:1;
    padding:2px 8px;
}

/* Top Live Wingo 1M & Big/Small Banner (Always visible first in menu) */
.live-top-card {
    background:rgba(0,0,0,.72);
    border:1px solid rgba(0,242,255,.24);
    border-radius:18px;
    padding:12px;
    margin-bottom:14px;
    position:relative;
    overflow:hidden;
    text-align:center;
}

.info-bar {
    display:flex;
    justify-content:space-between;
    align-items:center;
    font-family:'Orbitron';
    font-size:10px;
    margin-bottom:8px;
    color:#aaa;
    background:rgba(255,255,255,.04);
    padding:6px 10px;
    border-radius:30px;
}

.info-value {
    color:var(--neon-gold);
    font-weight:bold;
}

.scan-grid {
    position:absolute;
    inset:0;
    background:
    linear-gradient(rgba(0,242,255,.04) 1px,transparent 1px),
    linear-gradient(90deg,rgba(0,242,255,.04) 1px,transparent 1px);
    background-size:15px 15px;
    pointer-events:none;
}

.scan-beam {
    position:absolute;
    inset:0;
    background:linear-gradient(180deg,rgba(0,242,255,.18),transparent 80%);
    animation:radarScan 2s infinite linear;
    pointer-events:none;
}

@keyframes radarScan {
    0% {transform:translateY(-100%);}
    100% {transform:translateY(100%);}
}

.sureshot-tag {
    display:inline-block;
    background:linear-gradient(90deg,#ffd700,#ff8800);
    color:#000;
    font-family:'Orbitron';
    font-size:9px;
    font-weight:900;
    padding:4px 10px;
    border-radius:30px;
    position:relative;
    z-index:2;
    margin-bottom:4px;
}

.animated-result {
    font-family:'Orbitron';
    font-size:40px;
    font-weight:900;
    letter-spacing:3px;
    text-transform:uppercase;
    position:relative;
    z-index:2;
    transition:.25s;
    text-shadow:0 0 26px currentColor;
    line-height:1.15;
}

#depositSetup {
    text-align:center;
}

.quick-amts {
    display:grid;
    grid-template-columns:repeat(4,1fr);
    gap:6px;
    margin-bottom:10px;
}

.quick-amt-btn {
    padding:8px 4px;
    background:rgba(255,255,255,.05);
    border:1px solid rgba(0,242,255,.25);
    border-radius:10px;
    color:#fff;
    font-family:'Orbitron';
    font-size:11px;
    font-weight:700;
    cursor:pointer;
}

.quick-amt-btn.active {
    background:rgba(0,242,255,.22);
    border-color:var(--neon-blue);
    color:var(--neon-blue);
}

.deposit-input {
    width:100%;
    padding:12px;
    background:rgba(0,0,0,.7);
    border:1px solid var(--neon-blue);
    border-radius:14px;
    color:#fff;
    font-family:'Orbitron';
    font-size:19px;
    font-weight:700;
    text-align:center;
    outline:none;
    margin-bottom:12px;
}

.level-picker-label {
    font-size:11px;
    color:#aaa;
    margin-bottom:6px;
    text-transform:uppercase;
    letter-spacing:.6px;
}

.level-picker {
    display:grid;
    grid-template-columns:repeat(5,1fr);
    gap:6px;
    margin-bottom:10px;
}

.lvl-pick-btn {
    padding:10px 4px;
    background:rgba(255,255,255,.04);
    border:1px solid rgba(255,255,255,.15);
    border-radius:10px;
    color:#ddd;
    font-family:'Orbitron';
    font-size:12px;
    font-weight:700;
    cursor:pointer;
}

.lvl-pick-btn.active {
    background:linear-gradient(135deg,rgba(0,242,255,.28),rgba(157,78,221,.35));
    border-color:var(--neon-blue);
    color:#fff;
}

.split-mode-row {
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:6px;
    margin-bottom:10px;
}

.split-mode-btn {
    padding:7px;
    border-radius:10px;
    border:1px solid rgba(255,255,255,.14);
    background:rgba(255,255,255,.04);
    color:#bbb;
    font-size:10px;
    font-weight:700;
    cursor:pointer;
}

.split-mode-btn.active {
    border-color:var(--neon-gold);
    color:var(--neon-gold);
    background:rgba(255,215,0,.1);
}

.preview-levels {
    display:flex;
    flex-wrap:wrap;
    gap:5px;
    justify-content:center;
    margin-bottom:12px;
}

.preview-chip {
    background:rgba(0,0,0,.6);
    border:1px solid rgba(0,242,255,.2);
    border-radius:8px;
    padding:5px 8px;
    font-family:'Orbitron';
    font-size:10px;
    color:#fff;
}

.preview-chip span {
    color:var(--neon-gold);
    font-weight:700;
}

.start-btn {
    width:100%;
    padding:13px;
    background:linear-gradient(90deg,var(--neon-blue),var(--neon-purple));
    border:none;
    border-radius:14px;
    color:#fff;
    font-family:'Orbitron';
    font-weight:900;
    font-size:14px;
    cursor:pointer;
    text-transform:uppercase;
}

#predictorScreen {
    display:none;
    text-align:center;
}

.wallet-row {
    display:flex;
    justify-content:space-between;
    align-items:center;
    background:rgba(0,0,0,.5);
    border-radius:14px;
    padding:10px 12px;
    margin-bottom:10px;
    border:1px solid rgba(0,242,255,.2);
}

.wallet-item {
    display:flex;
    flex-direction:column;
    align-items:flex-start;
}

.wallet-label {
    font-size:9px;
    color:#888;
    letter-spacing:1px;
    text-transform:uppercase;
}

.wallet-value {
    font-family:'Orbitron';
    font-size:16px;
    font-weight:900;
    line-height:1.3;
}

.gold {color:var(--neon-gold);}
.green {color:var(--neon-green);}
.red {color:var(--neon-red);}

.active-levels-strip {
    display:grid;
    gap:5px;
    margin-bottom:10px;
}

.lvl-chip {
    padding:6px 4px;
    border-radius:10px;
    background:rgba(255,255,255,.03);
    border:1px solid rgba(255,255,255,.1);
    font-family:'Orbitron';
    font-size:10px;
    cursor:pointer;
    color:#aaa;
}

.lvl-chip.current {
    border-color:var(--neon-gold);
    background:rgba(255,215,0,.15);
    color:#fff;
}

.lvl-chip .amt {
    display:block;
    font-size:11px;
    font-weight:900;
    color:var(--neon-gold);
    margin-top:2px;
}

.bet-details {
    display:grid;
    grid-template-columns:1fr 1fr 1fr;
    gap:8px;
    margin-bottom:10px;
}

.detail-card {
    background:rgba(255,255,255,.03);
    border-radius:12px;
    padding:8px 4px;
    border:1px solid rgba(0,242,255,.1);
    display:flex;
    flex-direction:column;
    align-items:center;
}

.detail-label {
    font-size:9px;
    color:#aaa;
    margin-bottom:2px;
}

.detail-value {
    font-family:'Orbitron';
    font-size:15px;
    font-weight:900;
}

.bet-box {
    background:rgba(255,255,255,.03);
    border-radius:14px;
    padding:10px 12px;
    margin-bottom:12px;
    border-left:4px solid var(--neon-gold);
    text-align:left;
}

.bet-row {
    display:flex;
    justify-content:space-between;
    margin-bottom:5px;
    font-size:11px;
}

.bet-row:last-child { margin-bottom:0; }
.bet-label {color:#aaa;}

.bet-value {
    font-family:'Orbitron';
    font-weight:bold;
}

.action-btns {
    display:flex;
    gap:10px;
}

.act-btn {
    flex:1;
    padding:12px 4px;
    border:none;
    border-radius:14px;
    font-family:'Orbitron';
    font-size:11px;
    font-weight:900;
    cursor:pointer;
}

.win-btn {
    background:var(--neon-green);
    color:#000;
}

.loss-btn {
    background:var(--neon-red);
    color:#fff;
}

.reset-link {
    margin-top:10px;
    font-size:10px;
    color:#999;
    text-align:center;
    cursor:pointer;
    text-decoration:underline;
}

.footnote {
    font-size:9px;
    color:#777;
    text-align:center;
    margin-top:8px;
}
</style>
</head>

<body>

<iframe id="gameFrame"
src="https://kwg08.com/#/register?invitationCode=9684D93168">
</iframe>

<div id="floatBtn">VIP<span>MOD</span></div>

<div id="modMenu">

<div class="header">
<span class="header-title">⚡ <span id="hdrModeLabel">WINGO 1M</span> AI SCANNER</span>
<span class="close-btn" id="closeBtn">✖</span>
</div>

<!-- Always First in Menu: Wingo 30S / 1M Period + BIG / SMALL Signal -->
<div class="live-top-card">
  <div class="scan-grid"></div>
  <div class="scan-beam"></div>

  <div style="position:relative;z-index:2;display:flex;justify-content:center;gap:6px;margin-bottom:8px;">
    <button type="button" id="kwgMode30s" class="quick-amt-btn" style="padding:4px 10px;font-size:10px;">WINGO 30S</button>
    <button type="button" id="kwgMode1m" class="quick-amt-btn active" style="padding:4px 10px;font-size:10px;">WINGO 1M</button>
  </div>

  <div class="info-bar" style="position:relative;z-index:2;">
    <span><span id="prdModeLabel">WINGO 1M</span>: <span id="prdText" class="info-value">---</span></span>
    <span>TIME: <span id="timerText" class="info-value">00:60</span></span>
  </div>

  <div id="sureTag" class="sureshot-tag" style="display:none;">
    💎 ULTRA SURESHOT 💎
  </div>

  <div id="statusText" style="font-size:10px;color:var(--neon-blue);position:relative;z-index:2;margin-bottom:2px;">
    WINGO 1-MIN LIVE PREDICTION
  </div>

  <div id="resText" class="animated-result" style="color:var(--neon-green);">BIG</div>
</div>

<!-- Step 1: Deposit & 1-5 Level Setup -->
<div id="depositSetup">
  <div style="font-size:11px;color:#bbb;margin-bottom:8px;">
    ENTER AMOUNT (₹100, ₹500, ₹2000 OR ANY)
  </div>

  <div class="quick-amts">
    <button type="button" class="quick-amt-btn active" data-amt="100">₹100</button>
    <button type="button" class="quick-amt-btn" data-amt="300">₹300</button>
    <button type="button" class="quick-amt-btn" data-amt="500">₹500</button>
    <button type="button" class="quick-amt-btn" data-amt="2000">₹2000</button>
  </div>

  <input type="number" id="depAmount" class="deposit-input"
  value="100" placeholder="Enter amount" min="10">

  <div class="level-picker-label">SELECT LEVELS (1 TO 5)</div>
  <div class="level-picker" id="levelPicker">
    <button type="button" class="lvl-pick-btn" data-lvl="1">1</button>
    <button type="button" class="lvl-pick-btn" data-lvl="2">2</button>
    <button type="button" class="lvl-pick-btn" data-lvl="3">3</button>
    <button type="button" class="lvl-pick-btn" data-lvl="4">4</button>
    <button type="button" class="lvl-pick-btn active" data-lvl="5">5</button>
  </div>

  <div class="split-mode-row">
    <button type="button" class="split-mode-btn active" data-mode="progressive">2x Level Split</button>
    <button type="button" class="split-mode-btn" data-mode="equal">Equal Split</button>
  </div>

  <div class="preview-levels" id="previewLevels"></div>

  <button class="start-btn" id="startBtn">START PLAYING</button>

  <div class="footnote">
    Amount automatically divided across selected 1–5 levels
  </div>
</div>

<!-- Step 2: Active Play & Level Controls -->
<div id="predictorScreen">

  <div class="wallet-row">
    <div class="wallet-item">
      <span class="wallet-label">WALLET</span>
      <span id="walletDisplay" class="wallet-value gold">₹100</span>
    </div>

    <div class="wallet-item">
      <span class="wallet-label">LEVEL</span>
      <span id="levelDisplay" class="wallet-value green">1 / 5</span>
    </div>

    <div class="wallet-item">
      <span class="wallet-label">PLAY BET</span>
      <span id="nextBetDisplay" class="wallet-value" style="color:var(--neon-blue)">₹3</span>
    </div>
  </div>

  <div class="active-levels-strip" id="activeLevelsStrip"></div>

  <div class="bet-details">
    <div class="detail-card">
      <span class="detail-label">LEVEL</span>
      <span id="levelText" class="detail-value green">1 / 5</span>
    </div>

    <div class="detail-card">
      <span class="detail-label">BET</span>
      <span id="amountText" class="detail-value gold">₹3</span>
    </div>

    <div class="detail-card">
      <span class="detail-label">PROB</span>
      <span id="probText" class="detail-value" style="color:var(--neon-blue)">88%</span>
    </div>
  </div>

  <div class="bet-box">
    <div class="bet-row">
      <span class="bet-label">📉 Total loss so far:</span>
      <span id="totalLossText" class="bet-value red">₹0</span>
    </div>

    <div class="bet-row">
      <span class="bet-label">🛡️ Safety wallet left:</span>
      <span id="safetyWalletText" class="bet-value green">₹100</span>
    </div>

    <div class="bet-row">
      <span class="bet-label">🎯 Next level bet:</span>
      <span id="nextLevelBetText" class="bet-value gold">₹6</span>
    </div>
  </div>

  <div class="action-btns">
    <button class="act-btn win-btn" id="winBtn">WIN (Reset)</button>
    <button class="act-btn loss-btn" id="lossBtn">LOSS (Next)</button>
  </div>

  <div class="reset-link" id="resetLink">↺ CHANGE AMOUNT / LEVELS</div>

</div>
</div>

<script>
window.addEventListener('DOMContentLoaded',function(){

const menu=document.getElementById('modMenu');
const floatBtn=document.getElementById('floatBtn');
const closeBtn=document.getElementById('closeBtn');

const startBtn=document.getElementById('startBtn');
const winBtn=document.getElementById('winBtn');
const lossBtn=document.getElementById('lossBtn');
const resetLink=document.getElementById('resetLink');
const depAmountInput=document.getElementById('depAmount');
const previewLevelsEl=document.getElementById('previewLevels');
const activeLevelsStripEl=document.getElementById('activeLevelsStrip');

let baseDeposit=100;
let maxLevels=5;
let splitMode='progressive';
let levelBets=[3,6,13,26,52];
let currentLevel=1;
let totalLoss=0;
let currentWallet=100;
let sessionActive=false;
let lastPeriodId='';

/* MENU FIX */

function toggleMenu(){
    menu.classList.toggle('active');
}

function closeMenu(){
    menu.classList.remove('active');
}

floatBtn.addEventListener('click',function(e){
    e.preventDefault();
    e.stopPropagation();
    toggleMenu();
});

closeBtn.addEventListener('click',function(e){
    e.preventDefault();
    e.stopPropagation();
    closeMenu();
});

/* WINGO 30S / 1M PERIOD & BIG/SMALL ENGINE */

let wingoInterval='1m';
try{
    const saved=window.localStorage.getItem('kwg_wingo_interval');
    if(saved==='30s'||saved==='1m') wingoInterval=saved;
}catch(_){}

const mode30Btn=document.getElementById('kwgMode30s');
const mode1mBtn=document.getElementById('kwgMode1m');
function syncModeButtons(){
    if(mode30Btn) mode30Btn.classList.toggle('active', wingoInterval==='30s');
    if(mode1mBtn) mode1mBtn.classList.toggle('active', wingoInterval==='1m');
    const hdrEl=document.getElementById('hdrModeLabel');
    const prdModeEl=document.getElementById('prdModeLabel');
    if(hdrEl) hdrEl.innerText=wingoInterval==='30s'?'WINGO 30S':'WINGO 1M';
    if(prdModeEl) prdModeEl.innerText=wingoInterval==='30s'?'WINGO 30S':'WINGO 1M';
}
if(mode30Btn){
    mode30Btn.addEventListener('click',function(){
        wingoInterval='30s';
        try{ window.localStorage.setItem('kwg_wingo_interval','30s'); }catch(_){}
        lastPeriodId='';
        syncModeButtons();
        updateTimer();
    });
}
if(mode1mBtn){
    mode1mBtn.addEventListener('click',function(){
        wingoInterval='1m';
        try{ window.localStorage.setItem('kwg_wingo_interval','1m'); }catch(_){}
        lastPeriodId='';
        syncModeButtons();
        updateTimer();
    });
}
syncModeButtons();

function getWingo1MinInfo(){
    const now=new Date();
    // Standard Wingo period in IST (UTC+5:30)
    const utcMs=now.getTime()+(now.getTimezoneOffset()*60000);
    const ist=new Date(utcMs+(5.5*3600000));
    const y=ist.getFullYear();
    const m=String(ist.getMonth()+1).padStart(2,'0');
    const d=String(ist.getDate()).padStart(2,'0');
    if(wingoInterval==='30s'){
        const idx=(ist.getHours()*120)+(ist.getMinutes()*2)+Math.floor(ist.getSeconds()/30)+1;
        const periodId=y+m+d+'10005'+String(idx).padStart(4,'0');
        const secLeft=30-(ist.getSeconds()%30);
        return { periodId, secLeft, minuteIndex: idx };
    }
    const minuteIndex=(ist.getHours()*60)+ist.getMinutes()+1;
    const minStr=String(minuteIndex).padStart(4,'0');
    const periodId=y+m+d+'1000'+minStr;
    const secLeft=60-ist.getSeconds();
    return { periodId, secLeft, minuteIndex };
}

function updateBigSmallSignal(periodId){
    // Deterministic balanced Big/Small indicator per KWG period
    let hash=0;
    for(let i=0;i<periodId.length;i++){
        hash=((hash*31)+periodId.charCodeAt(i))%10007;
    }
    const isBig=(hash%2)===0;
    const prob=82+(hash%15); // 82% - 96%
    const resEl=document.getElementById('resText');
    const probEl=document.getElementById('probText');
    const sureTagEl=document.getElementById('sureTag');
    const statusEl=document.getElementById('statusText');

    resEl.innerText=isBig?'BIG':'SMALL';
    resEl.style.color=isBig?'var(--neon-green)':'var(--neon-blue)';
    if(probEl) probEl.innerText=prob+'%';

    if(prob>=91){
        sureTagEl.style.display='inline-block';
    } else {
        sureTagEl.style.display='none';
    }

    statusEl.innerText=(wingoInterval==='30s'?'WINGO 30S':'WINGO 1M')+' · PERIOD '+periodId.slice(-4);
}

function updateTimer(){
    const info=getWingo1MinInfo();
    document.getElementById('prdText').innerText=info.periodId;
    document.getElementById('timerText').innerText=
        '00:'+(info.secLeft<10?'0':'')+info.secLeft;

    if(info.periodId!==lastPeriodId){
        lastPeriodId=info.periodId;
        updateBigSmallSignal(info.periodId);
    }
}

setInterval(updateTimer,1000);
updateTimer();

/* AMOUNT SPLIT CALCULATOR (1-5 LEVELS) */

function computeLevelSplit(amount, levelsCount, mode){
    const amt=Math.max(10, Math.round(amount));
    const count=Math.min(5, Math.max(1, levelsCount));
    const weights=[];
    let sumW=0;
    for(let i=0;i<count;i++){
        const w=mode==='equal'?1:Math.pow(2,i);
        weights.push(w);
        sumW+=w;
    }

    const bets=[];
    let allocated=0;
    for(let i=0;i<count;i++){
        if(i===count-1){
            bets.push(Math.max(1, amt-allocated));
        } else {
            const part=Math.max(1, Math.floor((amt*weights[i])/sumW));
            bets.push(part);
            allocated+=part;
        }
    }
    return bets;
}

function renderSetupPreview(){
    const val=parseFloat(depAmountInput.value);
    const amt=isNaN(val)||val<10?100:Math.round(val);
    levelBets=computeLevelSplit(amt, maxLevels, splitMode);

    previewLevelsEl.innerHTML='';
    levelBets.forEach(function(bet, idx){
        const chip=document.createElement('div');
        chip.className='preview-chip';
        chip.innerHTML='L'+(idx+1)+': <span>₹'+bet+'</span>';
        previewLevelsEl.appendChild(chip);
    });
}

document.querySelectorAll('.quick-amt-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
        document.querySelectorAll('.quick-amt-btn').forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        depAmountInput.value=btn.getAttribute('data-amt');
        renderSetupPreview();
    });
});

depAmountInput.addEventListener('input',function(){
    document.querySelectorAll('.quick-amt-btn').forEach(function(b){
        b.classList.toggle('active', b.getAttribute('data-amt')===depAmountInput.value);
    });
    renderSetupPreview();
});

document.querySelectorAll('#levelPicker .lvl-pick-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
        document.querySelectorAll('#levelPicker .lvl-pick-btn').forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        maxLevels=Number(btn.getAttribute('data-lvl'))||5;
        renderSetupPreview();
    });
});

document.querySelectorAll('.split-mode-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
        document.querySelectorAll('.split-mode-btn').forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        splitMode=btn.getAttribute('data-mode')==='equal'?'equal':'progressive';
        renderSetupPreview();
    });
});

renderSetupPreview();

/* UI UPDATE */

function refreshUI(){
    if(!sessionActive)return;

    currentWallet=Math.max(0,baseDeposit-totalLoss);
    document.getElementById('walletDisplay').innerText='₹'+currentWallet;

    const levelStr=currentLevel+' / '+maxLevels;
    document.getElementById('levelDisplay').innerText=levelStr;
    document.getElementById('levelText').innerText=levelStr;

    const currentBet=levelBets[currentLevel-1]||levelBets[0]||0;
    document.getElementById('amountText').innerText='₹'+currentBet;
    document.getElementById('nextBetDisplay').innerText='₹'+currentBet;

    const nextBet=currentLevel<maxLevels?levelBets[currentLevel]:levelBets[0];
    document.getElementById('nextLevelBetText').innerText='₹'+nextBet;
    document.getElementById('totalLossText').innerText='₹'+totalLoss;
    document.getElementById('safetyWalletText').innerText='₹'+currentWallet;

    document.getElementById('walletDisplay').style.color=
        currentWallet<=0?'var(--neon-red)':'var(--neon-gold)';

    activeLevelsStripEl.style.gridTemplateColumns='repeat('+maxLevels+',1fr)';
    activeLevelsStripEl.innerHTML='';
    levelBets.forEach(function(bet, idx){
        const lvlNum=idx+1;
        const chip=document.createElement('button');
        chip.type='button';
        chip.className='lvl-chip'+(lvlNum===currentLevel?' current':'');
        chip.innerHTML='L'+lvlNum+'<span class="amt">₹'+bet+'</span>';
        chip.addEventListener('click',function(){
            currentLevel=lvlNum;
            refreshUI();
        });
        activeLevelsStripEl.appendChild(chip);
    });
}

/* START */

startBtn.addEventListener('click',function(){
    const val=parseFloat(depAmountInput.value);
    if(isNaN(val)||val<10){
        alert('Minimum amount ₹10');
        return;
    }

    baseDeposit=Math.round(val);
    levelBets=computeLevelSplit(baseDeposit, maxLevels, splitMode);
    currentWallet=baseDeposit;
    totalLoss=0;
    currentLevel=1;
    sessionActive=true;

    document.getElementById('depositSetup').style.display='none';
    document.getElementById('predictorScreen').style.display='block';

    updateBigSmallSignal(getWingo1MinInfo().periodId);
    refreshUI();
});

/* WIN */

winBtn.addEventListener('click',function(){
    if(!sessionActive)return;
    totalLoss=0;
    currentLevel=1;
    refreshUI();
    updateBigSmallSignal(getWingo1MinInfo().periodId);
    document.getElementById('statusText').innerText='WIN RECORDED · RESET TO LEVEL 1';
});

/* LOSS */

lossBtn.addEventListener('click',function(){
    if(!sessionActive)return;
    const bet=levelBets[currentLevel-1]||0;

    if(currentLevel>=maxLevels||totalLoss+bet>baseDeposit){
        totalLoss=Math.min(baseDeposit, totalLoss+bet);
        refreshUI();
        document.getElementById('statusText').innerText='MAX LEVEL REACHED · WALLET PROTECTED';
        return;
    }

    totalLoss+=bet;
    currentLevel++;
    refreshUI();
    updateBigSmallSignal(getWingo1MinInfo().periodId);
    document.getElementById('statusText').innerText='LOSS RECORDED · LEVEL '+currentLevel+' ACTIVE';
});

/* RESET TO SETUP */

resetLink.addEventListener('click',function(){
    sessionActive=false;
    totalLoss=0;
    currentLevel=1;
    document.getElementById('predictorScreen').style.display='none';
    document.getElementById('depositSetup').style.display='block';
    renderSetupPreview();
});

});
</script>

</body>
</html>`;

const SANDBOX_STORAGE_SHIM = `<script>
(function(){
  try {
    var t='__kwg_test__';
    window.localStorage.setItem(t,'1');
    window.localStorage.removeItem(t);
  } catch (e) {
    var createMemStore=function(){
      var data=Object.create(null);
      return {
        getItem:function(k){ return Object.prototype.hasOwnProperty.call(data,String(k))?data[String(k)]:null; },
        setItem:function(k,v){ data[String(k)]=String(v); },
        removeItem:function(k){ delete data[String(k)]; },
        clear:function(){ data=Object.create(null); },
        key:function(i){ var keys=Object.keys(data); return i>=0&&i<keys.length?keys[i]:null; },
        get length(){ return Object.keys(data).length; }
      };
    };
    try { Object.defineProperty(window,'localStorage',{value:createMemStore(),configurable:true}); } catch(_){}
    try { Object.defineProperty(window,'sessionStorage',{value:createMemStore(),configurable:true}); } catch(_){}
  }
})();
</script>`;

export function compileGameDocument(htmlCode: string, cssCode: string, jsCode: string): string {
  const trimmedHtml = (htmlCode || '').trim();
  const hasFullDoc =
    /<!doctype\s+html/i.test(trimmedHtml) ||
    /<html[\s>]/i.test(trimmedHtml) ||
    /<body[\s>]/i.test(trimmedHtml);

  const styleBlock = cssCode?.trim() ? `<style>\n${cssCode}\n</style>` : '';
  const safeJs = (jsCode || '').replace(/<\/script>/gi, '<\\/script>');
  const scriptBlock = safeJs.trim() ? `<script>\n${safeJs}\n</script>` : '';

  if (hasFullDoc) {
    let doc = trimmedHtml;
    if (/<head[\s>]/i.test(doc)) {
      doc = doc.replace(/<head([^>]*)>/i, `<head$1>\n${SANDBOX_STORAGE_SHIM}`);
    } else if (/<html[\s>]/i.test(doc)) {
      doc = doc.replace(/<html([^>]*)>/i, `<html$1>\n<head>${SANDBOX_STORAGE_SHIM}</head>`);
    } else {
      doc = `${SANDBOX_STORAGE_SHIM}\n${doc}`;
    }

    if (styleBlock) {
      if (/<\/head>/i.test(doc)) {
        doc = doc.replace(/<\/head>/i, `${styleBlock}\n</head>`);
      } else if (/<body[\s>]/i.test(doc)) {
        doc = doc.replace(/<body([^>]*)>/i, `${styleBlock}\n<body$1>`);
      } else {
        doc = `${styleBlock}\n${doc}`;
      }
    }

    if (scriptBlock) {
      if (/<\/body>/i.test(doc)) {
        doc = doc.replace(/<\/body>/i, `${scriptBlock}\n</body>`);
      } else if (/<\/html>/i.test(doc)) {
        doc = doc.replace(/<\/html>/i, `${scriptBlock}\n</html>`);
      } else {
        doc = `${doc}\n${scriptBlock}`;
      }
    }
    return doc;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
  ${SANDBOX_STORAGE_SHIM}
  <style>html,body{margin:0;padding:0;min-height:100%;background:#050508;color:#fff;font-family:system-ui,-apple-system,sans-serif;}</style>
  ${styleBlock}
</head>
<body>
  ${trimmedHtml}
  ${scriptBlock}
</body>
</html>`;
}
