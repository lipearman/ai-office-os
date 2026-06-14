# Daily Trading Intelligence — สถาปัตยกรรม & พิมพ์เขียว

> ต่อยอดจาก **AI Office OS** เป็นระบบช่วยตัดสินใจเทรดคริปโต (Bitkub) แบบ paper trading ก่อน
> แล้วค่อยขยายเป็น live เน้นมาตรฐานแบบ quant fund / prop trading จริง
> **แนวคิดหลัก:** ไม่ดูเส้นตัด TF เดียว แต่ใช้ **Multi-Timeframe Top-Down** (1D→4H→1H→15M)
> + ทีม AI 7 ตัว + เก็บสถิติ/เหตุผล + วัดคุณค่าตัวช่วยด้วยตัวเลข

---

## 0. ปรัชญาหลัก (อ่านก่อนทุกอย่าง)

1. **AI ไม่ตัดสินใจซื้อขายโดยตรง** — การตัดสินใจที่ต้อง reproducible อยู่ใน deterministic engine
   ส่วน LLM ทำหน้าที่ วิเคราะห์ / อธิบาย / ประสานงาน / สอน (advisory)
2. **ไม่มี AI ตัวเดียวทาย Buy/Sell** — ใช้ ensemble ของหลายโมเดล/กลยุทธ์ แล้วรวมสัญญาณ
3. **Backtest / Paper / Live ใช้ engine เดียวกัน** — ต่างแค่แหล่ง data กับ broker
4. **Risk เป็น gate บังคับสุดท้ายเสมอ** — ทุกออเดอร์ต้องผ่าน Risk Engine ไม่มีข้อยกเว้น
5. **กัน look-ahead bias** — ตัดสินใจบนแท่งที่ปิดแล้วเท่านั้น, ข่าวใช้ตาม timestamp จริง
6. **เริ่ม paper trading เท่านั้น** — พิสูจน์ผลหลายสัปดาห์ก่อนแตะเงินจริง
7. **Decimal ทุกที่** สำหรับเงิน/ราคา — float ปัดเศษพัง PnL

---

## 1. ภาพรวมสถาปัตยกรรม

```
                          EVENT BUS (async in-process / Redis pub-sub)
   ┌──────────┬──────────────┬───────────────┬─────────────┬──────────────┐
   ▼          ▼              ▼               ▼             ▼              ▼
┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
│  Data   │ │ Feature  │ │ Strategy │ │   Risk   │ │ Portfolio│ │  Execution   │
│ Ingest  │→│ (Indic.) │→│ Ensemble │→│  Engine  │→│  & OMS   │→│   Broker     │
└─────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────┘
 Bitkub WS   RSI/EMA/...   +Validator   gate+sizing  state/PnL   Paper | Bitkub
                              ↑Regime
     │            │             │             │            │             │
     └────────────┴─────────────┴─────────────┴────────────┴─────────────┘
                                    │ อ่าน state ทุกชั้น
                          ┌─────────▼──────────────┐
                          │ INTELLIGENCE LAYER (LLM)│  ← Multi-Agent (advisory)
                          │ News/Sentiment/Explain  │
                          └─────────┬───────────────┘
                                    │
                       WebSocket → /office UI + Dashboard
```

### "AI" สองประเภท — อย่าปนกัน

| | Quant Core | Intelligence Layer (LLM) |
|---|---|---|
| คืออะไร | deterministic Python + ML (XGBoost, HMM) | Claude/GPT agents (LangGraph) |
| ทำหน้าที่ | คำนวณ indicator, ทาย, จัดการความเสี่ยง | วิเคราะห์ข่าว, อธิบาย, ประสานงาน |
| Reproducible | **ต้องได้** | ไม่ต้อง (advisory) |
| แตะ execution | ผ่าน pipeline เท่านั้น | **ไม่แตะ** |

---

## 2. Quant Core — 7 ชั้น (deterministic)

### 2.1 Data Ingestion
- Bitkub **public WS** (ticker/trade real-time) + **REST** (`/tradingview/history` ดึง OHLCV ย้อนหลัง)
- **ดึงครบ 4 timeframe: 1D / 4H / 1H / 15M** ต่อเหรียญ (สำหรับ MTF §2.2.1) — REST ดึงประวัติ, อัปเดตต่อด้วย WS/poll
- normalize เป็น schema กลาง, จัดการ reconnect, ตรวจ gap, timestamp UTC เสมอ

