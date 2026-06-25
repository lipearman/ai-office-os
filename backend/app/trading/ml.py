"""ML ensemble (XGBoost + Logistic) — predict P(price up over next H bars).

Used as an extra *vote* on top of the deterministic rule strategy
(ensemble: enter only when rule AND model agree). Evaluated WALK-FORWARD
(TimeSeriesSplit) so the reported edge is out-of-sample, never in-sample.

HUMAN GATE: this produces evidence (OOS metrics + rule-vs-ensemble compare).
It does not change the live strategy or trade by itself.
"""
from __future__ import annotations

import warnings

import numpy as np
import pandas as pd

from app.trading.bitkub import Candle
from app.trading.indicators import indicator_frame
from app.trading.backtest import BacktestParams, prepare, simulate, _compute_stats

warnings.filterwarnings("ignore")

FEATURES = [
    "f_rsi", "f_adx", "f_macd_hist", "f_vol",
    "f_close_ema20", "f_ema20_50", "f_ema50_200", "f_atr", "f_bb",
]


def _features(df: pd.DataFrame) -> pd.DataFrame:
    out = pd.DataFrame(index=df.index)
    out["f_rsi"] = df["rsi14"] / 100.0
    out["f_adx"] = df["adx14"] / 100.0
    out["f_macd_hist"] = df["macd_hist"] / df["close"]
    out["f_vol"] = df["volume_ratio"]
    out["f_close_ema20"] = df["close"] / df["ema20"] - 1.0
    out["f_ema20_50"] = df["ema20"] / df["ema50"] - 1.0
    out["f_ema50_200"] = df["ema50"] / df["ema200"] - 1.0
    out["f_atr"] = df["atr14"] / df["close"]
    bb_range = (df["bb_upper"] - df["bb_lower"]).replace(0, np.nan)
    out["f_bb"] = (df["close"] - df["bb_lower"]) / bb_range
    return out


def _label(df: pd.DataFrame, horizon: int, fee: float) -> pd.Series:
    fwd = df["close"].shift(-horizon) / df["close"] - 1.0
    return (fwd > 2 * fee).astype(float)   # up enough to beat round-trip fee


def _models():
    from xgboost import XGBClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler
    from sklearn.pipeline import make_pipeline

    xgb = XGBClassifier(
        n_estimators=80, max_depth=3, learning_rate=0.07,
        subsample=0.8, colsample_bytree=0.8, reg_lambda=1.0,
        eval_metric="logloss", n_jobs=4, verbosity=0,
    )
    logit = make_pipeline(StandardScaler(), LogisticRegression(max_iter=500, C=1.0))
    return xgb, logit


def ml_vote(candles: list[Candle], horizon: int = 8) -> float | None:
    """P(up over next `horizon` bars) for the LATEST closed bar.

    Trains the ensemble on all rows that have a (past) label, then predicts the
    current bar. Returns a probability in [0,1], or None if there isn't enough
    data / a dep fails. HEAVY (fits XGBoost) — call from a cached/background path,
    never inline in the scan. This is a confirm/veto vote, not a standalone signal.
    """
    try:
        df = indicator_frame(candles, closed_only=True).reset_index(drop=True)
        feats = _features(df).replace([np.inf, -np.inf], np.nan)
        label = _label(df, horizon, BacktestParams().fee)
        train = feats.copy()
        train["y"] = label
        train = train.dropna()
        if len(train) < 300:
            return None
        X = train[FEATURES].to_numpy()
        y = train["y"].to_numpy()
        latest = feats.dropna()
        if latest.empty:
            return None
        x_pred = latest[FEATURES].to_numpy()[-1:].astype(float)
        xgb, logit = _models()
        xgb.fit(X, y)
        logit.fit(X, y)
        p = 0.5 * xgb.predict_proba(x_pred)[:, 1] + 0.5 * logit.predict_proba(x_pred)[:, 1]
        return float(p[0])
    except Exception:
        return None