```python
@dataclass(frozen=True)
class Candle:
    symbol: str        # "BTC_THB"
    ts: datetime       # UTC เวลาเปิดแท่ง
    open: Decimal; high: Decimal; low: Decimal; close: Decimal
    volume: Decimal
    closed: bool       # True เฉพาะแท่งปิด — ใช้ตัวนี้ตัดสินใจ
```

### 2.2 Feature / Indicator Engine
- pure functions (ทดสอบด้วย unit test ได้), ใช้ `pandas-ta`, คำนวณบนแท่งปิดเท่านั้น

```python
@dataclass(frozen=True)
class FeatureSet:
    symbol: str; ts: datetime; close: Decimal
    rsi14: float; ema20: float; ema50: float; ema200: float
    macd: float; macd_signal: float
    atr14: float                 # ตั้ง stop loss ตาม volatility
    adx14: float                 # ความแรงเทรนด์ (กรอง chop)
    bb_upper: float; bb_mid: float; bb_lower: float
    volume_ratio: float          # vol ปัจจุบัน / ค่าเฉลี่ย
```

### 2.2.1 Multi-Timeframe (MTF) — โครงหลักของ Daily Trading Intelligence ⭐

> ไม่ดู "เส้นตัด" บน TF เดียว (กับดัก false signal) แต่ไล่ **Top-Down** จากภาพใหญ่→เล็ก
> แต่ละ timeframe มีหน้าที่เฉพาะ สัญญาณต้องไหลลงตามลำดับ ห้ามข้ามชั้น

```
1D  (แนวโน้มใหญ่) → BIAS: เทรดได้เฉพาะทิศนี้ (1D ขึ้น = หา long เท่านั้น)
     ▼
4H  (หาจังหวะ)    → SETUP ZONE: แนวรับ/ต้าน โซนที่น่าเข้า
     ▼
1H  (จุดเข้า)      → TRIGGER: สัญญาณเข้าจริง (pullback/structure) ในโซนที่ 4H ชี้
     ▼
15M (ยืนยัน)       → CONFIRMATION: จับ entry แม่น + ลด risk → stop แคบ R:R ดีขึ้น
```

**กฎเหล็ก:** ชั้นบนไม่อนุญาต → ชั้นล่างห้ามเทรด (1D ขาลง + 1H ให้ buy = ทิ้ง, เป็นแค่ rebound ในขาลง)

คำนวณ `FeatureSet` แยกทุก timeframe แล้วรวมเป็น snapshot เดียว:
```python
@dataclass(frozen=True)
class MTFSnapshot:
    symbol: str; ts: datetime
    tf_1d: FeatureSet      # bias
    tf_4h: FeatureSet      # setup zone (support/resistance)
    tf_1h: FeatureSet      # trigger
    tf_15m: FeatureSet     # confirmation
    # สรุปผลไล่ชั้น
    bias: str              # "long" | "short" | "neutral"  (จาก 1D)
    setup_ready: bool      # ราคาเข้าโซน 4H แล้วหรือยัง
    trigger_fired: bool    # 1H เกิดสัญญาณ
    confirmed: bool        # 15M ยืนยัน
    alignment_score: float # 0..1 กี่ชั้นที่สอดคล้องกัน
```

#### Daily Trading Intelligence — บรีฟแผนรายวัน 📋
ต้นรอบ/ทุกเช้า ระบบสร้าง **แผนเทรดต่อเหรียญ** (ไม่ใช่แค่ indicator ดิบ):
```
📋 Daily Brief — BTC_THB (09:00)
├ 1D Bias:    ขาขึ้น (close>EMA200, ADX 28) → หา LONG
├ 4H Setup:   รับ 1,580k / ต้าน 1,650k → เฝ้าโซนรับ
├ 1H Watch:   รอ pullback แตะ EMA50 + RSI เด้งจาก 40
├ 15M Trigger:ยังไม่เกิด — รอ bullish candle ยืนยัน
├ ข่าว:       ETF inflow บวก (sentiment +0.5)
└ แผน:        ลงมา 1,585k + 15M ยืนยัน → long, stop 1,570k, target 1,640k (R:R 1:3.7)
```
- 📊 **Analyst** สร้างบรีฟ (เก็บเป็น record เหมือน IntelInsight §5.6)
- 🎯 **Coach** ทบทวนตอนปิดวัน: แผนเป็นจริงไหม, ถ้าทำตามแผนผลเป็นยังไง → feed กลับเข้า effectiveness

> Daily Brief เก็บเป็น record → วัดได้ว่า "วันที่ alignment สูง" ชนะมากกว่าจริงไหม (attribution §5.6)

### 2.3 Regime Detection
- ตลาดอยู่โหมดไหน: `trend` / `range` / `high_vol` / `crisis` — **ดูจาก 1D/4H เป็นหลัก**
- เริ่มด้วย rule (ADX/ATR threshold) → ค่อยอัปเป็น HMM / clustering (`hmmlearn`, `scikit-learn`)
- ใช้ "เลือกน้ำหนัก/เปิด-ปิดกลยุทธ์" ในชั้น ensemble

### 2.4 Strategy / Ensemble (หัวใจ)
- แต่ละกลยุทธ์ = **config plug-in** (JSON) ออก `Signal` (BUY/SELL/HOLD + confidence + reason)
- **ทำงานภายใต้ MTF cascade (§2.2.1)** — strategy เห็นทั้ง 4 timeframe ตัดสินตาม bias→setup→trigger→confirm
- หลายกลยุทธ์รันขนาน → **Combiner** รวมเป็นเป้าหมายเดียว (เริ่ม weighted average ตาม regime + performance)

```python
class Strategy(Protocol):
    def on_snapshot(self, s: MTFSnapshot, ctx: Context) -> Signal | None: ...
    # เข้าได้เมื่อ: s.bias ตรงทิศ AND s.setup_ready AND s.trigger_fired AND s.confirmed
```

ตัวอย่าง config (MTF-aware):
```json
{ "name": "ema_pullback_mtf", "regime": "trend",
  "bias_1d":      "close > ema200 and adx14 > 22",          // แนวโน้มใหญ่
  "setup_4h":     "close near support or close > ema50",     // โซนเข้า
  "trigger_1h":   "close > ema20 and rsi14 > 45 and rsi14 < 60",  // จุดเข้า
  "confirm_15m":  "macd > macd_signal and volume_ratio > 1.2",    // ยืนยัน
  "exit_long":    "rsi14 > 70 or close < ema50",
  "stop_atr": 1.5, "tp_rr": 2.0 }
```

#### กลยุทธ์ Day Trading (เลือกตาม regime)
| กลยุทธ์ | regime | entry หลัก | ระวัง |
|---|---|---|---|
| EMA Pullback | trend | ย่อแตะ EMA แล้วเด้ง | สวนเทรนด์ |
| Opening Range Breakout | trend/vol | ทะลุกรอบช่วงแรก + vol | false breakout |
| Volatility Breakout | high_vol | ทะลุ BB + ATR ขยาย | ต้อง retest |
| RSI + BB Reversion | range | RSI<30 + BB ล่าง + ADX<20 | อันตรายในเทรนด์ |
| VWAP | intraday | ย่อแตะ VWAP เด้งตามทิศหลัก | — |
| Scalping | any | orderbook/spread | **fee 0.25% กินกำไร** |

### 2.5 Signal Validator (กรองสัญญาณหลอก)
คั่นระหว่าง Strategy กับ Risk — สัญญาณต้องผ่านทุก filter ที่เปิด:

```python
@dataclass(frozen=True)
class ValidationResult:
    passed: bool
    confidence: float
    rejected_by: list[str]   # filter ที่ veto + เหตุผล (ให้ AI อธิบาย)
```

filter มาตรฐาน:
1. **Candle-close** — ตัดสินใจบนแท่งปิด
2. **Multi-timeframe** — TF เล็กต้องสอดคล้องเทรนด์ TF ใหญ่
3. **Confluence** — ต้องมี indicator ยืนยัน ≥ N ตัว
4. **Volume confirmation** — breakout ต้องมี volume เพิ่ม
5. **ADX/ATR chop filter** — ADX<20 = sideways ปิดกลยุทธ์ตามเทรนด์
6. **Breakout retest** — รอย้อนทดสอบแนวที่ทะลุ
7. **Signal persistence** — สัญญาณต้องยืน N แท่ง
8. **Cooldown** — แพ้ติดกัน → พักเทรด
9. **Orderbook/spread** (live) — spread กว้าง/liquidity บาง = ข้าม

> พิสูจน์ว่า filter ได้ผลด้วย backtest แบบ "เปิด vs ปิด" — ระวัง overfit (filter เยอะเกิน perfect บนอดีตมักพังอนาคต) ใช้ walk-forward

### 2.6 Risk Engine (gate บังคับ)
ทุก Signal ต้องผ่านก่อนเป็น Order:
- **Position sizing** — risk 0.5–1% ของพอร์ตต่อดีล + ระยะ stop
- **Hard limits** — max position, max open positions, **daily loss limit (kill switch)**
- **Exposure** — ไม่ทุ่มเหรียญเดียวเกิน X%
- **Sanity** — เงินพอ, ผ่าน min order Bitkub, ราคาไม่ผิดปกติ