def ml_report(candles: list[Candle], horizon: int = 8, n_splits: int = 3) -> dict:
    from sklearn.model_selection import TimeSeriesSplit
    from sklearn.metrics import accuracy_score, roc_auc_score

    df = indicator_frame(candles, closed_only=True).reset_index(drop=True)
    symbol = candles[0].symbol if candles else "?"
    timeframe = candles[0].timeframe if candles else "?"

    feats = _features(df)
    label = _label(df, horizon, BacktestParams().fee)
    data = feats.copy()
    data["y"] = label
    data = data.replace([np.inf, -np.inf], np.nan).dropna()
    if len(data) < 300:
        return {"symbol": symbol, "timeframe": timeframe,
                "error": "ข้อมูลไม่พอสำหรับ ML (ต้องการประวัติยาวกว่านี้)"}

    X = data[FEATURES].to_numpy()
    y = data["y"].to_numpy()
    orig_idx = data.index.to_numpy()    # map back to df rows

    # ── walk-forward OOS predictions ──
    tss = TimeSeriesSplit(n_splits=n_splits)
    oos_pred = np.full(len(df), np.nan)
    accs, aucs = [], []
    for tr, te in tss.split(X):
        xgb, logit = _models()
        xgb.fit(X[tr], y[tr])
        logit.fit(X[tr], y[tr])
        p = 0.5 * xgb.predict_proba(X[te])[:, 1] + 0.5 * logit.predict_proba(X[te])[:, 1]
        # metrics
        try:
            aucs.append(roc_auc_score(y[te], p))
        except ValueError:
            pass
        accs.append(accuracy_score(y[te], (p >= 0.5).astype(int)))
        # store predictions at the original df indices
        for j, te_i in enumerate(te):
            oos_pred[orig_idx[te_i]] = p[j]

    # ── final model (all data) + feature importance ──
    xgb, logit = _models()
    xgb.fit(X, y)
    importance = sorted(
        zip(FEATURES, [float(v) for v in xgb.feature_importances_]),
        key=lambda kv: -kv[1],
    )

    # ── ensemble vs rule-only, over the OOS region (honest) ──
    C = prepare(df)
    ml_prob = np.where(np.isnan(oos_pred), 0.5, oos_pred)
    pred_idx = np.where(~np.isnan(oos_pred))[0]
    compare = None
    ml_threshold = 0.5
    if len(pred_idx) > 0:
        lo, hi = int(pred_idx[0]), int(pred_idx[-1]) + 1
        # adaptive threshold: keep the higher-confidence half of signals
        # (a fixed 0.5 filters everything in a downtrend where P(up) is low)
        ml_threshold = float(np.clip(np.nanmedian(oos_pred), 0.30, 0.70))
        params = BacktestParams(use_validator=True)
        rule_only, _ = _compute_stats(simulate(C, params, lo, hi))
        ensemble, _ = _compute_stats(
            simulate(C, params, lo, hi, ml_prob=ml_prob, ml_threshold=ml_threshold)
        )
        compare = {
            "oos_bars": hi - lo,
            "ml_threshold": round(ml_threshold, 3),
            "rule_only": {k: rule_only.get(k) for k in
                          ("total_trades", "win_rate", "profit_factor", "total_return_pct")},
            "ensemble": {k: ensemble.get(k) for k in
                         ("total_trades", "win_rate", "profit_factor", "total_return_pct")},
        }

    base_rate = float(np.mean(y))          # how often "up" happens (baseline)
    mean_auc = round(float(np.mean(aucs)), 3) if aucs else None
    mean_acc = round(float(np.mean(accs)), 3) if accs else None

    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "horizon": horizon,
        "samples": int(len(data)),
        "base_rate_up": round(base_rate, 3),
        "walk_forward": {"accuracy": mean_acc, "auc": mean_auc, "splits": n_splits},
        "feature_importance": [{"feature": f, "importance": round(v, 3)} for f, v in importance],
        "ensemble_compare": compare,
        "verdict": _verdict(mean_auc, compare),
        "human_gate": "ML เป็นเพียง 'เสียงโหวต' ช่วยกรอง — ไม่เทรดเอง ต้องคนอนุมัติ",
    }


def _verdict(auc: float | None, compare: dict | None) -> str:
    parts = []
    if auc is None:
        return "⚠️ ประเมิน AUC ไม่ได้ (ข้อมูลไม่พอ/คลาสไม่สมดุล)"
    if auc >= 0.58:
        parts.append(f"✅ โมเดลมีสัญญาณพยากรณ์ (AUC {auc})")
    elif auc >= 0.52:
        parts.append(f"🟡 มีสัญญาณอ่อน ๆ (AUC {auc}) — ระวัง noise")
    else:
        parts.append(f"🔴 แทบไม่มีสัญญาณ (AUC {auc}≈สุ่ม) — ML ยังไม่ช่วย")
    if compare:
        r = compare["rule_only"].get("profit_factor")
        e = compare["ensemble"].get("profit_factor")
        if r is not None and e is not None:
            if e > r + 0.1:
                parts.append(f"ensemble ดีกว่า rule-only (PF {e} vs {r})")
            elif e < r - 0.1:
                parts.append(f"ensemble แย่กว่า rule-only (PF {e} vs {r})")
            else:
                parts.append(f"ensemble ≈ rule-only (PF {e} vs {r})")
    return " · ".join(parts)