```python
class RiskEngine:
    def evaluate(self, signal: Signal, portfolio: Portfolio) -> RiskDecision:
        ...  # คืน Order ที่ปรับ size แล้ว หรือ REJECT พร้อมเหตุผล
```

### 2.7 Portfolio & OMS
- state: เงินสด, position, avg price, realized/unrealized PnL
- lifecycle: NEW → SUBMITTED → FILLED/PARTIAL/CANCELLED/REJECTED
- คำนวณ PnL, drawdown, equity curve

### 2.8 Execution / Broker (กุญแจ paper→live)
interface เดียว สอง implementation:

```python
class Broker(Protocol):
    async def submit(self, order: Order) -> OrderResult: ...
    async def cancel(self, order_id: str) -> bool: ...
    async def balances(self) -> dict[str, Decimal]: ...

class PaperBroker(Broker):   # จำลอง fill ราคาจริง + slippage + fee 0.25%
class BitkubBroker(Broker):  # REST private + HMAC SHA-256 (ทีหลัง)
```

---

## 3. Intelligence Layer (LLM — decision support)

```
News Ingest → Sentiment → Market Summary → Signal Explainer → /office UI + Journal
```

### 3.1 News Ingestion
แหล่ง: Bitkub blog/ประกาศ (listing เหรียญ), CoinDesk, Cointelegraph, CryptoPanic, RSS

```python
@dataclass(frozen=True)
class NewsItem:
    id: str; source: str; title: str; body: str; url: str
    published_at: datetime    # UTC — สำคัญสำหรับ point-in-time
    assets: list[str]         # ["BTC","ETH"]
    ingested_at: datetime
```

### 3.2 Sentiment (structured, ไม่ใช่ free text)
```python
@dataclass(frozen=True)
class SentimentScore:
    news_id: str; asset: str
    sentiment: float          # -1..+1
    confidence: float; impact: str   # high/medium/low
    time_horizon: str; rationale: str
    is_priced_in: bool
```

### 3.3 Market Summary + Signal Explainer
- รวม quant data + news + sentiment เป็นบรีฟอ่านง่าย
- Explainer อ่าน Strategy + Validator (`rejected_by`) → อธิบายว่าทำไมเข้า/ไม่เข้า

### โหมดการใช้ sentiment
- **A (เริ่ม): Advisory** — แสดงบน UI คนกดเอง
- **B: Risk filter** — ข่าวลบแรง → Risk Engine ลด size/ห้ามเปิด position
- **C (advanced): Alpha factor** — ใส่ใน Feature Engineering เป็นโมเดลใน ensemble (ต้อง backtest)

### ข้อควรระวัง
- Ground ทุกคำตอบด้วยข่าวจริง + cite URL (กัน hallucination)
- ข่าวมัก price-in แล้ว → ใช้เป็น context/risk-flag ดีกว่าสัญญาณเข้า
- sentiment decay เร็ว + noisy, ต้อง ≥2 แหล่งยืนยันสำหรับ high-impact
- จัดการ 2 ภาษา (ไทย/อังกฤษ), cache, เรียก LLM เมื่อมีข่าวใหม่/on-demand ไม่ใช่ทุก tick

---

## 4. Multi-Agent (ทีมใน /office)

### 2 ประเภทตัวละคร — แยกให้ชัด
- 🤖 **Trader** = *หน้าตาของ Quant Core engine* — เป็นตัวที่ **ทำ paper trading จริง** (เปิด/ปิด position)
  ตัดสินใจด้วย logic deterministic เบื้องหลัง (Strategy→Validator→Risk→PaperBroker) ตัวละครแค่แสดงผลให้เห็น **ไม่ใช่ LLM ตัดสินใจ**
- 💬 **Advisory agents** (Analyst/Risk/Coach/News) = LLM ที่ **อธิบาย/เตือน/วิเคราะห์** ไม่กดเทรด

### จำนวน: **7 ตัวละครครบตั้งแต่เฟสแรก** (ปรับจูนทั้งทีมไปพร้อมกัน)

> สร้าง interface + ตัวละคร + orchestration + UI ครบตั้งแต่ต้น จะได้ไม่ต้องรื้อโครงทีหลัง
> ตัวที่ input ยังไม่ครบในเฟสแรก เริ่มเป็น **stub** (มีตัวละคร+ช่องพูด แต่เนื้อหาบาง) แล้วโตขึ้นตาม data

| # | ตัวละคร | ประเภท | Input | Output | ความสมบูรณ์เฟส 1 |
|---|---|---|---|---|---|
| 1 | 🤖 **Trader** | engine (deterministic) | signal ที่ผ่าน validator+risk | เปิด/ปิด paper position | ✅ เต็ม |
| 2 | 📊 **Market Analyst** | LLM advisory | indicator + regime | สรุปภาพตลาด | ✅ เต็ม |
| 3 | 🛡️ **Risk Officer** | LLM advisory | portfolio + signal | เตือนความเสี่ยง | ✅ เต็ม |
| 4 | 🎯 **Coach / Explainer** | LLM advisory | ทุกอย่าง + stats | "เข้า/ไม่เข้าเพราะอะไร" + journal | ✅ เต็ม |
| 5 | 📰 **News & Sentiment** | LLM advisory | ข่าว BTC/ETH/Bitkub | sentiment + สรุปข่าว | 🟡 ต่อแหล่งข่าว 1-2 แหล่งก่อน |
| 6 | 📉 **Model Monitor** | LLM advisory | performance per strategy | จับ strategy decay | 🟠 stub (มี 1 strategy → ดู win-rate trend) |
| 7 | 🔍 **Execution Reviewer** | LLM advisory | fills + slippage | วิเคราะห์คุณภาพการเข้า/ออก | 🟠 stub (paper slippage จำลอง) |

**หมายเหตุความสมบูรณ์:**
- 🟡 News: ทำได้เต็มแต่ต้องต่อ feed ข่าวก่อน (RSS/CryptoPanic) — เริ่ม 1-2 แหล่งพอ
- 🟠 Model Monitor / Execution Reviewer: เฟสแรกมี **1 strategy + paper** → งานจริงยังน้อย แต่ใส่เป็น stub ไว้
  ให้ตัวละคร+pipeline+UI พร้อม แล้วเนื้อหาเข้มขึ้นเองเมื่อมี ensemble (Phase 5) และ live fills (Phase 6)

### การประสาน — Trader ทำงานตามรอบ, advisory ทั้ง 6 วางทับ
```
ทุกแท่งปิด / รอบ scan:
  Quant Core: Strategy → Validator → Risk → 🤖 Trader (เปิด/ปิด paper position)
       │
       ├─ 📊 Analyst     อ่าน indicator/regime → "ตลาดเทรนด์, BTC น่าสน"
       ├─ 📰 News        อ่านข่าว/sentiment    → "ETF inflow บวก +0.6"
       ├─ 🛡️ Risk         ตรวจ sizing/stop      → "size 1%, stop 45,000"
       ├─ 📉 Monitor      ดู win-rate trend     → "strategy ยังเสถียร" (stub)
       ├─ 🔍 Exec Review  ดู slippage/fill      → "เข้าที่ราคาดี" (stub)
       └─ 🎯 Coach        รวมทุกมุม + stats     → "เข้าเพราะ EMA cross + ข่าวบวก" + journal
            → แสดง /office (speech bubble + slot) + Live Chat feed
```
reuse [graph.py](../backend/app/agents/graph.py) — advisory agents เป็น LLM nodes, Trader เป็น node deterministic (เรียก engine ตรง ไม่ผ่าน LLM)
ระบบ slot ใน [StaticOffice.tsx](../frontend/src/components/office/StaticOffice.tsx) รองรับหลายตัวพูดพร้อมกันอยู่แล้ว (MAX_SPEAKERS) — รองรับ 7 ตัวได้

### การมองเห็นบน /office
- 🤖 Trader = ตัวละครที่ขยับ/เด้ง bubble ตอนเปิด-ปิดดีล (เช่น "📈 เปิด LONG BTC 45,000")
- advisory = ตัวละครพูดสิ่งที่วิเคราะห์
- ระบบ streaming bubble + slot มีอยู่แล้วใน [StaticOffice.tsx](../frontend/src/components/office/StaticOffice.tsx)
- Live Chat feed = [FloatingAgentChat.tsx](../frontend/src/components/office/FloatingAgentChat.tsx)
- WebSocket push real-time เมื่อมีดีล/สัญญาณใหม่

---

## 5. Paper Trading — Journal, Stats, Scanner, Watchlist

### 5.1 Trade Journal (เก็บเหตุผลทุกเทรด)
```python
class PaperTrade(Base):
    id: str; symbol: str; strategy: str; side: str
    entry_at: datetime; entry_price: Decimal; size: Decimal
    exit_at: datetime|None; exit_price: Decimal|None
    exit_reason: str|None        # take_profit/stop_loss/signal_exit/eod
    pnl: Decimal|None; pnl_pct: float|None; fee: Decimal
    result: str|None             # WIN/LOSS/BREAKEVEN
    r_multiple: float|None       # กำไร/ขาดทุน เป็นกี่เท่าของ risk
    # --- snapshot ณ เวลาเข้า (เพื่อย้อนวิเคราะห์) ---
    rationale: str               # คำอธิบายจาก Explainer
    indicators: dict             # {rsi,ema,adx,atr,...}
    regime: str
    validation: dict             # rejected_by / passed
    sentiment: dict|None
    confidence: float
```

### 5.2 Performance Stats (ประเมิน algorithm)
| Metric | เกณฑ์ดี |
|---|---|
| Win rate | — (อย่าดูตัวเดียว) |
| **Profit Factor** | > 1.5 |
| **Expectancy** | > 0 |
| Avg R-multiple | > 0 |
| Max Drawdown | ยิ่งต่ำยิ่งดี |
| Sharpe | > 1 |

> Win rate สูงไม่ได้แปลว่าดี — Profit Factor + Expectancy สำคัญกว่า

### 5.3 ปรับปรุง — slice stats ตามมิติ
```
ตาม strategy → ปิดกลยุทธ์ที่ขาดทุน
ตาม regime   → เพิ่ม regime filter ถ้าพังบางสภาพตลาด
ตาม symbol   → จำกัด watchlist
ตาม exit_reason → stop แคบ/กว้างไป
ตาม sentiment → เพิ่ม sentiment filter
ตามเวลา      → เลี่ยงช่วง volatile
```
Coach Agent อ่าน stats → สรุปข้อเสนอปรับ rule (คนอนุมัติ)

### 5.4 Watchlist (กำหนดเหรียญเอง)
```python
class Watchlist(Base):
    id: str; workspace_id: str; symbol: str
    enabled: bool; strategies: list[str]; added_at: datetime
```

### 5.5 Signal Scanner (แนะนำเหรียญน่าเทรด)
วน scan watchlist → indicator + strategy + validator → จัดอันดับตามความแรง
```python
@dataclass
class ScanResult:
    symbol: str; signal: str; strength: float    # 0..1
    strategy: str; regime: str; reason: str
    warnings: list[str]; price: Decimal; scanned_at: datetime
```
แสดงเป็นตารางจัดอันดับ (BUY/SELL/HOLD + ความแรง + เหตุผล + เตือน) บน dashboard

---

## 5.6 Intelligence Effectiveness — วัดว่า "ตัวช่วย" มีผลกับการเทรดจริงไหม

> เป้าหมาย: เก็บ output ของตัวช่วยทุกชิ้น (ข่าว / sentiment / สรุปตลาด / คำอธิบายสัญญาณ)
> เป็น record ถาวร แล้ว **พิสูจน์ด้วยตัวเลข** ว่ามันช่วยให้เทรดดีขึ้นจริง หรือเป็นแค่ noise

### 5.6.1 เก็บ output ของตัวช่วยเป็น record

```python
class IntelInsight(Base):
    id: str; workspace_id: str
    kind: str                 # "news" | "sentiment" | "market_summary" | "signal_explain"
    symbol: str               # เกี่ยวกับเหรียญไหน
    created_at: datetime       # UTC — สำคัญสำหรับ point-in-time
    # --- เนื้อหา ---
    content: str              # ข้อความสรุป/อธิบาย
    score: float | None       # sentiment -1..+1 / strength 0..1
    stance: str | None        # "bullish" | "bearish" | "neutral"
    confidence: float
    impact: str | None        # high/medium/low
    sources: list[str]        # URL ข่าว (กัน hallucination, ตรวจย้อนได้)
    agent: str                # agent ตัวไหนสร้าง
    # --- ตัวเชื่อมเพื่อทำ attribution ---
    linked_trade_id: str | None   # ถ้านำไปสู่/เกี่ยวกับเทรดไหน
    forward_return_15m: float | None   # ผลตอบแทนราคา +15m หลัง insight (เติมภายหลัง)
    forward_return_1h: float | None
    forward_return_4h: float | None
    was_correct: bool | None      # stance ตรงกับทิศราคาที่เกิดจริงไหม
```

> ทุก insight ผูกกับ `created_at` + `symbol` → ระบบเติม `forward_return_*` ให้อัตโนมัติเมื่อเวลาผ่านไป
> ทำให้วัดได้ว่า "ตอน sentiment บอก bullish ราคาขึ้นจริงไหม"

### 5.6.2 Metrics วัดคุณค่าของตัวช่วย

| Metric | คำนวณยังไง | บอกอะไร |
|---|---|---|
| **Hit Rate** | % ที่ stance ตรงกับทิศราคาจริง (forward return) | ตัวช่วยทายถูกบ่อยไหม |
| **Information Coefficient (IC)** | correlation(score, forward_return) | sentiment มี predictive power ไหม (>0.05 = มีค่า) |
| **Lead time** | นานแค่ไหนก่อนราคาตอบสนอง | ข่าว price-in ไปแล้วหรือยังทัน |
| **Warning precision** | ดีลที่ Explainer "เตือน" → แพ้จริงกี่ % | คำเตือนแม่นไหม |

### 5.6.3 Attribution — ตัวช่วยทำให้ "ผลเทรด" ดีขึ้นไหม (สำคัญสุด)

เปรียบเทียบผลเทรดแบบจับคู่:

```
1) เทรดที่ "สอดคล้อง" sentiment  vs  "สวน" sentiment
   → win rate / avg R ต่างกันไหม?

2) เทรดที่ Explainer เตือน  vs  ไม่เตือน
   → ดีลที่เตือนแพ้มากกว่าจริงไหม? (ถ้าใช่ → ควรเชื่อคำเตือน)

3) Counterfactual: "ถ้าข้ามดีลที่ถูกเตือนทั้งหมด"
   → PnL รวมจะดีขึ้น/แย่ลงเท่าไร?

4) Lift: PnL ของกลยุทธ์ "เปิด sentiment filter" vs "ปิด"
   → ตัวช่วยเพิ่มกำไรสุทธิจริงไหม (หลังหัก noise)
```

```python
class IntelEffectivenessReport:
    kind: str                 # วัดตัวช่วยชนิดไหน
    period: tuple[datetime, datetime]
    hit_rate: float
    information_coefficient: float
    # attribution
    win_rate_aligned: float       # เทรดสอดคล้อง insight
    win_rate_against: float       # เทรดสวน insight
    warning_precision: float
    pnl_lift: float               # กำไรส่วนเพิ่มจากการใช้ตัวช่วย
    verdict: str                  # "มีผลบวก" | "ไม่มีผล" | "มีผลลบ"
    recommendation: str           # เช่น "เพิ่มน้ำหนัก sentiment ใน BTC, ลดใน altcoin"
```

### 5.6.4 บทสรุปอัตโนมัติ (Coach Agent)

Coach อ่าน `IntelEffectivenessReport` → สรุปเป็นภาษาคนเป็นรอบ (เช่นรายสัปดาห์):
> *"สัปดาห์นี้: News sentiment IC = 0.11 (มีค่าพอควร) — เทรดที่สอดคล้อง sentiment ชนะ 64% vs สวน 41%.
> คำเตือนของ Explainer precision 72% (น่าเชื่อ) ถ้าข้ามดีลที่ถูกเตือน PnL จะ +8%.
> **ข้อเสนอ:** ยกระดับ sentiment จาก advisory → risk filter (โหมด B) สำหรับ BTC/ETH
> แต่คงเป็น advisory สำหรับ altcoin เพราะ IC ต่ำ (0.02)"*

นี่คือ loop พิสูจน์คุณค่าของ AI: **ใช้ตัวช่วย → เก็บ insight → วัดผลกับเทรดจริง → รู้ว่าตัวไหนคุ้ม → ปรับน้ำหนัก**

> ⚠️ ระวัง: ต้องมี sample size พอ (หลายสิบดีล) ก่อนสรุป — ตัดสินจาก 5 ดีลคือ noise ไม่ใช่ signal

---

## 6. Tech Stack

### มีอยู่แล้ว (reuse)
FastAPI, SQLAlchemy async, Alembic, PostgreSQL, Redis, LangGraph/LangChain,
RAG (embeddings JSON), WebSocket, Next 15 + Tailwind + Zustand + Phaser, observability/audit

### เพิ่ม — backend
```txt
# data & compute
pandas, numpy, scipy, pandas-ta      # ⚠️ ไม่ใช้ TA-Lib (compile ยากบน Windows)
# models (Phase ML)
scikit-learn, xgboost, hmmlearn, joblib   # XGBoost = default (robust กับ overfit, data เล็ก-กลาง)
# backtest & portfolio
vectorbt, quantstats, PyPortfolioOpt
# execution & infra
websockets, tenacity, APScheduler
# intelligence
feedparser, beautifulsoup4
```
### เพิ่ม — frontend
```
lightweight-charts   # กราฟแท่งเทียน TradingView
```
### Time-series storage
เริ่ม Postgres table ธรรมดา → อัป **TimescaleDB** (extension) เมื่อ data เยอะ

> **เริ่ม lean:** `pandas numpy pandas-ta vectorbt httpx APScheduler` พอทำ Phase 1–2
> ของ ML/distributed/deep-learning เพิ่มทีหลัง อย่า over-engineer

---

## 7. Roadmap — ตัวละครครบ 7 ตั้งแต่แรก แล้วโตไปด้วยกัน

> แนวทาง: วาง **agent framework + /office UI ครบ 7 ตัว** ตั้งแต่ Phase 1 (บางตัวเป็น stub)
> แล้วแต่ละ Phase เติม "เนื้อหาจริง" ให้ตัวละครเข้มขึ้น — ปรับจูนทั้งทีมไปพร้อมกัน

| Phase | Quant Core / Data | ตัวละคร (7 ตัวอยู่ครบ) | ผลลัพธ์ |
|---|---|---|---|
| **0 Foundation** | DB models ทั้งหมด + Alembic + Broker interface + **agent orchestrator skeleton (7 nodes)** | โครงตัวละครครบ (ยังพูด stub) | โครงพร้อม |
| **1 Data + Indicator + UI** | Bitkub OHLCV **ครบ 4 TF (1D/4H/1H/15M)** + Indicator Engine + MTFSnapshot + Watchlist CRUD | 7 ตัวละครบน /office, 📊 Analyst สร้าง Daily Brief จริง, ที่เหลือ stub | เห็นราคา 4 TF + Daily Brief + ทีมครบบนจอ |
| **2 Strategy + Scanner** | EMA pullback MTF (top-down cascade) + Validator + Scanner + backtest | 📊 Analyst + 🎯 Coach (อธิบายสัญญาณ MTF) พูดจริง | สัญญาณคุณภาพ + ตารางแนะนำ + คำอธิบาย |
| **3 Paper Trading** | PaperBroker + Risk + OMS + Journal + Stats | 🤖 Trader + 🛡️ Risk + 🎯 Coach เต็มรูป | เทรดจำลอง + Win/Loss + เหตุผล |
| **4 Intelligence** | News feed + Sentiment + IntelInsight log | 📰 News & Sentiment เต็มรูป | ข่าว+sentiment ผูกกับเทรด |
| **4.5 Effectiveness** | forward_return + Attribution report | 🎯 Coach สรุปคุณค่าตัวช่วย | รู้ว่าตัวช่วยตัวไหนคุ้ม |
| **5 ML Ensemble** | Regime + XGBoost + Combiner + walk-forward | 📉 Model Monitor เต็มรูป (จับ decay) | หลายโมเดลรวมสัญญาณ |
| **6 Live** | BitkubBroker (HMAC) + kill switch + IP whitelist | 🔍 Execution Reviewer เต็มรูป (TCA จริง) | เทรดจริง (เมื่อ paper พิสูจน์แล้ว) |

> **Phase 1 = ทดสอบทีมครบ 7 ตัวบน /office** — Analyst พูดจาก indicator จริง, อีก 6 ตัวเป็น stub ที่ pipeline+ช่องพูดพร้อม
> ทุก Phase ถัดไปแค่ "เติมสมอง" ให้ตัวที่ยัง stub ไม่ต้องเพิ่มตัวละคร/รื้อ UI

---

## 8. Security & Production checklist

- [ ] API secret ใน env เท่านั้น — ห้าม commit
- [ ] Bitkub private key: จำกัดสิทธิ์ + IP whitelist (เฉพาะ live)
- [ ] Idempotency: order มี client-id กัน double-submit ตอน reconnect
- [ ] Decimal + ปัดตาม min lot/price ของ Bitkub
- [ ] Rate limit: เคารพ limit + backoff (tenacity)
- [ ] Kill switch: ชน daily loss → หยุดอัตโนมัติ + alert
- [ ] Audit log ทุก decision + order (reuse audit ที่มีอยู่)
- [ ] Backtest: point-in-time, walk-forward, out-of-sample — กัน look-ahead & overfit
- [ ] ⚠️ คริปโตผันผวนสูง อาจขาดทุนทั้งหมด — paper ให้นานพอก่อนเสมอ

---

## 9. หมายเหตุ Bitkub API

- **Public API** (ราคา, OHLCV, orderbook) — ไม่ต้อง key ใช้ตั้งแต่ paper
- **Private API** (พอร์ต, ส่งออเดอร์) — ต้อง API key + **HMAC SHA-256 signature** ใช้เฉพาะ live
- ไม่มี official Python SDK ที่ดี → เขียน client เองด้วย `httpx` + `hmac`/`hashlib`
- fee เทรด ~0.25% — กระทบกลยุทธ์ที่เทรดถี่ (scalping) อย่างมาก ต้องคำนวณใน PaperBroker ให้สมจริง
